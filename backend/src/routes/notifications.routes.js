const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

const unreadCount = async (userId) =>
  (await query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND NOT is_read', [userId])).rows[0].n;

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, title, message, link, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`,
    [req.user.id]
  );
  res.json({ items: rows, unread: await unreadCount(req.user.id) });
}));

router.get('/unread-count', asyncHandler(async (req, res) => res.json({ unread: await unreadCount(req.user.id) })));

router.put('/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [req.user.id]);
  res.json({ message: 'All notifications marked as read' });
}));

router.put('/:id/read', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id]);
  res.json({ message: 'Marked as read' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id]);
  res.json({ message: 'Notification deleted' });
}));

// Staff announcements. Wardens can reach students and maintenance staff; admins can reach everyone.
router.post('/broadcast', authorize('admin', 'warden'), validate({
  title: { required: true, maxLength: 150 },
  message: { required: true, maxLength: 1000 },
  target: { required: true, oneOf: ['all', 'students', 'wardens', 'maintenance', 'hostel'], label: 'an audience' },
  hostel_id: { type: 'int', label: 'a hostel' },
}), asyncHandler(async (req, res) => {
  const { title, message, target, hostel_id: hostelId } = req.body;
  if (req.user.role === 'warden' && ['all', 'wardens'].includes(target)) throw new HttpError(403, 'Wardens can send announcements to students and maintenance staff only');

  let result;
  if (target === 'hostel') {
    if (!hostelId) throw new HttpError(400, 'Choose a hostel', { hostel_id: 'Choose a hostel' });
    result = await query(
      `SELECT u.id FROM allocations a JOIN students s ON s.id = a.student_id JOIN users u ON u.id = s.user_id
         JOIN beds b ON b.id = a.bed_id JOIN rooms r ON r.id = b.room_id
        WHERE a.status = 'active' AND r.hostel_id = $1 AND u.is_active`, [hostelId]);
  } else {
    const roles = { all: ['student', 'warden', 'maintenance', 'admin'], students: ['student'], wardens: ['warden'], maintenance: ['maintenance'] }[target];
    result = await query('SELECT id FROM users WHERE is_active AND role = ANY($1::text[]) AND id <> $2', [roles, req.user.id]);
  }
  const sent = await notify(result.rows.map((r) => r.id), title, message, null);
  if (!sent) throw new HttpError(400, 'No recipients found for this audience');
  res.status(201).json({ sent });
}));

module.exports = router;
