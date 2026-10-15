require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, newId, now, transaction } = require('./database');

const products = [
  { sku: 'GRC-001', name: 'Basmati Rice 1kg', category: 'Grocery', price: 110, tax: 5, stock: 60, reorder: 15 },
  { sku: 'GRC-002', name: 'Toor Dal 1kg', category: 'Grocery', price: 145, tax: 5, stock: 40, reorder: 10 },
  { sku: 'GRC-003', name: 'Sugar 1kg', category: 'Grocery', price: 48, tax: 5, stock: 80, reorder: 20 },
  { sku: 'GRC-004', name: 'Sunflower Oil 1L', category: 'Grocery', price: 160, tax: 5, stock: 30, reorder: 10 },
  { sku: 'DRY-001', name: 'Milk 500ml', category: 'Dairy', price: 30, tax: 0, stock: 50, reorder: 20 },
  { sku: 'DRY-002', name: 'Paneer 200g', category: 'Dairy', price: 90, tax: 5, stock: 12, reorder: 8 },
  { sku: 'SNK-001', name: 'Biscuits Pack', category: 'Snacks', price: 20, tax: 12, stock: 100, reorder: 25 },
  { sku: 'SNK-002', name: 'Potato Chips 50g', category: 'Snacks', price: 20, tax: 12, stock: 90, reorder: 25 },
  { sku: 'BEV-001', name: 'Tea Powder 250g', category: 'Beverages', price: 125, tax: 5, stock: 35, reorder: 10 },
  { sku: 'HHD-001', name: 'Detergent Powder 1kg', category: 'Household', price: 120, tax: 18, stock: 25, reorder: 10 },
  { sku: 'HHD-002', name: 'Bath Soap', category: 'Household', price: 38, tax: 18, stock: 6, reorder: 15 },
];

try {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed is disabled by default. Set ALLOW_DEMO_SEED=true only for a fresh development database.');
  }
  const counts = ['users', 'products', 'customers', 'orders', 'stock_logs']
    .map((table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  if (counts.some((count) => count > 0)) {
    throw new Error('Refusing to seed a non-empty database. Demo seeding never overwrites existing store data.');
  }

  const timestamp = now();
  const insertUser = db.prepare(`INSERT INTO users (id, name, username, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertProduct = db.prepare(`INSERT INTO products
    (id, sku, name, category, price, tax_rate, stock, reorder_level, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCustomer = db.prepare(`INSERT INTO customers (id, name, phone, address, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const insertLog = db.prepare(`INSERT INTO stock_logs
    (id, product_id, type, quantity, reference, created_by, created_at)
    VALUES (?, ?, 'purchase', ?, 'Opening stock', ?, ?)`);
  const adminId = newId();

  transaction(() => {
    insertUser.run(adminId, 'Store Owner', 'admin', bcrypt.hashSync('admin123', 10), 'admin', timestamp, timestamp);
    insertUser.run(newId(), 'Counter 1', 'cashier', bcrypt.hashSync('cashier123', 10), 'cashier', timestamp, timestamp);

    for (const product of products) {
      const productId = newId();
      insertProduct.run(
        productId, product.sku, product.name, product.category, product.price,
        product.tax, product.stock, product.reorder, timestamp, timestamp,
      );
      insertLog.run(newId(), productId, product.stock, adminId, timestamp);
    }

    insertCustomer.run(newId(), 'Amit Kulkarni', '9800000001', 'Ravet, Pune', timestamp, timestamp);
    insertCustomer.run(newId(), 'Neha Patil', '9800000002', 'Akurdi, Pune', timestamp, timestamp);
  });

  console.log('Seeded.  admin / admin123   |   cashier / cashier123');
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
