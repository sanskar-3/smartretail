const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');

const databasePath = path.resolve(process.env.SQLITE_PATH || path.join(__dirname, 'data', 'smartretail.sqlite'));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath, { timeout: 5000 });
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(username)) > 0),
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(sku)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    category TEXT NOT NULL CHECK (length(trim(category)) > 0),
    price REAL NOT NULL CHECK (price >= 0),
    tax_rate REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 10 CHECK (reorder_level >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS products_name_idx ON products(name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT NOT NULL UNIQUE CHECK (length(trim(phone)) > 0),
    address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    invoice_no TEXT NOT NULL UNIQUE,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    subtotal REAL NOT NULL CHECK (subtotal >= 0),
    tax REAL NOT NULL CHECK (tax >= 0),
    total REAL NOT NULL CHECK (total >= 0),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
    billed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS orders_billed_by_idx ON orders(billed_by, created_at DESC);

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    price REAL NOT NULL CHECK (price >= 0),
    tax_rate REAL NOT NULL CHECK (tax_rate >= 0),
    amount REAL NOT NULL CHECK (amount >= 0)
  );
  CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

  CREATE TABLE IF NOT EXISTS stock_logs (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment')),
    quantity INTEGER NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stock_logs_product_idx ON stock_logs(product_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS stock_logs_created_at_idx ON stock_logs(created_at DESC);
`);

const newId = () => randomUUID();
const now = () => new Date().toISOString();
const round2 = (number) => Math.round((number + Number.EPSILON) * 100) / 100;
const transaction = (callback) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

function mapProduct(row) {
  if (!row) return null;
  return {
    _id: row.id, sku: row.sku, name: row.name, category: row.category,
    price: row.price, taxRate: row.tax_rate, stock: row.stock,
    reorderLevel: row.reorder_level, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapCustomer(row) {
  if (!row) return null;
  return {
    _id: row.id, name: row.name, phone: row.phone, address: row.address,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    _id: row.id, name: row.name, username: row.username, role: row.role,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapOrder(row, { customer = null, billedBy = null, items = [] } = {}) {
  if (!row) return null;
  return {
    _id: row.id, invoiceNo: row.invoice_no, customer, items, subtotal: row.subtotal,
    tax: row.tax, total: row.total, paymentMode: row.payment_mode, billedBy,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

module.exports = { db, databasePath, newId, now, round2, transaction, mapProduct, mapCustomer, mapUser, mapOrder };
