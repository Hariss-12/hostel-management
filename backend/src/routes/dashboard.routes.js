const router = require('express').Router();
const { collection } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { MEAL_TYPES } = require('../utils/helpers');
const { today } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
router.use(authenticate);
const count = (name, filter = {}) => collection(name).countDocuments(filter);
const total = async (name, field, filter = {}) => {
  const rows = await collection(name).aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: `$${field}` } } }]).toArray();
  return rows[0] ? rows[0].total : 0;
};
async function occupancy() {
  return { total_beds: await count('beds', { is_usable: true }), occupied_beds: await count('allocations', { status: 'active' }) };
}
async function feeTotals() {
  const billed = await total('fees', 'amount'); const collected = await total('payments', 'amount');
  const month = today().slice(0, 7);
  const collected_this_month = await total('payments', 'amount', { payment_date: { $regex: `^${month}` } });
  let overdue_fees = 0;
  for (const f of await collection('fees').find({ due_date: { $lt: today() } }).toArray()) {
    const paid = await total('payments', 'amount', { fee_id: f.id });
    if (paid < f.amount) overdue_fees += 1;
  }
  return { billed, collected, collected_this_month, overdue_fees };
}
async function complaintCounts() {
  const counts = { open: 0, assigned: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const row of await collection('complaints').aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray()) counts[row._id] = row.n;
  return counts;
}
async function complaintRows(match, limit) {
  return collection('complaints').aggregate([
    { $match: match }, { $lookup: { from: 'students', localField: 'student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'users', localField: 'assigned_to', foreignField: 'id', as: 'assigned' } }, { $unwind: { path: '$assigned', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: 1, title: 1, category: 1, priority: 1, status: 1, location: 1, created_at: 1, student_name: '$user.name', assigned_to_name: '$assigned.name' } },
    { $sort: { created_at: -1 } }, { $limit: limit },
  ]).toArray();
}
async function adminStats() {
  const [students, wardens, maintenance, hostels, rooms, beds, fees, complaints, pending] = await Promise.all([
    count('students', { status: 'active' }), count('users', { role: 'warden', is_active: true }),
    count('users', { role: 'maintenance', is_active: true }), count('hostels'), count('rooms'), occupancy(), feeTotals(), complaintCounts(), count('leaves', { status: 'pending' }),
  ]);
  const byHostel = [];
  for (const h of await collection('hostels').find().sort({ name: 1 }).toArray()) {
    const roomsForHostel = await collection('rooms').find({ hostel_id: h.id }).toArray(); const bids = roomsForHostel.map((r) => r.id);
    const bedRows = await collection('beds').find({ room_id: { $in: bids }, is_usable: true }).toArray();
    const allocations = await collection('allocations').countDocuments({ bed_id: { $in: bedRows.map((b) => b.id) }, status: 'active' });
    byHostel.push({ id: h.id, name: h.name, beds: bedRows.length, occupied: allocations });
  }
  const months = [];
  const now = new Date(`${today()}T00:00:00Z`);
  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = monthDate.toISOString().slice(0, 7);
    const amount = await total('payments', 'amount', { payment_date: { $regex: `^${key}` } });
    months.push({ label: monthDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), total: amount });
  }
  const [recent] = await Promise.all([complaintRows({ status: { $nin: ['resolved', 'closed'] } }, 5)]);
  return { counts: { students, wardens, maintenance, hostels, rooms }, beds, fees: { ...fees, outstanding: fees.billed - fees.collected }, complaints, pending_leaves: pending, by_hostel: byHostel, monthly_collections: months, recent_complaints: recent };
}
async function wardenStats() {
  const [students, beds, fees, complaints, pending] = await Promise.all([
    count('students', { status: 'active' }), occupancy(), feeTotals(), complaintCounts(),
    collection('leaves').aggregate([{ $match: { status: 'pending' } }, { $lookup: { from: 'students', localField: 'student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' }, { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' }, { $sort: { created_at: 1 } }, { $limit: 5 }, { $project: { _id: 0, id: 1, from_date: 1, to_date: 1, destination: 1, student_name: '$user.name', roll_number: '$student.roll_number' } }]).toArray(),
  ]);
  const marked = await collection('attendance').find({ attendance_date: today() }).toArray();
  const attendance = { present: 0, absent: 0, late: 0, on_leave: 0, total: 0 };
  for (const a of marked) if (attendance[a.status] !== undefined) attendance[a.status] += 1;
  const activeAllocations = await collection('allocations').find({ status: 'active' }).toArray();
  const hostellerIds = [];
  for (const a of activeAllocations) if (await collection('students').findOne({ id: a.student_id, status: 'active' })) hostellerIds.push(a.student_id);
  attendance.total = hostellerIds.length;
  return { students, beds, fees: { ...fees, outstanding: fees.billed - fees.collected }, complaints, pending_leaves: pending, attendance_today: attendance, unassigned_complaints: await complaintRows({ status: 'open' }, 5) };
}
async function studentStats(user) {
  const sid = user.student_id; const a = await collection('allocations').findOne({ student_id: sid, status: 'active' });
  let allocation = null;
  if (a) {
    const b = await collection('beds').findOne({ id: a.bed_id }); const r = await collection('rooms').findOne({ id: b.room_id }); const h = await collection('hostels').findOne({ id: r.hostel_id });
    allocation = { hostel_name: h.name, room_number: r.room_number, floor: r.floor, room_type: r.room_type, bed_number: b.bed_number, start_date: a.start_date };
  }
  const feeRows = await collection('fees').find({ student_id: sid }).toArray(); const billed = feeRows.reduce((n, f) => n + f.amount, 0);
  const paid = await total('payments', 'amount', { fee_id: { $in: feeRows.map((f) => f.id) } });
  let next_due = null;
  for (const f of feeRows.sort((x, y) => x.due_date.localeCompare(y.due_date))) {
    const collected = await total('payments', 'amount', { fee_id: f.id });
    if (f.amount > collected) { next_due = { title: f.title, due_date: f.due_date, balance: f.amount - collected }; break; }
  }
  const thisMonth = today().slice(0, 7); const marks = await collection('attendance').find({ student_id: sid, attendance_date: { $regex: `^${thisMonth}` } }).toArray();
  const attendance = { present: marks.filter((a) => a.status === 'present').length, late: marks.filter((a) => a.status === 'late').length, absent: marks.filter((a) => a.status === 'absent').length };
  const counted = attendance.present + attendance.late + attendance.absent;
  const leaves = await collection('leaves').find({ student_id: sid }).toArray();
  const menu = await collection('mess_menu').find({ day_of_week: ((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7) + 1 }).toArray();
  menu.sort((a, b) => MEAL_TYPES.indexOf(a.meal_type) - MEAL_TYPES.indexOf(b.meal_type));
  return { allocation, fees: { billed, paid, balance: billed - paid, next_due }, attendance: { ...attendance, percentage: counted ? Math.round(((attendance.present + attendance.late) / counted) * 100) : null }, leaves: { pending: leaves.filter((l) => l.status === 'pending').length, upcoming: leaves.filter((l) => l.status === 'approved' && l.to_date >= today()).length }, open_complaints: await count('complaints', { student_id: sid, status: { $nin: ['resolved', 'closed'] } }), todays_menu: menu.map(({ meal_type, items }) => ({ meal_type, items })) };
}
async function maintenanceStats(user) {
  const rows = await collection('complaints').find({ assigned_to: user.id }).toArray(); const month = today().slice(0, 7);
  const counts = { assigned: rows.filter((c) => c.status === 'assigned').length, in_progress: rows.filter((c) => c.status === 'in_progress').length, resolved_this_month: rows.filter((c) => c.status === 'resolved' && String(c.resolved_at).slice(0, 7) === month).length, high_priority: rows.filter((c) => ['assigned', 'in_progress'].includes(c.status) && c.priority === 'high').length };
  return { counts, tasks: await complaintRows({ assigned_to: user.id, status: { $in: ['assigned', 'in_progress'] } }, 8) };
}
router.get('/', asyncHandler(async (req, res) => {
  const handlers = { admin: adminStats, warden: wardenStats, student: studentStats, maintenance: maintenanceStats };
  res.json(await handlers[req.user.role](req.user));
}));
module.exports = router;
