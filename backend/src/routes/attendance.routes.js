const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { today, optInt, isDate, isMonth } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('studentId', idParam);

const STATUSES = ['present', 'absent', 'late', 'on_leave'];

// Staff: every hosteller with their status for one date (on_leave is flagged from approved leaves)
router.get('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const { rows } = await query(
    `SELECT s.id AS student_id, u.name, s.roll_number, h.name AS hostel_name, r.room_number,
            at.status, at.remarks,
            EXISTS (SELECT 1 FROM leaves l WHERE l.student_id = s.id AND l.status = 'approved'
                     AND $1::date BETWEEN l.from_date AND l.to_date) AS on_leave
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
       JOIN beds b ON b.id = a.bed_id
       JOIN rooms r ON r.id = b.room_id
       JOIN hostels h ON h.id = r.hostel_id
       LEFT JOIN attendance at ON at.student_id = s.id AND at.attendance_date = $1::date
      WHERE s.status = 'active' AND ($2::int IS NULL OR h.id = $2)
      ORDER BY h.name, r.room_number, u.name`,
    [date, optInt(req.query.hostel_id)]
  );
  res.json({ date, students: rows });
}));

// Staff: save (insert or update) attendance for many students at once
router.post('/bulk', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ date: { required: true, type: 'date' } }, req.body);
  const { date, records } = req.body;
  if (date > today()) throw new HttpError(400, 'Attendance cannot be marked for a future date', { date: 'Cannot be in the future' });
  if (!Array.isArray(records) || !records.length) throw new HttpError(400, 'Mark at least one student before saving');
  for (const r of records) {
    if (!Number.isInteger(Number(r.student_id)) || !STATUSES.includes(r.status)) throw new HttpError(400, 'One of the attendance entries is invalid');
  }
  await withTransaction(async (c) => {
    for (const r of records) {
      await c.query(
        `INSERT INTO attendance (student_id, attendance_date, status, remarks, marked_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, attendance_date)
         DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by`,
        [r.student_id, date, r.status, r.remarks || null, req.user.id]
      );
    }
  });
  res.json({ saved: records.length });
}));

// One student's month: staff can view anyone, students only themselves
router.get('/student/:studentId', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (req.user.role === 'student' && req.user.student_id !== studentId) throw new HttpError(403, 'You can only view your own attendance');
  const month = isMonth(req.query.month) ? req.query.month : today().slice(0, 7);
  const { rows } = await query(
    `SELECT attendance_date, status, remarks FROM attendance
      WHERE student_id = $1 AND attendance_date >= $2::date AND attendance_date < ($2::date + INTERVAL '1 month')
      ORDER BY attendance_date`,
    [studentId, `${month}-01`]
  );
  const summary = { present: 0, absent: 0, late: 0, on_leave: 0 };
  rows.forEach((r) => { summary[r.status] += 1; });
  const counted = summary.present + summary.late + summary.absent;
  summary.percentage = counted ? Math.round(((summary.present + summary.late) / counted) * 100) : null;
  res.json({ month, records: rows, summary });
}));

module.exports = router;
