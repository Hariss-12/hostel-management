const router = require('express').Router();
const bcrypt = require('bcrypt');
const { collection, insert, isDuplicate, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('id', idParam);
const STAFF_ROLES = ['warden', 'maintenance'];
const rules = {
  name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 150 }, phone: { type: 'phone' },
};

async function fetchStaff(id) {
  const rows = await collection('users').aggregate([
    { $match: { id: Number(id), role: { $in: STAFF_ROLES } } },
    { $lookup: { from: 'hostels', localField: 'id', foreignField: 'warden_id', as: 'hostels' } },
    { $project: { _id: 0, id: 1, name: 1, email: 1, phone: 1, role: 1, is_active: 1, created_at: 1, hostels: { $reduce: { input: '$hostels', initialValue: '', in: { $cond: [{ $eq: ['$$value', ''] }, '$$this.name', { $concat: ['$$value', ', ', '$$this.name'] }] } } } } },
  ]).toArray();
  return rows[0];
}
router.get('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const role = STAFF_ROLES.includes(req.query.role) ? req.query.role : { $in: STAFF_ROLES };
  const rows = await collection('users').aggregate([
    { $match: { role: typeof role === 'string' ? role : role, } },
    { $lookup: { from: 'hostels', localField: 'id', foreignField: 'warden_id', as: 'hostels' } },
    { $addFields: { hostels: { $reduce: { input: '$hostels', initialValue: '', in: { $cond: [{ $eq: ['$$value', ''] }, '$$this.name', { $concat: ['$$value', ', ', '$$this.name'] }] } } } } },
    { $sort: { role: 1, name: 1 } },
    { $project: { _id: 0, id: 1, name: 1, email: 1, phone: 1, role: 1, is_active: 1, created_at: 1, hostels: 1 } },
  ]).toArray();
  res.json(rows);
}));
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  assertValid({ ...rules, role: { required: true, oneOf: STAFF_ROLES }, password: { required: true, minLength: 6, maxLength: 72 } }, req.body);
  const b = req.body; const email = b.email.toLowerCase();
  try {
    const user = await insert('users', { name: b.name, email, password_hash: await bcrypt.hash(b.password, 10), role: b.role, phone: b.phone, is_active: true, created_at: new Date() });
    res.status(201).json(await fetchStaff(user.id));
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'Email is already registered', { email: 'Email is already registered' });
    throw err;
  }
}));
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  assertValid({ ...rules, is_active: { required: true, type: 'boolean', label: 'status' }, password: { minLength: 6, maxLength: 72 } }, req.body);
  const id = Number(req.params.id); const b = req.body;
  if (!(await fetchStaff(id))) throw new HttpError(404, 'Staff member not found');
  const email = b.email.toLowerCase();
  try {
    const set = { name: b.name, email, phone: b.phone, is_active: b.is_active };
    if (b.password) set.password_hash = await bcrypt.hash(b.password, 10);
    await collection('users').updateOne({ id }, { $set: set });
    res.json(await fetchStaff(id));
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'Email is already registered', { email: 'Email is already registered' });
    throw err;
  }
}));
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await fetchStaff(id))) throw new HttpError(404, 'Staff member not found');
  await withTransaction(async (session) => {
    await collection('hostels').updateMany({ warden_id: id }, { $set: { warden_id: null } }, { session });
    for (const name of ['fees', 'allocations', 'payments', 'attendance', 'leaves', 'complaints']) {
      const field = name === 'fees' || name === 'allocations' ? 'created_by'
        : name === 'payments' ? 'received_by'
          : name === 'attendance' ? 'marked_by'
            : name === 'leaves' ? 'decided_by' : 'assigned_to';
      await collection(name).updateMany({ [field]: id }, { $set: { [field]: null } }, { session });
    }
    await collection('notifications').deleteMany({ user_id: id }, { session });
    await collection('users').deleteOne({ id }, { session });
  });
  res.json({ message: 'Staff member deleted' });
}));
module.exports = router;
