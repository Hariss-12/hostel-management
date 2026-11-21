// One endpoint, four shapes: the response depends on the signed-in role.
const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { MEAL_ORDER_SQL } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');

router.use(authenticate);

const one = async (sql, params) => (await query(sql, params)).rows[0];

const occupancy = () =>
  one(`SELECT (SELECT COUNT(*) FROM beds WHERE is_usable) AS total_beds,
              (SELECT COUNT(*) FROM allocations WHERE status = 'active') AS occupied_beds`);

const feeTotals = () =>
  one(`SELECT (SELECT COALESCE(SUM(amount), 0) FROM fees) AS billed,
              (SELECT COALESCE(SUM(amount), 0) FROM payments) AS collected,
              (SELECT COALESCE(SUM(amount), 0) FROM payments
                WHERE date_trunc('month', payment_date::timestamp) = date_trunc('month', CURRENT_DATE::timestamp)) AS collected_this_month,
              (SELECT COUNT(*) FROM fees f WHERE f.due_date < CURRENT_DATE
                  AND f.amount > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.fee_id = f.id), 0)) AS overdue_fees`);

const complaintCounts = async () => {
  const { rows } = await query('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status');
  const counts = { open: 0, assigned: 0, in_progress: 0, resolved: 0, closed: 0 };
  rows.forEach((r) => { counts[r.status] = r.n; });
  return counts;
};

const RECENT_COMPLAINTS = `
  SELECT c.id, c.title, c.category, c.priority, c.status, c.location, c.created_at, u.name AS student_name, mu.name AS assigned_to_name
    FROM complaints c JOIN students s ON s.id = c.student_id JOIN users u ON u.id = s.user_id
    LEFT JOIN users mu ON mu.id = c.assigned_to`;

async function adminStats() {
  const [counts, beds, fees, complaints, pendingLeaves, byHostel, monthly, recent] = await Promise.all([
    one(`SELECT (SELECT COUNT(*) FROM students WHERE status = 'active') AS students,
                (SELECT COUNT(*) FROM users WHERE role = 'warden' AND is_active) AS wardens,
                (SELECT COUNT(*) FROM users WHERE role = 'maintenance' AND is_active) AS maintenance,
                (SELECT COUNT(*) FROM hostels) AS hostels,
                (SELECT COUNT(*) FROM rooms) AS rooms`),
    occupancy(),
    feeTotals(),
    complaintCounts(),
    one(`SELECT COUNT(*) AS n FROM leaves WHERE status = 'pending'`),
    query(`SELECT h.id, h.name,
                  (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = h.id AND b.is_usable) AS beds,
                  (SELECT COUNT(*) FROM allocations a JOIN beds b ON b.id = a.bed_id JOIN rooms r ON r.id = b.room_id
                    WHERE r.hostel_id = h.id AND a.status = 'active') AS occupied
             FROM hostels h ORDER BY h.name`),
    query(`SELECT to_char(m, 'Mon') AS label, COALESCE(SUM(p.amount), 0) AS total
             FROM generate_series(date_trunc('month', CURRENT_DATE::timestamp) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE::timestamp), INTERVAL '1 month') m
             LEFT JOIN payments p ON date_trunc('month', p.payment_date::timestamp) = m
            GROUP BY m ORDER BY m`),
    query(`${RECENT_COMPLAINTS} WHERE c.status NOT IN ('resolved', 'closed') ORDER BY c.created_at DESC LIMIT 5`),
  ]);
  return {
    counts, beds, fees: { ...fees, outstanding: fees.billed - fees.collected }, complaints,
    pending_leaves: pendingLeaves.n, by_hostel: byHostel.rows, monthly_collections: monthly.rows, recent_complaints: recent.rows,
  };
}

