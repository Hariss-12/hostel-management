const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const loadUser = async (id) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.phone, s.id AS student_id
       FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.id = $1`,
    [id]
  );
  return rows[0];
};

router.post(
  '/login',
  validate({ email: { required: true, type: 'email' }, password: { required: true } }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [req.body.email.toLowerCase()]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(req.body.password, user.password_hash));
    if (!ok) throw new HttpError(401, 'Incorrect email or password');
    if (req.body.role && user.role !== req.body.role) throw new HttpError(403, `This account is not registered as ${req.body.role}. Choose the correct login role.`);
    if (!user.is_active) throw new HttpError(403, 'Your account is disabled. Please contact the hostel office.');

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });
    res.json({ token, user: await loadUser(user.id) });
  })
);


// Public self-registration is intentionally limited to students. Staff and
// administrator accounts must be created by an authorized hostel administrator.
router.post(
  '/signup',
  validate({
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
  }),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const user = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone)
         VALUES ($1, $2, $3, 'student', $4) RETURNING id, name, email, role, phone`,
        [req.body.name, email, passwordHash, req.body.phone]
      );
      const account = created.rows[0];
      await client.query(
        `INSERT INTO students (user_id, roll_number, course, year_of_study, gender, guardian_name, guardian_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [account.id, req.body.roll_number, req.body.course, Number(req.body.year_of_study), req.body.gender, req.body.guardian_name || null, req.body.guardian_phone || null]
      );
      return account;
    });
    res.status(201).json({ message: 'Student account created. You can now sign in.', user });
  })
);

router.get('/me', authenticate, asyncHandler(async (req, res) => res.json(await loadUser(req.user.id))));

router.put(
  '/me',
  authenticate,
  validate({ name: { required: true, minLength: 2, maxLength: 100 }, phone: { type: 'phone' } }),
  asyncHandler(async (req, res) => {
    await query('UPDATE users SET name = $1, phone = $2 WHERE id = $3', [req.body.name, req.body.phone, req.user.id]);
    res.json(await loadUser(req.user.id));
  })
);

router.post(
  '/change-password',
  authenticate,
  validate({
    current_password: { required: true, label: 'your current password' },
    new_password: { required: true, minLength: 6, maxLength: 72, label: 'a new password' },
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(req.body.current_password, rows[0].password_hash))) {
      throw new HttpError(400, 'Current password is incorrect', { current_password: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(req.body.new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  })
);

module.exports = router;
