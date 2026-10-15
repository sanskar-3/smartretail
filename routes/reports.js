const router = require('express').Router();
const { db, round2 } = require('../database');
const auth = require('../middleware/auth');
const asyncH = require('../middleware/asyncHandler');

const toCSV = (rows) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((row) => cols.map((col) => cell(row[col])).join(','))].join('\n');
};

const sendCSV = (res, name, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(toCSV(rows));
};

const respond = (req, res, name, rows, extra = {}) =>
  req.query.format === 'csv' ? sendCSV(res, name, rows) : res.json({ ...extra, rows });

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
const dayRange = (dateString) => {
  const value = dateString || new Date().toLocaleDateString('en-CA');
  if (!validDate(value)) {
    const error = new Error('Date must use YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }
  const [year, month, day] = value.split('-').map(Number);
  const from = new Date(year, month - 1, day);
  return [from.toISOString(), new Date(year, month - 1, day + 1).toISOString()];
};

const monthRange = (monthString) => {
  const value = monthString || new Date().toLocaleDateString('en-CA').slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    const error = new Error('Month must use YYYY-MM format');
    error.status = 400;
    throw error;
  }
  const [year, month] = value.split('-').map(Number);
  return {
    label: value,
    from: new Date(year, month - 1, 1).toISOString(),
    to: new Date(year, month, 1).toISOString(),
  };
};

const totals = (from, to) => {
  const row = db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(subtotal), 0) AS subtotal,
    COALESCE(SUM(tax), 0) AS tax, COALESCE(SUM(total), 0) AS total
    FROM orders WHERE created_at >= ? AND created_at < ?`).get(from, to);
  return {
    orders: row.orders, subtotal: round2(row.subtotal), tax: round2(row.tax), total: round2(row.total),
  };
};

const topProducts = (from, to, limit = 10) => db.prepare(`SELECT oi.name AS name,
    SUM(oi.qty) AS qtySold, ROUND(SUM(oi.amount), 2) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ? AND o.created_at < ?
    GROUP BY oi.product_id, oi.name ORDER BY qtySold DESC, revenue DESC LIMIT ?`)
  .all(from, to, limit).map((row) => ({
    name: row.name, qtySold: row.qtySold, revenue: round2(row.revenue),
  }));

const dayRows = (from, to) => db.prepare(`SELECT o.*, c.name AS customer_name
  FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.created_at >= ? AND o.created_at < ? ORDER BY o.created_at`)
  .all(from, to).map((order) => ({
    invoiceNo: order.invoice_no,
    time: new Date(order.created_at).toLocaleTimeString(),
    customer: order.customer_name || 'Walk-in',
    paymentMode: order.payment_mode,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
  }));

router.get('/summary', auth(), asyncH(async (req, res) => {
  const [from, to] = dayRange();
  const inventory = db.prepare(`SELECT COUNT(*) AS productCount,
    SUM(CASE WHEN stock <= reorder_level THEN 1 ELSE 0 END) AS lowStock
    FROM products WHERE is_active = 1`).get();
  const output = {
    productCount: inventory.productCount,
    lowStock: inventory.lowStock || 0,
    today: null,
    top: [],
  };
  if (req.user.role === 'admin') {
    output.today = totals(from, to);
    output.top = topProducts(from, to, 5);
  }
  res.json(output);
}));

router.get('/daily', auth(['admin']), asyncH(async (req, res) => {
  const date = req.query.date || new Date().toLocaleDateString('en-CA');
  const [from, to] = dayRange(date);
  const rows = dayRows(from, to);
  if (req.query.format === 'csv') return sendCSV(res, `daily-sales-${date}`, rows);

  const byPayment = db.prepare(`SELECT payment_mode AS paymentMode, COUNT(*) AS orders,
    ROUND(SUM(total), 2) AS total FROM orders WHERE created_at >= ? AND created_at < ?
    GROUP BY payment_mode ORDER BY payment_mode`).all(from, to)
    .map((row) => ({ ...row, total: round2(row.total) }));
  res.json({
    date, summary: totals(from, to), top: topProducts(from, to),
    byPayment, rows,
  });
}));

router.get('/monthly', auth(['admin']), asyncH(async (req, res) => {
  const range = monthRange(req.query.month);
  const orders = db.prepare(`SELECT created_at, tax, total FROM orders
    WHERE created_at >= ? AND created_at < ? ORDER BY created_at`)
    .all(range.from, range.to);
  const perDay = new Map();
  for (const order of orders) {
    const date = new Date(order.created_at).toLocaleDateString('en-CA');
    const entry = perDay.get(date) || { date, orders: 0, tax: 0, total: 0 };
    entry.orders += 1;
    entry.tax += order.tax;
    entry.total += order.total;
    perDay.set(date, entry);
  }
  const rows = [...perDay.values()].map((row) => ({
    ...row, tax: round2(row.tax), total: round2(row.total),
  }));
  if (req.query.format === 'csv') return sendCSV(res, `monthly-sales-${range.label}`, rows);
  res.json({
    month: range.label,
    summary: totals(range.from, range.to),
    top: topProducts(range.from, range.to),
    rows,
  });
}));

router.get('/top-products', auth(['admin']), asyncH(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(0);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return res.status(400).json({ message: 'A valid start date before the end date is required' });
  }
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 100));
  respond(req, res, 'top-products', topProducts(from.toISOString(), to.toISOString(), limit));
}));

router.get('/low-stock', auth(), asyncH(async (req, res) => {
  const rows = db.prepare(`SELECT sku, name, category, stock, reorder_level AS reorderLevel
    FROM products WHERE is_active = 1 AND stock <= reorder_level ORDER BY stock, name COLLATE NOCASE`)
    .all();
  respond(req, res, 'low-stock', rows);
}));

router.get('/customers', auth(['admin']), asyncH(async (req, res) => {
  const rows = db.prepare(`SELECT c.name, c.phone, COUNT(o.id) AS orders,
    ROUND(SUM(o.total), 2) AS totalSpent, MAX(o.created_at) AS lastPurchase
    FROM orders o JOIN customers c ON c.id = o.customer_id
    GROUP BY c.id ORDER BY totalSpent DESC`)
    .all().map((row) => ({ ...row, totalSpent: round2(row.totalSpent) }));
  respond(req, res, 'customer-wise-sales', rows);
}));

module.exports = router;