async function wardenStats() {
  const [students, beds, fees, complaints, pendingLeaves, attendance, unassigned] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM students WHERE status = 'active'`),
    occupancy(),
    feeTotals(),
    complaintCounts(),
    query(`SELECT l.id, l.from_date, l.to_date, l.destination, u.name AS student_name, s.roll_number
             FROM leaves l JOIN students s ON s.id = l.student_id JOIN users u ON u.id = s.user_id
            WHERE l.status = 'pending' ORDER BY l.created_at LIMIT 5`),
    one(`SELECT COUNT(*) FILTER (WHERE at.status = 'present') AS present,
                COUNT(*) FILTER (WHERE at.status = 'absent') AS absent,
                COUNT(*) FILTER (WHERE at.status = 'late') AS late,
                COUNT(*) FILTER (WHERE at.status = 'on_leave') AS on_leave,
                (SELECT COUNT(*) FROM students s JOIN allocations a ON a.student_id = s.id AND a.status = 'active' WHERE s.status = 'active') AS total
           FROM attendance at WHERE at.attendance_date = CURRENT_DATE`),
    query(`${RECENT_COMPLAINTS} WHERE c.status = 'open' ORDER BY CASE c.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, c.created_at LIMIT 5`),
  ]);
  return {
    students: students.n, beds, fees: { ...fees, outstanding: fees.billed - fees.collected }, complaints,
    pending_leaves: pendingLeaves.rows, attendance_today: attendance, unassigned_complaints: unassigned.rows,
  };
}

async function studentStats(user) {
  const sid = user.student_id;
  const [allocation, fee, nextDue, attendance, leaves, complaints, menu] = await Promise.all([
    one(`SELECT h.name AS hostel_name, r.room_number, r.floor, r.room_type, b.bed_number, a.start_date
           FROM allocations a JOIN beds b ON b.id = a.bed_id JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
          WHERE a.student_id = $1 AND a.status = 'active'`, [sid]),
    one(`SELECT COALESCE(SUM(f.amount), 0) AS billed, COALESCE(SUM(p.paid), 0) AS paid
           FROM fees f LEFT JOIN (SELECT fee_id, SUM(amount) AS paid FROM payments GROUP BY fee_id) p ON p.fee_id = f.id
          WHERE f.student_id = $1`, [sid]),
    one(`SELECT f.title, f.due_date, f.amount - COALESCE(p.paid, 0) AS balance
           FROM fees f LEFT JOIN (SELECT fee_id, SUM(amount) AS paid FROM payments GROUP BY fee_id) p ON p.fee_id = f.id
          WHERE f.student_id = $1 AND f.amount - COALESCE(p.paid, 0) > 0 ORDER BY f.due_date LIMIT 1`, [sid]),
    one(`SELECT COUNT(*) FILTER (WHERE status = 'present') AS present, COUNT(*) FILTER (WHERE status = 'late') AS late,
                COUNT(*) FILTER (WHERE status = 'absent') AS absent
           FROM attendance WHERE student_id = $1 AND date_trunc('month', attendance_date::timestamp) = date_trunc('month', CURRENT_DATE::timestamp)`, [sid]),
    one(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE status = 'approved' AND to_date >= CURRENT_DATE) AS upcoming
           FROM leaves WHERE student_id = $1`, [sid]),
    one(`SELECT COUNT(*) AS n FROM complaints WHERE student_id = $1 AND status NOT IN ('resolved', 'closed')`, [sid]),
    query(`SELECT meal_type, items FROM mess_menu WHERE day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int ORDER BY ${MEAL_ORDER_SQL}`),
  ]);
  const counted = attendance.present + attendance.late + attendance.absent;
  return {
    allocation: allocation || null,
    fees: { billed: fee.billed, paid: fee.paid, balance: fee.billed - fee.paid, next_due: nextDue || null },
    attendance: { ...attendance, percentage: counted ? Math.round(((attendance.present + attendance.late) / counted) * 100) : null },
    leaves, open_complaints: complaints.n, todays_menu: menu.rows,
  };
}

async function maintenanceStats(user) {
  const [counts, tasks] = await Promise.all([
    one(`SELECT COUNT(*) FILTER (WHERE status = 'assigned') AS assigned,
                COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= date_trunc('month', CURRENT_DATE::timestamp)) AS resolved_this_month,
                COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress') AND priority = 'high') AS high_priority
           FROM complaints WHERE assigned_to = $1`, [user.id]),
    query(`${RECENT_COMPLAINTS} WHERE c.assigned_to = $1 AND c.status IN ('assigned', 'in_progress')
           ORDER BY CASE c.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, c.created_at LIMIT 8`, [user.id]),
  ]);
  return { counts, tasks: tasks.rows };
}

router.get('/', asyncHandler(async (req, res) => {
  const handlers = { admin: adminStats, warden: wardenStats, student: studentStats, maintenance: maintenanceStats };
  res.json(await handlers[req.user.role](req.user));
}));

module.exports = router;
