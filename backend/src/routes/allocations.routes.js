const router = require('express').Router();
const { collection, insert, withTransaction, isDuplicate } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('id', idParam);
async function allocationRows(match = {}) {
  return collection('allocations').aggregate([
    { $match: match }, { $lookup: { from: 'students', localField: 'student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'beds', localField: 'bed_id', foreignField: 'id', as: 'bed' } }, { $unwind: '$bed' },
    { $lookup: { from: 'rooms', localField: 'bed.room_id', foreignField: 'id', as: 'room' } }, { $unwind: '$room' },
    { $lookup: { from: 'hostels', localField: 'room.hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: '$hostel' },
    { $project: { _id: 0, id: 1, student_id: 1, bed_id: 1, start_date: 1, end_date: 1, status: 1, remarks: 1, student_name: '$user.name', roll_number: '$student.roll_number', hostel_id: '$hostel.id', hostel_name: '$hostel.name', room_number: '$room.room_number', floor: '$room.floor', room_type: '$room.room_type', monthly_fee: '$room.monthly_fee', bed_number: '$bed.bed_number' } },
    { $sort: { status: 1, start_date: -1, id: -1 } },
  ]).toArray();
}
async function assertFreeBed(bedId, gender, session) {
  const rows = await collection('beds').aggregate([
    { $match: { id: Number(bedId) } }, { $lookup: { from: 'rooms', localField: 'room_id', foreignField: 'id', as: 'room' } }, { $unwind: '$room' },
    { $lookup: { from: 'hostels', localField: 'room.hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: '$hostel' },
  ], { session }).toArray();
  const bed = rows[0];
  if (!bed) throw new HttpError(404, 'Bed not found');
  if (!bed.is_usable) throw new HttpError(409, 'This bed is under maintenance', { bed_id: 'Bed is under maintenance' });
  if (await collection('allocations').findOne({ bed_id: Number(bedId), status: 'active' }, { session })) throw new HttpError(409, 'This bed is already occupied', { bed_id: 'Bed is already occupied' });
  const type = bed.hostel.type;
  if ((type === 'boys' && gender === 'female') || (type === 'girls' && gender === 'male')) throw new HttpError(400, `This is a ${type} hostel and cannot house this student`, { bed_id: `Not allowed in a ${type} hostel` });
}
router.get('/', authorize('admin', 'warden'), asyncHandler(async (_req, res) => res.json(await allocationRows())));
router.get('/mine', authorize('student'), asyncHandler(async (req, res) => res.json(await allocationRows({ student_id: req.user.student_id }))));
router.get('/roommates', authorize('student'), asyncHandler(async (req, res) => {
  const current = await collection('allocations').findOne({ student_id: req.user.student_id, status: 'active' });
  if (!current) return res.json([]);
  const bed = await collection('beds').findOne({ id: current.bed_id });
  const beds = await collection('beds').find({ room_id: bed.room_id }).toArray();
  const active = await collection('allocations').find({ bed_id: { $in: beds.map((x) => x.id) }, status: 'active', student_id: { $ne: req.user.student_id } }).toArray();
  const rows = [];
  for (const a of active) {
    const [s, b] = await Promise.all([collection('students').findOne({ id: a.student_id }), collection('beds').findOne({ id: a.bed_id })]);
    const u = s && await collection('users').findOne({ id: s.user_id });
    if (u && s) rows.push({ name: u.name, course: s.course, year_of_study: s.year_of_study, bed_number: b.bed_number });
  }
  rows.sort((a, b) => a.bed_number - b.bed_number); res.json(rows);
}));
router.post('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ student_id: { required: true, type: 'int', label: 'a student' }, bed_id: { required: true, type: 'int', label: 'a bed' }, start_date: { type: 'date', label: 'start date' }, remarks: { maxLength: 255 } }, req.body);
  const b = req.body;
  try {
    const createdId = await withTransaction(async (session) => {
      const s = await collection('students').findOne({ id: Number(b.student_id) }, { session });
      if (!s) throw new HttpError(404, 'Student not found');
      if (s.status !== 'active') throw new HttpError(400, 'Only active students can be allocated a bed', { student_id: 'Student is not active' });
      if (await collection('allocations').findOne({ student_id: s.id, status: 'active' }, { session })) throw new HttpError(409, 'This student already has a bed. Use Transfer to move them.', { student_id: 'Student already has a bed' });
      await assertFreeBed(b.bed_id, s.gender, session);
      const allocation = await insert('allocations', { student_id: s.id, bed_id: Number(b.bed_id), start_date: b.start_date || new Date().toISOString().slice(0, 10), end_date: null, status: 'active', remarks: b.remarks || null, created_by: req.user.id, created_at: new Date() }, session);
      const bed = await collection('beds').findOne({ id: allocation.bed_id }, { session });
      const room = await collection('rooms').findOne({ id: bed.room_id }, { session });
      const hostel = await collection('hostels').findOne({ id: room.hostel_id }, { session });
      await notify(s.user_id, 'Room allocated', `You have been allocated ${hostel.name}, Room ${room.room_number}, Bed ${bed.bed_number}.`, '/my-room', session);
      return allocation.id;
    });
    const alloc = (await allocationRows({ id: createdId }))[0];
    res.status(201).json(alloc);
  } catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'This bed or student already has an active allocation'); throw e; }
}));
router.post('/:id/transfer', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ new_bed_id: { required: true, type: 'int', label: 'the new bed' }, remarks: { maxLength: 255 } }, req.body);
  const id = Number(req.params.id);
  try {
    const newId = await withTransaction(async (session) => {
      const cur = await collection('allocations').findOne({ id }, { session });
      if (!cur) throw new HttpError(404, 'Allocation not found');
      if (cur.status !== 'active') throw new HttpError(409, 'Only an active allocation can be transferred');
      if (Number(req.body.new_bed_id) === cur.bed_id) throw new HttpError(400, 'Choose a different bed', { new_bed_id: 'Student is already in this bed' });
      const s = await collection('students').findOne({ id: cur.student_id }, { session });
      await assertFreeBed(req.body.new_bed_id, s.gender, session);
      const today = new Date().toISOString().slice(0, 10);
      await collection('allocations').updateOne({ id, status: 'active' }, { $set: { status: 'transferred', end_date: today } }, { session });
      const allocation = await insert('allocations', { student_id: cur.student_id, bed_id: Number(req.body.new_bed_id), start_date: today, end_date: null, status: 'active', remarks: req.body.remarks || null, created_by: req.user.id, created_at: new Date() }, session);
      const bed = await collection('beds').findOne({ id: allocation.bed_id }, { session });
      const room = await collection('rooms').findOne({ id: bed.room_id }, { session });
      const hostel = await collection('hostels').findOne({ id: room.hostel_id }, { session });
      const student = await collection('students').findOne({ id: cur.student_id }, { session });
      await notify(student.user_id, 'Room transfer', `You have been moved to ${hostel.name}, Room ${room.room_number}, Bed ${bed.bed_number}.`, '/my-room', session);
      return allocation.id;
    });
    const alloc = (await allocationRows({ id: newId }))[0]; res.json(alloc);
  } catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'This bed or student already has an active allocation'); throw e; }
}));
router.post('/:id/vacate', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ remarks: { maxLength: 255 } }, req.body); const id = Number(req.params.id);
  await withTransaction(async (session) => {
    const allocation = await collection('allocations').findOne({ id, status: 'active' }, { session });
    if (!allocation) throw new HttpError(404, 'No active allocation found');
    await collection('allocations').updateOne({ id }, { $set: { status: 'vacated', end_date: new Date().toISOString().slice(0, 10), ...(req.body.remarks ? { remarks: req.body.remarks } : {}) } }, { session });
    const student = await collection('students').findOne({ id: allocation.student_id }, { session });
    await notify(student.user_id, 'Room vacated', 'Your hostel room allocation has ended.', '/my-room', session);
  });
  res.json({ message: 'Room vacated' });
}));
module.exports = router;
