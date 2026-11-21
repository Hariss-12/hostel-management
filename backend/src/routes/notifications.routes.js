const router = require('express').Router();
const { collection, insert } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('id', idParam);
const unreadCount = async (id) => collection('notifications').countDocuments({ user_id: id, is_read: false });
router.get('/', asyncHandler(async (req, res) => {
  const items = await collection('notifications').find({ user_id: req.user.id }, { projection: { _id: 0, id: 1, title: 1, message: 1, link: 1, is_read: 1, created_at: 1 } }).sort({ created_at: -1, id: -1 }).limit(100).toArray();
  res.json({ items, unread: await unreadCount(req.user.id) });
}));
router.get('/unread-count', asyncHandler(async (req, res) => res.json({ unread: await unreadCount(req.user.id) })));
router.put('/read-all', asyncHandler(async (req, res) => {
  await collection('notifications').updateMany({ user_id: req.user.id, is_read: false }, { $set: { is_read: true } });
  res.json({ message: 'All notifications marked as read' });
}));
router.put('/:id/read', asyncHandler(async (req, res) => {
  await collection('notifications').updateOne({ id: Number(req.params.id), user_id: req.user.id }, { $set: { is_read: true } });
  res.json({ message: 'Marked as read' });
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  await collection('notifications').deleteOne({ id: Number(req.params.id), user_id: req.user.id });
  res.json({ message: 'Notification deleted' });
}));
router.post('/broadcast', authorize('admin', 'warden'), validate({
  title: { required: true, maxLength: 150 }, message: { required: true, maxLength: 1000 },
  target: { required: true, oneOf: ['all', 'students', 'wardens', 'maintenance', 'hostel'], label: 'an audience' },
  hostel_id: { type: 'int', label: 'a hostel' },
}), asyncHandler(async (req, res) => {
  const { title, message, target, hostel_id: hostelId } = req.body;
  if (req.user.role === 'warden' && ['all', 'wardens'].includes(target)) throw new HttpError(403, 'Wardens can send announcements to students and maintenance staff only');
  let ids;
  if (target === 'hostel') {
    if (!hostelId) throw new HttpError(400, 'Choose a hostel', { hostel_id: 'Choose a hostel' });
    const active = await collection('allocations').find({ status: 'active' }).toArray();
    ids = [];
    for (const a of active) {
      const bed = await collection('beds').findOne({ id: a.bed_id }); const room = bed && await collection('rooms').findOne({ id: bed.room_id });
      if (!room || room.hostel_id !== Number(hostelId)) continue;
      const student = await collection('students').findOne({ id: a.student_id }); const user = student && await collection('users').findOne({ id: student.user_id, is_active: true });
      if (user) ids.push(user.id);
    }
  } else {
    const roles = { all: ['student', 'warden', 'maintenance', 'admin'], students: ['student'], wardens: ['warden'], maintenance: ['maintenance'] }[target];
    ids = (await collection('users').find({ is_active: true, role: { $in: roles }, id: { $ne: req.user.id } }, { projection: { id: 1 } }).toArray()).map((u) => u.id);
  }
  const sent = await notify(ids, title, message, null);
  if (!sent) throw new HttpError(400, 'No recipients found for this audience');
  res.status(201).json({ sent });
}));
module.exports = router;
