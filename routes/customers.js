const router = require('express').Router();
const { db, newId, now, mapCustomer, mapOrder } = require('../database');
const auth = require('../middleware/auth');
const asyncH = require('../middleware/asyncHandler');

const customerFields = 'id, name, phone, address, created_at, updated_at';
const findCustomer = (id) => mapCustomer(db.prepare(`SELECT ${customerFields} FROM customers WHERE id = ?`).get(id));
const getOrdersForCustomer = (customerId) => db.prepare(
  'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC'
).all(customerId).map((order) => {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid').all(order.id)
    .map((item) => ({
      product: item.product_id, name: item.name, qty: item.qty, price: item.price,
      taxRate: item.tax_rate, amount: item.amount,
    }));
  return mapOrder(order, { customer: findCustomer(order.customer_id), items });
});

router.get('/', auth(), asyncH(async (req, res) => {
  const q = req.query.q ? String(req.query.q) : '';
  const customers = q
    ? db.prepare(`SELECT ${customerFields} FROM customers
      WHERE instr(lower(name), lower(?)) > 0 OR instr(lower(phone), lower(?)) > 0
      ORDER BY name COLLATE NOCASE`).all(q, q)
    : db.prepare(`SELECT ${customerFields} FROM customers ORDER BY name COLLATE NOCASE`).all();
  res.json(customers.map(mapCustomer));
}));

router.post('/', auth(['admin', 'cashier']), asyncH(async (req, res) => {
  const { name, phone, address = '' } = req.body;
  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !phone.trim()
    || typeof address !== 'string') {
    return res.status(400).json({ message: 'Name and phone are required; address must be text' });
  }
  const id = newId();
  const timestamp = now();
  try {
    db.prepare(`INSERT INTO customers (id, name, phone, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, name.trim(), phone.trim(), address.trim(), timestamp, timestamp);
  } catch (error) {
    if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'A customer with this phone already exists' });
    }
    if (error.code === 'ERR_SQLITE_CONSTRAINT_CHECK') return res.status(400).json({ message: 'Customer details are invalid' });
    throw error;
  }
  res.status(201).json(findCustomer(id));
}));

router.put('/:id', auth(['admin', 'cashier']), asyncH(async (req, res) => {
  const current = findCustomer(req.params.id);
  if (!current) return res.status(404).json({ message: 'Customer not found' });
  const name = req.body.name === undefined ? current.name : req.body.name;
  const phone = req.body.phone === undefined ? current.phone : req.body.phone;
  const address = req.body.address === undefined ? current.address : req.body.address;
  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !phone.trim()
    || typeof address !== 'string') {
    return res.status(400).json({ message: 'Name and phone are required; address must be text' });
  }
  try {
    db.prepare('UPDATE customers SET name = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?')
      .run(name.trim(), phone.trim(), address.trim(), now(), current._id);
  } catch (error) {
    if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'A customer with this phone already exists' });
    }
    throw error;
  }
  res.json(findCustomer(current._id));
}));

router.delete('/:id', auth(['admin']), asyncH(async (req, res) => {
  const customer = findCustomer(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(customer._id);
  res.json({ message: 'Customer deleted' });
}));

router.get('/:id/history', auth(), asyncH(async (req, res) => {
  const customer = findCustomer(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  const orders = getOrdersForCustomer(customer._id);
  const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
  res.json({ customer, totalSpent: Math.round((totalSpent + Number.EPSILON) * 100) / 100, orders });
}));

module.exports = router;
