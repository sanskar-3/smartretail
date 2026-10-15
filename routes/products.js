const router = require('express').Router();
const { db, newId, now, transaction, mapProduct } = require('../database');
const auth = require('../middleware/auth');
const asyncH = require('../middleware/asyncHandler');

const productFields = `id, sku, name, category, price, tax_rate, stock, reorder_level, created_at, updated_at`;
const findProduct = (id) => mapProduct(db.prepare(`SELECT ${productFields} FROM products WHERE id = ? AND is_active = 1`).get(id));
const validNonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

router.get('/', auth(), asyncH(async (req, res) => {
  const { q, category } = req.query;
  const conditions = ['is_active = 1'];
  const params = [];
  if (category) {
    conditions.push('category = ? COLLATE NOCASE');
    params.push(String(category));
  }
  if (q) {
    conditions.push('(instr(lower(name), lower(?)) > 0 OR instr(lower(sku), lower(?)) > 0 OR instr(lower(category), lower(?)) > 0)');
    params.push(String(q), String(q), String(q));
  }
  const products = db.prepare(`SELECT ${productFields} FROM products WHERE ${conditions.join(' AND ')} ORDER BY name COLLATE NOCASE`)
    .all(...params).map(mapProduct);
  res.json(products);
}));

router.get('/:id', auth(), asyncH(async (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}));

router.post('/', auth(['admin']), asyncH(async (req, res) => {
  const { sku, name, category, price, taxRate = 0, stock = 0, reorderLevel = 10 } = req.body;
  if (![sku, name, category].every((value) => typeof value === 'string' && value.trim())
    || ![price, taxRate, stock, reorderLevel].every(validNonNegative)
    || !Number.isInteger(Number(stock)) || !Number.isInteger(Number(reorderLevel))) {
    return res.status(400).json({ message: 'SKU, name, category, valid price and tax, and whole-number non-negative stock levels are required' });
  }

  const id = newId();
  const timestamp = now();
  try {
    transaction(() => {
      db.prepare(`INSERT INTO products
        (id, sku, name, category, price, tax_rate, stock, reorder_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, sku.trim().toUpperCase(), name.trim(), category.trim(), Number(price),
        Number(taxRate), Number(stock), Number(reorderLevel), timestamp, timestamp,
      );
      if (Number(stock) > 0) {
        db.prepare(`INSERT INTO stock_logs (id, product_id, type, quantity, reference, created_by, created_at)
          VALUES (?, ?, 'purchase', ?, 'Opening stock', ?, ?)`)
          .run(newId(), id, Number(stock), req.user.id, timestamp);
      }
    });
  } catch (error) {
    if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ message: 'SKU already exists' });
    if (error.code === 'ERR_SQLITE_CONSTRAINT_CHECK') return res.status(400).json({ message: 'Product details are invalid' });
    throw error;
  }
  const product = findProduct(id);
  req.app.get('io').emit('product:changed', { id });
  res.status(201).json(product);
}));

router.put('/:id', auth(['admin']), asyncH(async (req, res) => {
  const current = findProduct(req.params.id);
  if (!current) return res.status(404).json({ message: 'Product not found' });
  const next = {
    sku: req.body.sku === undefined ? current.sku : req.body.sku,
    name: req.body.name === undefined ? current.name : req.body.name,
    category: req.body.category === undefined ? current.category : req.body.category,
    price: req.body.price === undefined ? current.price : req.body.price,
    taxRate: req.body.taxRate === undefined ? current.taxRate : req.body.taxRate,
    reorderLevel: req.body.reorderLevel === undefined ? current.reorderLevel : req.body.reorderLevel,
  };
  if (![next.sku, next.name, next.category].every((value) => typeof value === 'string' && value.trim())
    || ![next.price, next.taxRate, next.reorderLevel].every(validNonNegative)
    || !Number.isInteger(Number(next.reorderLevel))) {
    return res.status(400).json({ message: 'SKU, name, category, valid price and tax, and a whole-number reorder level are required' });
  }

  try {
    db.prepare(`UPDATE products SET sku = ?, name = ?, category = ?, price = ?, tax_rate = ?,
      reorder_level = ?, updated_at = ? WHERE id = ? AND is_active = 1`).run(
      next.sku.trim().toUpperCase(), next.name.trim(), next.category.trim(), Number(next.price),
      Number(next.taxRate), Number(next.reorderLevel), now(), req.params.id,
    );
  } catch (error) {
    if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ message: 'SKU already exists' });
    if (error.code === 'ERR_SQLITE_CONSTRAINT_CHECK') return res.status(400).json({ message: 'Product details are invalid' });
    throw error;
  }
  const product = findProduct(req.params.id);
  req.app.get('io').emit('product:changed', { id: product._id });
  res.json(product);
}));

router.delete('/:id', auth(['admin']), asyncH(async (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), product._id);
  req.app.get('io').emit('product:changed', { id: product._id });
  res.json({ message: 'Product deleted' });
}));

module.exports = router;
