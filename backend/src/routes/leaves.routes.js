const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify, activeUserIdsByRole, userIdOfStudent } = require('../utils/notify');
const { today } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate, authorize('admin', 'warden', 'student'));
router.param('id', idParam);

const LEAVE_SELECT = `
  SELECT l.id, l.student_id, l.from_date, l.to_date, l.reason, l.destination, l.contact_phone, l.status,
         l.warden_remark, l.decided_at, l.created_at, u.name AS student_name, s.roll_number,
         h.name AS hostel_name, r.room_number, du.name AS decided_by_name
    FROM leaves l
    JOIN students s ON s.id = l.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users du ON du.id = l.decided_by
    LEFT JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
    LEFT JOIN beds b ON b.id = a.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN hostels h ON h.id = r.hostel_id`;

router.get('/', asyncHandler(async (req, res) => {
  const ownId = req.user.role === 'student' ? req.user.student_id : null;
  const { rows } = await query(
    `${LEAVE_SELECT} WHERE ($1::int IS NULL OR l.student_id = $1)
      ORDER BY (l.status = 'pending') DESC, l.created_at DESC`,
    [ownId]
  );
  res.json(rows);
}));

router.post('/', authorize('student'), asyncHandler(async (req, res) => {
  assertValid({
    from_date: { required: true, type: 'date', label: 'start date' },
    to_date: { required: true, type: 'date', label: 'end date' },
    reason: { required: true, minLength: 5, maxLength: 500 },
    destination: { required: true, maxLength: 150 },
    contact_phone: { type: 'phone', label: 'contact phone' },
  }, req.body);
  const b = req.body;
  if (b.from_date < today()) throw new HttpError(400, 'Leave cannot start in the past', { from_date: 'Choose today or a later date' });
  if (b.to_date < b.from_date) throw new HttpError(400, 'End date must be on or after the start date', { to_date: 'Must be on or after the start date' });

  const overlap = await query(
    `SELECT 1 FROM leaves WHERE student_id = $1 AND status IN ('pending', 'approved') AND from_date <= $3::date AND to_date >= $2::date`,
    [req.user.student_id, b.from_date, b.to_date]
  );
  if (overlap.rowCount) throw new HttpError(409, 'You already have a leave request covering these dates', { from_date: 'Overlaps an existing request' });

  const { rows } = await query(
    `INSERT INTO leaves (student_id, from_date, to_date, reason, destination, contact_phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.student_id, b.from_date, b.to_date, b.reason, b.destination, b.contact_phone]
  );
  await notify(await activeUserIdsByRole(['warden', 'admin']), 'New leave request', `${req.user.name} requested leave from ${b.from_date} to ${b.to_date}.`, '/leaves');
  res.status(201).json((await query(`${LEAVE_SELECT} WHERE l.id = $1`, [rows[0].id])).rows[0]);
}));

router.put('/:id/decision', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ status: { required: true, oneOf: ['approved', 'rejected'], label: 'a decision' }, warden_remark: { maxLength: 255, label: 'remark' } }, req.body);
  const b = req.body;
  const upd = await query(
    `UPDATE leaves SET status = $1, warden_remark = $2, decided_by = $3, decided_at = NOW()
      WHERE id = $4 AND status = 'pending' RETURNING student_id, from_date, to_date`,
    [b.status, b.warden_remark, req.user.id, Number(req.params.id)]
  );
  if (!upd.rowCount) throw new HttpError(409, 'This request is no longer pending');
  const l = upd.rows[0];
  await notify(await userIdOfStudent(l.student_id), `Leave ${b.status}`, `Your leave from ${l.from_date} to ${l.to_date} was ${b.status}.${b.warden_remark ? ` Remark: ${b.warden_remark}` : ''}`, '/leaves');
  res.json((await query(`${LEAVE_SELECT} WHERE l.id = $1`, [Number(req.params.id)])).rows[0]);
}));

router.put('/:id/cancel', authorize('student'), asyncHandler(async (req, res) => {
  const upd = await query(
    `UPDATE leaves SET status = 'cancelled' WHERE id = $1 AND student_id = $2 AND status = 'pending' RETURNING id`,
    [Number(req.params.id), req.user.student_id]
  );
  if (!upd.rowCount) throw new HttpError(409, 'Only your pending requests can be cancelled');
  res.json({ message: 'Leave request cancelled' });
}));

module.exports = router;
