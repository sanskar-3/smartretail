const router = require('express').Router();
const { db, newId, now, round2, transaction, mapOrder, mapCustomer } = require('../database');
const auth = require('../middleware/auth');
const asyncH = require('../middleware/asyncHandler');

const getItems = (orderId) => db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid')
  .all(orderId).map((item) => ({
    product: item.product_id, name: item.name, qty: item.qty, price: item.price,
    taxRate: item.tax_rate, amount: item.amount,
  }));

const getOrder = (orderId) => {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!row) return null;
  const customerRow = row.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(row.customer_id)
    : null;
  const billedByRow = row.billed_by
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.billed_by)
    : null;
  return mapOrder(row, {
    customer: mapCustomer(customerRow),
    billedBy: billedByRow ? { _id: billedByRow.id, name: billedByRow.name } : null,
    items: getItems(orderId),
  });
};

router.post('/', auth(['admin', 'cashier']), asyncH(async (req, res) => {
  const { customerId, items, paymentMode = 'cash' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Add at least one item to the bill' });
  }
  if (!['cash', 'upi', 'card'].includes(paymentMode)) {
    return res.status(400).json({ message: 'Invalid payment mode' });
  }
  if (customerId && !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(String(customerId))) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const wanted = new Map();
  for (const item of items) {
    const qty = Number(item.qty);
    if (!item.productId || !Number.isSafeInteger(qty) || qty < 1) {
      return res.status(400).json({ message: 'Each item needs a product and a whole-number quantity of 1 or more' });
    }
    const key = String(item.productId);
    const sum = (wanted.get(key) || 0) + qty;
    if (!Number.isSafeInteger(sum)) {
      return res.status(400).json({ message: 'Requested quantity is too large' });
    }
    wanted.set(key, sum);
  }

  const orderId = newId();
  const timestamp = now();
  const invoiceNo = `INV-${Date.now().toString(36).toUpperCase()}-${newId().slice(0, 4).toUpperCase()}`;
  const stockUpdates = [];
  let subtotal = 0;
  let tax = 0;

  try {
    transaction(() => {
      const lines = [];
      for (const [productId, qty] of wanted) {
        const product = db.prepare(`SELECT id, name, price, tax_rate, stock, reorder_level FROM products
          WHERE id = ? AND is_active = 1`).get(productId);
        if (!product) {
          const error = new Error('Product not found');
          error.status = 400;
          throw error;
        }
        if (product.stock < qty) {
          const error = new Error(`Insufficient stock for "${product.name}" (available: ${product.stock})`);
          error.status = 400;
          throw error;
        }

        const result = db.prepare(`UPDATE products SET stock = stock - ?, updated_at = ?
          WHERE id = ? AND is_active = 1 AND stock >= ?`).run(qty, timestamp, productId, qty);
        if (result.changes !== 1) {
          const error = new Error(`Insufficient stock for "${product.name}"`);
          error.status = 400;
          throw error;
        }
        const amount = round2(product.price * qty);
        subtotal += amount;
        tax += amount * product.tax_rate / 100;
        lines.push({
          productId, name: product.name, qty, price: product.price,
          taxRate: product.tax_rate, amount,
        });
        stockUpdates.push({
          id: productId, stock: product.stock - qty, name: product.name,
          reorderLevel: product.reorder_level,
        });
      }

      subtotal = round2(subtotal);
      tax = round2(tax);
      db.prepare(`INSERT INTO orders
        (id, invoice_no, customer_id, subtotal, tax, total, payment_mode, billed_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        orderId, invoiceNo, customerId || null, subtotal, tax, round2(subtotal + tax),
        paymentMode, req.user.id, timestamp, timestamp,
      );

      const insertItem = db.prepare(`INSERT INTO order_items
        (id, order_id, product_id, name, qty, price, tax_rate, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertLog = db.prepare(`INSERT INTO stock_logs
        (id, product_id, type, quantity, reference, created_by, created_at)
        VALUES (?, ?, 'sale', ?, ?, ?, ?)`);
      for (const line of lines) {
        insertItem.run(newId(), orderId, line.productId, line.name, line.qty, line.price, line.taxRate, line.amount);
        insertLog.run(newId(), line.productId, -line.qty, invoiceNo, req.user.id, timestamp);
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    throw error;
  }

  const io = req.app.get('io');
  for (const product of stockUpdates) {
    io.emit('stock:update', { id: product.id, stock: product.stock });
    if (product.stock <= product.reorderLevel) {
      io.emit('stock:low', {
        id: product.id, name: product.name, stock: product.stock, reorderLevel: product.reorderLevel,
      });
    }
  }
  const order = getOrder(orderId);
  io.emit('order:new', { id: order._id, invoiceNo: order.invoiceNo, total: order.total });
  res.status(201).json(order);
}));

router.get('/', auth(), asyncH(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.user.role === 'cashier') {
    conditions.push('billed_by = ?');
    params.push(req.user.id);
  }
  if (req.query.customer) {
    conditions.push('customer_id = ?');
    params.push(String(req.query.customer));
  }
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT id FROM orders ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit);
  res.json(rows.map((row) => getOrder(row.id)));
}));

router.get('/:id', auth(), asyncH(async (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (req.user.role === 'cashier' && order.billedBy?._id !== req.user.id) {
    return res.status(403).json({ message: 'You can only view your own bills' });
  }
  res.json(order);
}));

module.exports = router;
