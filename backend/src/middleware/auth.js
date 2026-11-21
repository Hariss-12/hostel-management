const jwt = require('jsonwebtoken');
const { collection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
  const user = await collection('users').findOne({ id: Number(payload.id) });
  if (!user || !user.is_active) return res.status(401).json({ message: 'This account is disabled or no longer exists' });
  const student = user.role === 'student' ? await collection('students').findOne({ user_id: user.id }) : null;
  req.user = {
    id: user.id, name: user.name, email: user.email, role: user.role,
    is_active: user.is_active, student_id: student ? student.id : null,
  };
  next();
});

const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission to do this' });

module.exports = { authenticate, authorize };
