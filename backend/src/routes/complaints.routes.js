const router = require('express').Router();
const { collection, insert, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify, activeUserIdsByRole, userIdOfStudent } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('id', idParam);
const ALLOWED_STATUS = { admin: ['open', 'assigned', 'in_progress', 'resolved', 'closed'], warden: ['open', 'assigned', 'in_progress', 'resolved', 'closed'], maintenance: ['in_progress', 'resolved'], student: ['open', 'closed'] };
async function complaintRows(match = {}) {
  return collection('complaints').aggregate([
    { $match: match }, { $lookup: { from: 'students', localField: 'student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'users', localField: 'assigned_to', foreignField: 'id', as: 'assignee' } }, { $unwind: { path: '$assignee', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: 1, student_id: 1, category: 1, title: 1, description: 1, location: 1, priority: 1, status: 1, assigned_to: 1, resolution_note: 1, created_at: 1, updated_at: 1, resolved_at: 1, student_name: '$user.name', roll_number: '$student.roll_number', assigned_to_name: '$assignee.name' } },
    { $addFields: {
      status_order: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] },
      priority_order: { $switch: { branches: [{ case: { $eq: ['$priority', 'high'] }, then: 1 }, { case: { $eq: ['$priority', 'medium'] }, then: 2 }], default: 3 } },
    } },
    { $sort: { status_order: 1, priority_order: 1, created_at: -1 } }, { $project: { status_order: 0, priority_order: 0 } },
  ]).toArray();
}
const fetchComplaint = async (id) => (await complaintRows({ id: Number(id) }))[0];
router.get('/', asyncHandler(async (req, res) => {
  const { role, id, student_id: sid } = req.user; const match = {};
  if (role === 'student') match.student_id = sid;
  if (role === 'maintenance') match.assigned_to = id;
  res.json(await complaintRows(match));
}));
router.post('/', authorize('student'), asyncHandler(async (req, res) => {
  assertValid({ category: { required: true, oneOf: ['electrical', 'plumbing', 'furniture', 'cleaning', 'internet', 'other'] }, title: { required: true, minLength: 3, maxLength: 150 }, description: { required: true, minLength: 5, maxLength: 1000 }, priority: { required: true, oneOf: ['low', 'medium', 'high'] }, location: { maxLength: 100 } }, req.body);
  const b = req.body; let location = b.location;
  if (!location) {
    const a = await collection('allocations').findOne({ student_id: req.user.student_id, status: 'active' });
    const bed = a && await collection('beds').findOne({ id: a.bed_id }); const room = bed && await collection('rooms').findOne({ id: bed.room_id }); const hostel = room && await collection('hostels').findOne({ id: room.hostel_id });
    if (room && hostel) location = `${hostel.name}, Room ${room.room_number}`;
  }
  const id = await withTransaction(async (session) => {
    const c = await insert('complaints', { student_id: req.user.student_id, category: b.category, title: b.title, description: b.description, location: location || null, priority: b.priority, status: 'open', assigned_to: null, resolution_note: null, created_at: new Date(), updated_at: new Date(), resolved_at: null }, session);
    await notify(await activeUserIdsByRole(['warden', 'admin']), 'New complaint', `${req.user.name}: ${b.title} (${b.priority} priority)`, '/complaints', session);
    return c.id;
  });
  res.status(201).json(await fetchComplaint(id));
}));
router.put('/:id/assign', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ assigned_to: { required: true, type: 'int', label: 'a maintenance staff member' } }, req.body);
  const id = Number(req.params.id); const complaint = await fetchComplaint(id);
  if (!complaint) throw new HttpError(404, 'Complaint not found');
  if (['resolved', 'closed'].includes(complaint.status)) throw new HttpError(409, 'This complaint is already resolved');
  const staff = await collection('users').findOne({ id: Number(req.body.assigned_to), role: 'maintenance', is_active: true });
  if (!staff) throw new HttpError(400, 'Choose an active maintenance staff member', { assigned_to: 'Choose a valid staff member' });
  await withTransaction(async (session) => {
    await collection('complaints').updateOne({ id }, { $set: { assigned_to: staff.id, status: complaint.status === 'open' ? 'assigned' : complaint.status, updated_at: new Date() } }, { session });
    await notify(staff.id, 'Complaint assigned to you', `${complaint.title} (${complaint.location || 'no location'}) - ${complaint.priority} priority`, '/complaints', session);
    await notify(await userIdOfStudent(complaint.student_id), 'Complaint assigned', `"${complaint.title}" has been assigned to ${staff.name}.`, '/complaints', session);
  });
  res.json(await fetchComplaint(id));
}));
router.put('/:id/status', asyncHandler(async (req, res) => {
  const role = req.user.role; assertValid({ status: { required: true, oneOf: ALLOWED_STATUS[role] }, resolution_note: { maxLength: 500, label: 'note' } }, req.body);
  const { status, resolution_note: note } = req.body; const id = Number(req.params.id); const c = await fetchComplaint(id);
  if (!c) throw new HttpError(404, 'Complaint not found');
  if (role === 'student') {
    if (c.student_id !== req.user.student_id) throw new HttpError(403, 'You can only update your own complaints');
    if (!['resolved', 'closed'].includes(c.status)) throw new HttpError(409, 'You can close or reopen a complaint only after it is resolved');
  }
  if (role === 'maintenance' && c.assigned_to !== req.user.id) throw new HttpError(403, 'This complaint is not assigned to you');
  if (status === 'assigned' && !c.assigned_to) throw new HttpError(400, 'Assign a staff member first', { status: 'Assign a staff member first' });
  if (status === 'resolved' && !note && !c.resolution_note) throw new HttpError(400, 'Add a short note describing the fix', { resolution_note: 'Describe what was done' });
  await withTransaction(async (session) => {
    const set = { status, updated_at: new Date(), resolved_at: ['resolved', 'closed'].includes(status) ? (c.resolved_at || new Date()) : null };
    if (note) set.resolution_note = note;
    await collection('complaints').updateOne({ id }, { $set: set }, { session });
    if (role === 'student') {
      if (c.assigned_to) await notify(c.assigned_to, `Complaint ${status === 'open' ? 'reopened' : 'closed'}`, `${c.student_name} ${status === 'open' ? 'reopened' : 'closed'} "${c.title}".`, '/complaints', session);
    } else await notify(await userIdOfStudent(c.student_id), 'Complaint update', `"${c.title}" is now ${status.replace('_', ' ')}.${note ? ` Note: ${note}` : ''}`, '/complaints', session);
  });
  res.json(await fetchComplaint(id));
}));
router.delete('/:id', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const c = await fetchComplaint(Number(req.params.id));
  if (!c) throw new HttpError(404, 'Complaint not found');
  if (req.user.role === 'student' && (c.student_id !== req.user.student_id || c.status !== 'open')) throw new HttpError(403, 'You can only delete your own complaints that are still open');
  await collection('complaints').deleteOne({ id: c.id }); res.json({ message: 'Complaint deleted' });
}));
module.exports = router;
