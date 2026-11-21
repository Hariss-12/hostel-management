// Warden and maintenance staff accounts (managed by the admin)
const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

const STAFF_ROLES = ['warden', 'maintenance'];
const rules = {
  name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 150 },
  phone: { type: 'phone' },
};

const fetchStaff = async (id) =>
  (
    await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
              (SELECT STRING_AGG(h.name, ', ' ORDER BY h.name) FROM hostels h WHERE h.warden_id = u.id) AS hostels
         FROM users u WHERE u.id = $1 AND u.role = ANY($2::text[])`,
      [id, STAFF_ROLES]
    )
  ).rows[0];

router.get(
  '/',
  authorize('admin', 'warden'),
  asyncHandler(async (req, res) => {
    const role = STAFF_ROLES.includes(req.query.role) ? req.query.role : null;
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
              (SELECT STRING_AGG(h.name, ', ' ORDER BY h.name) FROM hostels h WHERE h.warden_id = u.id) AS hostels
         FROM users u
        WHERE u.role = ANY($1::text[]) AND ($2::text IS NULL OR u.role = $2)
        ORDER BY u.role, u.name`,
      [STAFF_ROLES, role]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    assertValid({ ...rules, role: { required: true, oneOf: STAFF_ROLES }, password: { required: true, minLength: 6, maxLength: 72 } }, req.body);
    const b = req.body;
    const email = b.email.toLowerCase();
    if ((await query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount) {
      throw new HttpError(409, 'Email is already registered', { email: 'Email is already registered' });
    }
    const hash = await bcrypt.hash(b.password, 10);
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [b.name, email, hash, b.role, b.phone]
    );
    res.status(201).json(await fetchStaff(rows[0].id));
  })
);

router.put(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    assertValid({ ...rules, is_active: { required: true, type: 'boolean', label: 'status' }, password: { minLength: 6, maxLength: 72 } }, req.body);
    const b = req.body;
    const id = Number(req.params.id);
    if (!(await fetchStaff(id))) throw new HttpError(404, 'Staff member not found');
    const email = b.email.toLowerCase();
    if ((await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, id])).rowCount) {
      throw new HttpError(409, 'Email is already registered', { email: 'Email is already registered' });
    }
    await query('UPDATE users SET name = $1, email = $2, phone = $3, is_active = $4 WHERE id = $5', [b.name, email, b.phone, b.is_active, id]);
    if (b.password) {
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(b.password, 10), id]);
    }
    res.json(await fetchStaff(id));
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await fetchStaff(id))) throw new HttpError(404, 'Staff member not found');
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Staff member deleted' });
  })
);

module.exports = router;
