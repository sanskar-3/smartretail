require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, newId, now } = require('./database');

try {
  const { INITIAL_ADMIN_NAME, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD } = process.env;
  if (!INITIAL_ADMIN_NAME || !INITIAL_ADMIN_USERNAME || !INITIAL_ADMIN_PASSWORD) {
    throw new Error('Set INITIAL_ADMIN_NAME, INITIAL_ADMIN_USERNAME, and INITIAL_ADMIN_PASSWORD in .env before bootstrapping.');
  }
  if (INITIAL_ADMIN_PASSWORD.length < 12) {
    throw new Error('The initial administrator password must be at least 12 characters.');
  }
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    throw new Error('An account already exists. Initial administrator setup is only allowed on an empty user table.');
  }

  const timestamp = now();
  const username = INITIAL_ADMIN_USERNAME.trim().toLowerCase();
  if (!username) throw new Error('INITIAL_ADMIN_USERNAME cannot be empty.');
  db.prepare(`INSERT INTO users (id, name, username, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', ?, ?)`).run(
    newId(), INITIAL_ADMIN_NAME.trim(), username, bcrypt.hashSync(INITIAL_ADMIN_PASSWORD, 12), timestamp, timestamp,
  );
  console.log(`Created initial administrator "${username}". Remove the bootstrap credentials from the environment.`);
} catch (error) {
  console.error('Administrator setup failed:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
