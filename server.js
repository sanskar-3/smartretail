require('dotenv').config();
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { db, databasePath } = require('./database');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_to_a_long_random_string') {
  console.error('Set JWT_SECRET to a long, unique random value in .env before starting SmartRetail.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/reports', require('./routes/reports'));

app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
      if (err) next(err);
    });
  }
  next();
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Internal server error' });
});

io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.user.name} (${socket.user.role})`);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`SmartRetail running on http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
