const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the Bearer token and attaches the current user to req.user
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, s.id AS student_id
       FROM users u LEFT JOIN students s ON s.user_id = u.id
      WHERE u.id = $1`,
    [payload.id]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'This account is disabled or no longer exists' });
  }
  req.user = user;
  next();
});

// Restricts a route to the given roles
const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'You do not have permission to do this' });

module.exports = { authenticate, authorize };
