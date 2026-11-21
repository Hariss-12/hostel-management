const router = require('express').Router();
const { collection, insert, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify, activeUserIdsByRole, userIdOfStudent } = require('../utils/notify');
const { today } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate, authorize('admin', 'warden', 'student'));
router.param('id', idParam);
async function leaveRows(match = {}) {
  return collection('leaves').aggregate([
    { $match: match }, { $lookup: { from: 'students', localField: 'student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'users', localField: 'decided_by', foreignField: 'id', as: 'decider' } }, { $unwind: { path: '$decider', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'allocations', let: { sid: '$student_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$student_id', '$$sid'] }, { $eq: ['$status', 'active'] }] } } }, { $limit: 1 }, { $lookup: { from: 'beds', localField: 'bed_id', foreignField: 'id', as: 'bed' } }, { $unwind: { path: '$bed', preserveNullAndEmptyArrays: true } }, { $lookup: { from: 'rooms', localField: 'bed.room_id', foreignField: 'id', as: 'room' } }, { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } }, { $lookup: { from: 'hostels', localField: 'room.hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: { path: '$hostel', preserveNullAndEmptyArrays: true } }], as: 'allocation' } },
    { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: 1, student_id: 1, from_date: 1, to_date: 1, reason: 1, destination: 1, contact_phone: 1, status: 1, warden_remark: 1, decided_at: 1, created_at: 1, student_name: '$user.name', roll_number: '$student.roll_number', hostel_name: '$allocation.hostel.name', room_number: '$allocation.room.room_number', decided_by_name: '$decider.name' } },
    { $sort: { status: 1, created_at: -1 } },
  ]).toArray();
}
router.get('/', asyncHandler(async (req, res) => res.json(await leaveRows(req.user.role === 'student' ? { student_id: req.user.student_id } : {}))));
router.post('/', authorize('student'), asyncHandler(async (req, res) => {
  assertValid({ from_date: { required: true, type: 'date', label: 'start date' }, to_date: { required: true, type: 'date', label: 'end date' }, reason: { required: true, minLength: 5, maxLength: 500 }, destination: { required: true, maxLength: 150 }, contact_phone: { type: 'phone', label: 'contact phone' } }, req.body);
  const b = req.body;
  if (b.from_date < today()) throw new HttpError(400, 'Leave cannot start in the past', { from_date: 'Choose today or a later date' });
  if (b.to_date < b.from_date) throw new HttpError(400, 'End date must be on or after the start date', { to_date: 'Must be on or after the start date' });
  const id = await withTransaction(async (session) => {
    const lock = await collection('students').updateOne({ id: req.user.student_id }, { $inc: { _leave_revision: 1 } }, { session });
    if (!lock.matchedCount) throw new HttpError(404, 'Student not found');
    if (await collection('leaves').findOne({ student_id: req.user.student_id, status: { $in: ['pending', 'approved'] }, from_date: { $lte: b.to_date }, to_date: { $gte: b.from_date } }, { session })) throw new HttpError(409, 'You already have a leave request covering these dates', { from_date: 'Overlaps an existing request' });
    const leave = await insert('leaves', { student_id: req.user.student_id, from_date: b.from_date, to_date: b.to_date, reason: b.reason, destination: b.destination, contact_phone: b.contact_phone || null, status: 'pending', warden_remark: null, decided_by: null, decided_at: null, created_at: new Date() }, session);
    await notify(await activeUserIdsByRole(['warden', 'admin']), 'New leave request', `${req.user.name} requested leave from ${b.from_date} to ${b.to_date}.`, '/leaves', session);
    return leave.id;
  });
  res.status(201).json((await leaveRows({ id }))[0]);
}));
router.put('/:id/decision', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ status: { required: true, oneOf: ['approved', 'rejected'], label: 'a decision' }, warden_remark: { maxLength: 255, label: 'remark' } }, req.body);
  const id = Number(req.params.id); const b = req.body; let leave;
  await withTransaction(async (session) => {
    leave = await collection('leaves').findOne({ id, status: 'pending' }, { session });
    if (!leave) throw new HttpError(409, 'This request is no longer pending');
    await collection('leaves').updateOne({ id }, { $set: { status: b.status, warden_remark: b.warden_remark || null, decided_by: req.user.id, decided_at: new Date() } }, { session });
    await notify(await userIdOfStudent(leave.student_id), `Leave ${b.status}`, `Your leave from ${leave.from_date} to ${leave.to_date} was ${b.status}.${b.warden_remark ? ` Remark: ${b.warden_remark}` : ''}`, '/leaves', session);
  });
  res.json((await leaveRows({ id }))[0]);
}));
router.put('/:id/cancel', authorize('student'), asyncHandler(async (req, res) => {
  const result = await collection('leaves').updateOne({ id: Number(req.params.id), student_id: req.user.student_id, status: 'pending' }, { $set: { status: 'cancelled' } });
  if (!result.modifiedCount) throw new HttpError(409, 'Only your pending requests can be cancelled');
  res.json({ message: 'Leave request cancelled' });
}));
module.exports = router;
