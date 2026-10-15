const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, newId, now, mapUser } = require('../database');
const auth = require('../middleware/auth');
const asyncH = require('../middleware/asyncHandler');

const sign = (user) => jwt.sign(
  { id: user.id, name: user.name, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
);

router.post('/login', asyncH(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username).trim());
  if (!user || !await bcrypt.compare(String(password), user.password_hash)) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  res.json({
    token: sign(user),
    user: { id: user.id, name: user.name, role: user.role },
  });
}));

router.get('/me', auth(), (req, res) => res.json(req.user));

router.get('/users', auth(['admin']), asyncH(async (req, res) => {
  res.json(db.prepare('SELECT id, name, username, role, created_at, updated_at FROM users ORDER BY name COLLATE NOCASE')
    .all().map(mapUser));
}));

router.post('/register', auth(['admin']), asyncH(async (req, res) => {
  const { name, username, password, role } = req.body;
  if (typeof name !== 'string' || !name.trim() || typeof username !== 'string' || !username.trim()
    || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'Name, username and a password of at least 6 characters are required' });
  }
  const normalizedUsername = username.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(normalizedUsername)) {
    return res.status(409).json({ message: 'Username already taken' });
  }

  const id = newId();
  const timestamp = now();
  try {
    db.prepare(`INSERT INTO users (id, name, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, name.trim(), normalizedUsername, await bcrypt.hash(password, 10),
      role === 'admin' ? 'admin' : 'cashier', timestamp, timestamp,
    );
  } catch (error) {
    if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Username already taken' });
    }
    throw error;
  }
  const user = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  res.status(201).json({ id: user._id, name: user.name, username: user.username, role: user.role });
}));

module.exports = router;
