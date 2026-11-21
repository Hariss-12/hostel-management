const router = require('express').Router();
const { collection } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { optInt, isDate, isMonth, today } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate, authorize('admin', 'warden'));
const dateOrNull = (v) => isDate(v) ? v : null;
const reports = {
  occupancy: async (q) => {
    const hostelId = optInt(q.hostel_id); const result = [];
    for (const r of await collection('rooms').find(hostelId ? { hostel_id: hostelId } : {}).toArray()) {
      const h = await collection('hostels').findOne({ id: r.hostel_id }); const beds = await collection('beds').find({ room_id: r.id }).toArray();
      const usable = beds.filter((b) => b.is_usable); const occupied = await collection('allocations').countDocuments({ bed_id: { $in: usable.map((b) => b.id) }, status: 'active' });
      result.push({ hostel: h.name, room_number: r.room_number, floor: r.floor, room_type: r.room_type, beds: usable.length, occupied, vacant: usable.length - occupied });
    }
    return result.sort((a, b) => a.hostel.localeCompare(b.hostel) || a.floor - b.floor || a.room_number.localeCompare(b.room_number));
  },
  fees: async (q) => {
    const from = dateOrNull(q.from); const to = dateOrNull(q.to); const hostelId = optInt(q.hostel_id); const groups = new Map();
    for (const f of await collection('fees').find({ ...(from || to ? { due_date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) }).toArray()) {
      const s = await collection('students').findOne({ id: f.student_id }); const u = s && await collection('users').findOne({ id: s.user_id });
      const a = await collection('allocations').findOne({ student_id: s.id, status: 'active' }); const bed = a && await collection('beds').findOne({ id: a.bed_id }); const room = bed && await collection('rooms').findOne({ id: bed.room_id }); const h = room && await collection('hostels').findOne({ id: room.hostel_id });
      if (hostelId && (!h || h.id !== hostelId)) continue;
      const key = `${s.id}:${h ? h.id : ''}`; const row = groups.get(key) || { student: u.name, roll_number: s.roll_number, hostel: h ? h.name : null, billed: 0, paid: 0, balance: 0 };
      row.billed += f.amount; row.paid += await collection('payments').aggregate([{ $match: { fee_id: f.id } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]).toArray().then((x) => x[0]?.sum || 0);
      row.balance = row.billed - row.paid; groups.set(key, row);
    }
    return [...groups.values()].sort((a, b) => b.balance - a.balance || a.student.localeCompare(b.student));
  },
  attendance: async (q) => {
    const month = isMonth(q.month) ? q.month : today().slice(0, 7); const hostelId = optInt(q.hostel_id); const result = [];
    for (const s of await collection('students').find({ status: 'active' }).toArray()) {
      const a = await collection('allocations').findOne({ student_id: s.id, status: 'active' }); if (!a) continue;
      const bed = await collection('beds').findOne({ id: a.bed_id }); const room = await collection('rooms').findOne({ id: bed.room_id }); const h = await collection('hostels').findOne({ id: room.hostel_id });
      if (hostelId && h.id !== hostelId) continue;
      const u = await collection('users').findOne({ id: s.user_id }); const marks = await collection('attendance').find({ student_id: s.id, attendance_date: { $gte: `${month}-01`, $lt: `${month}-32` } }).toArray();
      const row = { student: u.name, roll_number: s.roll_number, hostel: h.name, present: 0, late: 0, absent: 0, on_leave: 0 };
      for (const m of marks) row[m.status] += 1;
      const counted = row.present + row.late + row.absent; row.percentage = counted ? Math.round(((row.present + row.late) / counted) * 100) : null; result.push(row);
    }
    return result.sort((a, b) => a.student.localeCompare(b.student));
  },
  complaints: async (q) => {
    const from = dateOrNull(q.from); const to = dateOrNull(q.to); const rows = [];
    for (const c of await collection('complaints').find().toArray()) {
      const raised = new Date(c.created_at).toISOString().slice(0, 10); if ((from && raised < from) || (to && raised > to)) continue;
      const s = await collection('students').findOne({ id: c.student_id }); const u = s && await collection('users').findOne({ id: s.user_id }); const assignee = c.assigned_to && await collection('users').findOne({ id: c.assigned_to });
      const resolved = c.resolved_at ? new Date(c.resolved_at) : null; const created = new Date(c.created_at);
      rows.push({ id: c.id, raised_on: raised, category: c.category, title: c.title, priority: c.priority, status: c.status, student: u.name, assigned_to: assignee ? assignee.name : '', days_to_resolve: resolved ? Math.floor((resolved - created) / 86400000) : null });
    }
    return rows.sort((a, b) => b.raised_on.localeCompare(a.raised_on));
  },
};
router.get('/:type', asyncHandler(async (req, res) => {
  const build = reports[req.params.type]; if (!build) throw new HttpError(404, 'Unknown report');
  res.json({ type: req.params.type, rows: await build(req.query) });
}));
module.exports = router;
