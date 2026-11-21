const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { optInt, isDate, isMonth, today } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate, authorize('admin', 'warden'));

const dateOrNull = (v) => (isDate(v) ? v : null);

const reports = {
  // Beds per room: capacity, occupied, vacant
  occupancy: async (q) => (await query(
    `SELECT h.name AS hostel, r.room_number, r.floor, r.room_type,
            COUNT(b.id) FILTER (WHERE b.is_usable) AS beds,
            COUNT(a.id) AS occupied,
            COUNT(b.id) FILTER (WHERE b.is_usable) - COUNT(a.id) AS vacant
       FROM rooms r JOIN hostels h ON h.id = r.hostel_id
       LEFT JOIN beds b ON b.room_id = r.id
       LEFT JOIN allocations a ON a.bed_id = b.id AND a.status = 'active'
      WHERE ($1::int IS NULL OR h.id = $1)
      GROUP BY h.name, r.id, r.room_number, r.floor, r.room_type
      ORDER BY h.name, r.floor, r.room_number`,
    [optInt(q.hostel_id)])).rows,

  // Billed / paid / balance per student, optionally within a due-date range
  fees: async (q) => (await query(
    `SELECT u.name AS student, s.roll_number, h.name AS hostel,
            COALESCE(SUM(f.amount), 0) AS billed,
            COALESCE(SUM(pp.paid), 0) AS paid,
            COALESCE(SUM(f.amount), 0) - COALESCE(SUM(pp.paid), 0) AS balance
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN hostels h ON h.id = r.hostel_id
       JOIN fees f ON f.student_id = s.id
            AND ($2::date IS NULL OR f.due_date >= $2::date) AND ($3::date IS NULL OR f.due_date <= $3::date)
       LEFT JOIN (SELECT fee_id, SUM(amount) AS paid FROM payments GROUP BY fee_id) pp ON pp.fee_id = f.id
      WHERE ($1::int IS NULL OR h.id = $1)
      GROUP BY s.id, u.name, s.roll_number, h.name
      ORDER BY balance DESC, u.name`,
    [optInt(q.hostel_id), dateOrNull(q.from), dateOrNull(q.to)])).rows,

  // Monthly attendance per student
  attendance: async (q) => {
    const month = isMonth(q.month) ? q.month : today().slice(0, 7);
    const { rows } = await query(
      `SELECT u.name AS student, s.roll_number, h.name AS hostel,
              COUNT(at.id) FILTER (WHERE at.status = 'present') AS present,
              COUNT(at.id) FILTER (WHERE at.status = 'late') AS late,
              COUNT(at.id) FILTER (WHERE at.status = 'absent') AS absent,
              COUNT(at.id) FILTER (WHERE at.status = 'on_leave') AS on_leave
         FROM students s
         JOIN users u ON u.id = s.user_id
         JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
         JOIN beds b ON b.id = a.bed_id JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
         LEFT JOIN attendance at ON at.student_id = s.id
              AND at.attendance_date >= $1::date AND at.attendance_date < ($1::date + INTERVAL '1 month')
        WHERE s.status = 'active' AND ($2::int IS NULL OR h.id = $2)
        GROUP BY s.id, u.name, s.roll_number, h.name ORDER BY u.name`,
      [`${month}-01`, optInt(q.hostel_id)]
    );
    return rows.map((r) => {
      const counted = r.present + r.late + r.absent;
      return { ...r, percentage: counted ? Math.round(((r.present + r.late) / counted) * 100) : null };
    });
  },

  // Complaints raised within a date range
  complaints: async (q) => (await query(
    `SELECT c.id, c.created_at::date AS raised_on, c.category, c.title, c.priority, c.status,
            u.name AS student, COALESCE(mu.name, '') AS assigned_to,
            CASE WHEN c.resolved_at IS NULL THEN NULL ELSE (c.resolved_at::date - c.created_at::date) END AS days_to_resolve
       FROM complaints c JOIN students s ON s.id = c.student_id JOIN users u ON u.id = s.user_id
       LEFT JOIN users mu ON mu.id = c.assigned_to
      WHERE ($1::date IS NULL OR c.created_at::date >= $1::date) AND ($2::date IS NULL OR c.created_at::date <= $2::date)
      ORDER BY c.created_at DESC`,
    [dateOrNull(q.from), dateOrNull(q.to)])).rows,
};

router.get('/:type', asyncHandler(async (req, res) => {
  const build = reports[req.params.type];
  if (!build) throw new HttpError(404, 'Unknown report');
  res.json({ type: req.params.type, rows: await build(req.query) });
}));

module.exports = router;
