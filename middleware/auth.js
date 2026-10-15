// middleware/auth.js - JWT verification + role-based access control
const jwt = require('jsonwebtoken');

// usage: auth()  -> any logged-in user
//        auth(['admin']) -> only admin
module.exports = (roles = []) => (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Login required' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, name, role }
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission for this action' });
  }
  next();
};
