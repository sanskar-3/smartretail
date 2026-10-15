const router = require('express').Router();
const { db, newId, now, transaction, mapProduct } = require('../database');
const auth = require('../middleware/auth');
const asyncH = require('../middleware/asyncHandler');

const announce = (io, product) => {
  io.emit('stock:update', { id: product._id, stock: product.stock });
  if (product.stock <= product.reorderLevel) {
    io.emit('stock:low', {
      id: product._id, name: product.name, stock: product.stock, reorderLevel: product.reorderLevel,
    });
  }
};

router.post('/stock-in', auth(['admin']), asyncH(async (req, res) => {
  const { productId, qty, note } = req.body;
  const quantity = Number(qty);
  if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) {
    return res.status(400).json({ message: 'Product and a whole-number quantity of 1 or more are required' });
  }
  const timestamp = now();
  let product;
  try {
    product = transaction(() => {
      const result = db.prepare(`UPDATE products SET stock = stock + ?, updated_at = ?
        WHERE id = ? AND is_active = 1`).run(quantity, timestamp, String(productId));
      if (result.changes !== 1) return null;
      db.prepare(`INSERT INTO stock_logs (id, product_id, type, quantity, reference, created_by, created_at)
        VALUES (?, ?, 'purchase', ?, ?, ?, ?)`)
        .run(newId(), String(productId), quantity, typeof note === 'string' && note.trim() ? note.trim() : 'Stock-in', req.user.id, timestamp);
      return mapProduct(db.prepare(`SELECT id, sku, name, category, price, tax_rate, stock, reorder_level,
        created_at, updated_at FROM products WHERE id = ?`).get(String(productId)));
    });
  } catch (error) {
    if (error.code === 'ERR_SQLITE_CONSTRAINT_CHECK') {
      return res.status(400).json({ message: 'Stock quantity exceeds the supported range' });
    }
    throw error;
  }
  if (!product) return res.status(404).json({ message: 'Product not found' });
  announce(req.app.get('io'), product);
  res.status(201).json(product);
}));

router.post('/adjust', auth(['admin']), asyncH(async (req, res) => {
  const { productId, delta, note } = req.body;
  const quantity = Number(delta);
  if (!productId || !Number.isSafeInteger(quantity) || quantity === 0) {
    return res.status(400).json({ message: 'Product and a non-zero whole-number change are required' });
  }
  const timestamp = now();
  const result = transaction(() => {
    const product = db.prepare(`SELECT id, sku, name, category, price, tax_rate, stock, reorder_level,
      created_at, updated_at FROM products WHERE id = ? AND is_active = 1`).get(String(productId));
    if (!product || product.stock + quantity < 0) return null;
    db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?')
      .run(quantity, timestamp, String(productId));
    db.prepare(`INSERT INTO stock_logs (id, product_id, type, quantity, reference, created_by, created_at)
      VALUES (?, ?, 'adjustment', ?, ?, ?, ?)`)
      .run(newId(), String(productId), quantity, typeof note === 'string' && note.trim() ? note.trim() : 'Manual adjustment', req.user.id, timestamp);
    return mapProduct(db.prepare(`SELECT id, sku, name, category, price, tax_rate, stock, reorder_level,
      created_at, updated_at FROM products WHERE id = ?`).get(String(productId)));
  });
  if (!result) return res.status(400).json({ message: 'Product not found or adjustment would make stock negative' });
  announce(req.app.get('io'), result);
  res.status(201).json(result);
}));

router.get('/logs', auth(), asyncH(async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.product) {
    conditions.push('s.product_id = ?');
    params.push(String(req.query.product));
  }
  if (req.query.type && ['sale', 'purchase', 'adjustment'].includes(String(req.query.type))) {
    conditions.push('s.type = ?');
    params.push(String(req.query.type));
  }
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 500));
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT s.*, p.name AS product_name, p.sku AS product_sku,
    u.name AS creator_name FROM stock_logs s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN users u ON u.id = s.created_by
    ${where} ORDER BY s.created_at DESC LIMIT ?`).all(...params, limit);
  res.json(rows.map((row) => ({
    _id: row.id, product: { _id: row.product_id, name: row.product_name, sku: row.product_sku },
    type: row.type, quantity: row.quantity, reference: row.reference,
    createdBy: row.creator_name ? { name: row.creator_name } : null, createdAt: row.created_at,
  })));
}));

module.exports = router;
