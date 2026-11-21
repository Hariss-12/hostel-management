const router = require('express').Router();
const { collection, insert, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { today, optInt, isDate, isMonth } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('studentId', idParam);
const STATUSES = ['present', 'absent', 'late', 'on_leave'];

router.get('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today(); const hostelId = optInt(req.query.hostel_id);
  const students = await collection('students').find({ status: 'active' }).toArray(); const rows = [];
  for (const s of students) {
    const active = await collection('allocations').findOne({ student_id: s.id, status: 'active' }); if (!active) continue;
    const bed = await collection('beds').findOne({ id: active.bed_id }); const room = bed && await collection('rooms').findOne({ id: bed.room_id }); const hostel = room && await collection('hostels').findOne({ id: room.hostel_id });
    if (!hostel || (hostelId && hostel.id !== hostelId)) continue;
    const u = await collection('users').findOne({ id: s.user_id }); const attendance = await collection('attendance').findOne({ student_id: s.id, attendance_date: date });
    const leaves = await collection('leaves').countDocuments({ student_id: s.id, status: 'approved', from_date: { $lte: date }, to_date: { $gte: date } });
    rows.push({ student_id: s.id, name: u.name, roll_number: s.roll_number, hostel_name: hostel.name, room_number: room.room_number, status: attendance ? attendance.status : null, remarks: attendance ? attendance.remarks : null, on_leave: leaves > 0 });
  }
  rows.sort((a, b) => a.hostel_name.localeCompare(b.hostel_name) || a.room_number.localeCompare(b.room_number) || a.name.localeCompare(b.name));
  res.json({ date, students: rows });
}));
router.post('/bulk', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ date: { required: true, type: 'date' } }, req.body);
  const { date, records } = req.body;
  if (date > today()) throw new HttpError(400, 'Attendance cannot be marked for a future date', { date: 'Cannot be in the future' });
  if (!Array.isArray(records) || !records.length) throw new HttpError(400, 'Mark at least one student before saving');
  for (const r of records) if (!Number.isInteger(Number(r.student_id)) || !STATUSES.includes(r.status)) throw new HttpError(400, 'One of the attendance entries is invalid');
  await withTransaction(async (session) => {
    for (const r of records) {
      const filter = { student_id: Number(r.student_id), attendance_date: date };
      await collection('attendance').updateOne(filter, { $set: { status: r.status, remarks: r.remarks || null, marked_by: req.user.id }, $setOnInsert: { id: await require('../config/db').nextId('attendance', session), created_at: new Date() } }, { upsert: true, session });
    }
  });
  res.json({ saved: records.length });
}));
router.get('/student/:studentId', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (req.user.role === 'student' && req.user.student_id !== studentId) throw new HttpError(403, 'You can only view your own attendance');
  const month = isMonth(req.query.month) ? req.query.month : today().slice(0, 7);
  const rows = await collection('attendance').find({ student_id: studentId, attendance_date: { $gte: `${month}-01`, $lt: `${month}-32` } }, { projection: { _id: 0, attendance_date: 1, status: 1, remarks: 1 } }).sort({ attendance_date: 1 }).toArray();
  const summary = { present: 0, absent: 0, late: 0, on_leave: 0 }; rows.forEach((r) => { summary[r.status] += 1; });
  const counted = summary.present + summary.late + summary.absent; summary.percentage = counted ? Math.round(((summary.present + summary.late) / counted) * 100) : null;
  res.json({ month, records: rows, summary });
}));
module.exports = router;
