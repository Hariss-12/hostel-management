const router = require('express').Router();
const { collection, insert, nextId, withTransaction, isDuplicate } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { optInt } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(['/hostels', '/rooms', '/beds'], authenticate, authorize('admin', 'warden'));
router.param('id', idParam);
const hostelRules = {
  name: { required: true, maxLength: 100 }, type: { required: true, oneOf: ['boys', 'girls', 'mixed'] },
  address: { maxLength: 255 }, warden_id: { type: 'int', label: 'warden' },
};
async function hostelRows(match = {}) {
  return collection('hostels').aggregate([
    { $match: match }, { $lookup: { from: 'users', localField: 'warden_id', foreignField: 'id', as: 'warden' } },
    { $unwind: { path: '$warden', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'rooms', localField: 'id', foreignField: 'hostel_id', as: 'rooms' } },
    { $lookup: { from: 'beds', localField: 'rooms.id', foreignField: 'room_id', as: 'beds' } },
    { $lookup: { from: 'allocations', let: { bids: '$beds.id' }, pipeline: [{ $match: { $expr: { $and: [{ $in: ['$bed_id', '$$bids'] }, { $eq: ['$status', 'active'] }] } } }], as: 'allocs' } },
    { $project: { _id: 0, id: 1, name: 1, type: 1, address: 1, warden_id: 1, warden_name: '$warden.name',
      room_count: { $size: '$rooms' },
      bed_count: { $size: { $filter: { input: '$beds', as: 'bed', cond: { $eq: ['$$bed.is_usable', true] } } } },
      occupied: { $size: '$allocs' } } },
    { $sort: { name: 1 } },
  ]).toArray();
}
async function assertWarden(id) {
  if (id == null) return;
  if (!(await collection('users').findOne({ id: Number(id), role: 'warden' }))) throw new HttpError(400, 'Selected warden does not exist', { warden_id: 'Choose a valid warden' });
}
router.get('/hostels', asyncHandler(async (_req, res) => res.json(await hostelRows())));
router.post('/hostels', authorize('admin'), asyncHandler(async (req, res) => {
  assertValid(hostelRules, req.body); const b = req.body; await assertWarden(b.warden_id);
  try {
    const h = await insert('hostels', { ...b, name_lc: b.name.toLowerCase(), warden_id: b.warden_id ? Number(b.warden_id) : null });
    res.status(201).json((await hostelRows({ id: h.id }))[0]);
  } catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'A hostel with this name already exists', { name: 'Name already in use' }); throw e; }
}));
router.put('/hostels/:id', authorize('admin'), asyncHandler(async (req, res) => {
  assertValid(hostelRules, req.body); const b = req.body; const id = Number(req.params.id); await assertWarden(b.warden_id);
  try {
    const upd = await collection('hostels').updateOne({ id }, { $set: { ...b, name_lc: b.name.toLowerCase(), warden_id: b.warden_id ? Number(b.warden_id) : null } });
    if (!upd.matchedCount) throw new HttpError(404, 'Hostel not found');
    res.json((await hostelRows({ id }))[0]);
  } catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'A hostel with this name already exists', { name: 'Name already in use' }); throw e; }
}));
router.delete('/hostels/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (session) => {
    if (!(await collection('hostels').findOne({ id }, { session }))) throw new HttpError(404, 'Hostel not found');
    const rooms = await collection('rooms').find({ hostel_id: id }, { session }).toArray();
    const beds = await collection('beds').find({ room_id: { $in: rooms.map((r) => r.id) } }, { session }).toArray();
    if (await collection('allocations').countDocuments({ bed_id: { $in: beds.map((b) => b.id) } }, { session })) throw new HttpError(409, 'This hostel has allocation records and cannot be deleted');
    await collection('beds').deleteMany({ room_id: { $in: rooms.map((r) => r.id) } }, { session });
    await collection('rooms').deleteMany({ hostel_id: id }, { session });
    await collection('hostels').deleteOne({ id }, { session });
  });
  res.json({ message: 'Hostel deleted' });
}));
const roomRules = {
  hostel_id: { required: true, type: 'int', label: 'a hostel' }, room_number: { required: true, maxLength: 20, label: 'the room number' },
  floor: { required: true, type: 'int', min: 0, max: 50 }, room_type: { required: true, oneOf: ['single', 'double', 'triple', 'dormitory'], label: 'room type' },
  capacity: { required: true, type: 'int', min: 1, max: 12 }, monthly_fee: { required: true, type: 'number', min: 0, label: 'the monthly fee' },
};
const publicRoom = (room) => {
  const { _id, room_number_lc, ...result } = room;
  return result;
};
router.get('/rooms', asyncHandler(async (req, res) => {
  const filter = optInt(req.query.hostel_id); const match = filter ? { hostel_id: filter } : {};
  const rows = await collection('rooms').aggregate([
    { $match: match }, { $lookup: { from: 'hostels', localField: 'hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: '$hostel' },
    { $lookup: { from: 'beds', localField: 'id', foreignField: 'room_id', as: 'beds' } },
    { $lookup: { from: 'allocations', let: { bids: '$beds.id' }, pipeline: [{ $match: { $expr: { $and: [{ $in: ['$bed_id', '$$bids'] }, { $eq: ['$status', 'active'] }] } } }], as: 'allocs' } },
    { $project: { _id: 0, id: 1, hostel_id: 1, hostel_name: '$hostel.name', room_number: 1, floor: 1, room_type: 1, capacity: 1, monthly_fee: 1,
      usable_beds: { $size: { $filter: { input: '$beds', as: 'b', cond: { $eq: ['$$b.is_usable', true] } } } }, occupied: { $size: '$allocs' } } },
    { $sort: { hostel_name: 1, floor: 1, room_number: 1 } },
  ]).toArray();
  res.json(rows);
}));
router.post('/rooms', asyncHandler(async (req, res) => {
  assertValid(roomRules, req.body); const b = req.body;
  try {
    const room = await withTransaction(async (session) => {
      if (!(await collection('hostels').findOne({ id: Number(b.hostel_id) }, { session }))) throw new HttpError(400, 'Choose a valid hostel', { hostel_id: 'Choose a valid hostel' });
      const r = await insert('rooms', { ...b, hostel_id: Number(b.hostel_id), floor: Number(b.floor), capacity: Number(b.capacity), monthly_fee: Number(b.monthly_fee), room_number_lc: b.room_number.toLowerCase() }, session);
      for (let n = 1; n <= Number(b.capacity); n += 1) await insert('beds', { room_id: r.id, bed_number: n, is_usable: true }, session);
      return r;
    });
    res.status(201).json(publicRoom(room));
  } catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'This room number already exists in the hostel', { room_number: 'Room number already exists in this hostel' }); throw e; }
}));
router.put('/rooms/:id', asyncHandler(async (req, res) => {
  assertValid(roomRules, req.body); const b = req.body; const id = Number(req.params.id);
  try {
    const room = await withTransaction(async (session) => {
      const old = await collection('rooms').findOne({ id }, { session });
      if (!old) throw new HttpError(404, 'Room not found');
      const cap = Number(b.capacity);
      const beds = await collection('beds').find({ room_id: id }, { session }).sort({ bed_number: 1 }).toArray();
      if (cap < beds.length) {
        const toRemove = beds.filter((bed) => bed.bed_number > cap);
        const used = await collection('allocations').countDocuments({ bed_id: { $in: toRemove.map((x) => x.id) } }, { session });
        if (used) throw new HttpError(409, 'Cannot reduce capacity: the beds being removed have allocation records. Mark them as under maintenance instead.', { capacity: 'Beds above this number are or were in use' });
        await collection('beds').deleteMany({ id: { $in: toRemove.map((x) => x.id) } }, { session });
      } else {
        for (let n = beds.length + 1; n <= cap; n += 1) await insert('beds', { room_id: id, bed_number: n, is_usable: true }, session);
      }
      if (!(await collection('hostels').findOne({ id: Number(b.hostel_id) }, { session }))) throw new HttpError(400, 'Choose a valid hostel');
      await collection('rooms').updateOne({ id }, { $set: { ...b, hostel_id: Number(b.hostel_id), floor: Number(b.floor), capacity: cap, monthly_fee: Number(b.monthly_fee), room_number_lc: b.room_number.toLowerCase() } }, { session });
      return collection('rooms').findOne({ id }, { session });
    });
    res.json(publicRoom(room));
  } catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'This room number already exists in the hostel', { room_number: 'Room number already exists in this hostel' }); throw e; }
}));
router.delete('/rooms/:id', asyncHandler(async (req, res) => {
  const result = await withTransaction(async (session) => {
    const id = Number(req.params.id);
    if (!(await collection('rooms').findOne({ id }, { session }))) return false;
    const beds = await collection('beds').find({ room_id: id }, { session }).project({ id: 1 }).toArray();
    if (await collection('allocations').countDocuments({ bed_id: { $in: beds.map((b) => b.id) } }, { session })) throw new HttpError(409, 'This room has allocation records and cannot be deleted');
    await collection('beds').deleteMany({ room_id: id }, { session });
    await collection('rooms').deleteOne({ id }, { session });
    return true;
  });
  if (!result) throw new HttpError(404, 'Room not found');
  res.json({ message: 'Room deleted' });
}));
router.get('/rooms/:id/beds', asyncHandler(async (req, res) => {
  const rows = await collection('beds').aggregate([
    { $match: { room_id: Number(req.params.id) } },
    { $lookup: { from: 'allocations', let: { bid: '$id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$bed_id', '$$bid'] }, { $eq: ['$status', 'active'] }] } } }, { $limit: 1 }], as: 'allocation' } },
    { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'students', localField: 'allocation.student_id', foreignField: 'id', as: 'student' } }, { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: 1, bed_number: 1, is_usable: 1, allocation_id: '$allocation.id', student_id: '$student.id', student_name: '$user.name', roll_number: '$student.roll_number' } },
    { $sort: { bed_number: 1 } },
  ]).toArray();
  res.json(rows);
}));
router.get('/beds/available', asyncHandler(async (req, res) => {
  const hostelId = optInt(req.query.hostel_id);
  const rows = await collection('beds').aggregate([
    { $match: { is_usable: true } }, { $lookup: { from: 'allocations', let: { bid: '$id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$bed_id', '$$bid'] }, { $eq: ['$status', 'active'] }] } } }], as: 'alloc' } },
    { $match: { 'alloc.0': { $exists: false } } }, { $lookup: { from: 'rooms', localField: 'room_id', foreignField: 'id', as: 'room' } }, { $unwind: '$room' },
    { $lookup: { from: 'hostels', localField: 'room.hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: '$hostel' },
    ...(hostelId ? [{ $match: { 'hostel.id': hostelId } }] : []),
    { $project: { _id: 0, id: 1, bed_number: 1, room_number: '$room.room_number', floor: '$room.floor', room_type: '$room.room_type', monthly_fee: '$room.monthly_fee', hostel_id: '$hostel.id', hostel_name: '$hostel.name', hostel_type: '$hostel.type' } },
    { $sort: { hostel_name: 1, room_number: 1, bed_number: 1 } },
  ]).toArray();
  res.json(rows);
}));
router.put('/beds/:id', asyncHandler(async (req, res) => {
  assertValid({ is_usable: { required: true, type: 'boolean', label: 'bed status' } }, req.body);
  const id = Number(req.params.id);
  if (!req.body.is_usable && await collection('allocations').findOne({ bed_id: id, status: 'active' })) throw new HttpError(409, 'This bed is occupied. Transfer or vacate the student first.');
  const updated = await collection('beds').findOneAndUpdate({ id }, { $set: { is_usable: req.body.is_usable } }, { returnDocument: 'after', includeResultMetadata: false, projection: { _id: 0, id: 1, bed_number: 1, is_usable: 1 } });
  if (!updated) throw new HttpError(404, 'Bed not found');
  res.json(updated);
}));
module.exports = router;
