const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { collection, insert, withTransaction, isDuplicate } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

async function loadUser(id) {
  const user = await collection('users').findOne({ id: Number(id) }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, phone: 1 } });
  if (!user) return null;
  const student = user.role === 'student' ? await collection('students').findOne({ user_id: user.id }, { projection: { id: 1 } }) : null;
  return { ...user, student_id: student ? student.id : null };
}

router.post('/login', (req, res, next) => {
  req.body = req.body || {};
  req.body.identifier = req.body.identifier ?? req.body.email;
  next();
}, validate({
  identifier: { required: true, maxLength: 150, label: 'your email or staff ID' },
  password: { required: true },
}), asyncHandler(async (req, res) => {
  const identifier = req.body.identifier.toLowerCase();
  const role = ['admin', 'warden', 'maintenance'].includes(req.body.role) ? req.body.role : null;
  let user = role ? await collection('users').findOne({ username: identifier, role }) : null;
  if (!user) user = await collection('users').findOne({ email: identifier });
  if (!user) throw new HttpError(401, 'Incorrect ID/email or password');
  if (!(await bcrypt.compare(req.body.password, user.password_hash))) throw new HttpError(401, 'Incorrect ID/email or password');
  if (req.body.role && user.role !== req.body.role) throw new HttpError(403, `This account is not registered as ${req.body.role}. Choose the correct login role.`);
  if (!user.is_active) throw new HttpError(403, 'Your account is disabled. Please contact the hostel office.');
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  res.json({ token, user: await loadUser(user.id) });
}));

router.post('/signup', validate({
  name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 150 },
  password: { required: true, minLength: 8, maxLength: 72 },
  phone: { required: true, type: 'phone' },
  roll_number: { required: true, minLength: 2, maxLength: 30 },
  course: { required: true, minLength: 2, maxLength: 100 },
  year_of_study: { required: true, type: 'int', min: 1, max: 4, label: 'the year of study' },
  gender: { required: true, oneOf: ['male', 'female', 'other'] },
  guardian_name: { minLength: 2, maxLength: 100, label: "the guardian's name" },
  guardian_phone: { type: 'phone', label: "the guardian's phone" },
}), asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const password_hash = await bcrypt.hash(req.body.password, 10);
  try {
    const user = await withTransaction(async (session) => {
      const account = await insert('users', {
        name: req.body.name, email, password_hash, role: 'student', phone: req.body.phone,
        is_active: true, created_at: new Date(),
      }, session);
      await insert('students', {
        user_id: account.id, roll_number: req.body.roll_number, roll_number_lc: req.body.roll_number.toLowerCase(),
        course: req.body.course, year_of_study: Number(req.body.year_of_study), gender: req.body.gender,
        guardian_name: req.body.guardian_name || null, guardian_phone: req.body.guardian_phone || null,
        admission_date: new Date().toISOString().slice(0, 10), status: 'active',
      }, session);
      return { id: account.id, name: account.name, email: account.email, role: account.role, phone: account.phone };
    });
    res.status(201).json({ message: 'Student account created. You can now sign in.', user });
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'Email or roll number already exists');
    throw err;
  }
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => res.json(await loadUser(req.user.id))));
router.put('/me', authenticate, validate({
  name: { required: true, minLength: 2, maxLength: 100 }, phone: { type: 'phone' },
}), asyncHandler(async (req, res) => {
  await collection('users').updateOne({ id: req.user.id }, { $set: { name: req.body.name, phone: req.body.phone } });
  res.json(await loadUser(req.user.id));
}));
router.post('/change-password', authenticate, validate({
  current_password: { required: true, label: 'your current password' },
  new_password: { required: true, minLength: 6, maxLength: 72, label: 'a new password' },
}), asyncHandler(async (req, res) => {
  const user = await collection('users').findOne({ id: req.user.id });
  if (!user || !(await bcrypt.compare(req.body.current_password, user.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect', { current_password: 'Current password is incorrect' });
  }
  await collection('users').updateOne({ id: req.user.id }, { $set: { password_hash: await bcrypt.hash(req.body.new_password, 10) } });
  res.json({ message: 'Password updated' });
}));

module.exports = router;
