const router = require('express').Router();
const bcrypt = require('bcrypt');
const { collection, insert, withTransaction, isDuplicate } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);
const profileRules = {
  phone: { type: 'phone' }, date_of_birth: { type: 'date', label: 'date of birth' },
  blood_group: { oneOf: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], label: 'blood group' },
  guardian_name: { maxLength: 100, label: "the guardian's name" }, guardian_phone: { type: 'phone', label: "the guardian's phone" },
  address: { maxLength: 255 },
};
const staffRules = {
  ...profileRules, name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 150 }, roll_number: { required: true, maxLength: 30, label: 'the roll number' },
  course: { required: true, maxLength: 100 }, year_of_study: { required: true, type: 'int', min: 1, max: 4, label: 'the year of study' },
  gender: { required: true, oneOf: ['male', 'female', 'other'] }, admission_date: { type: 'date', label: 'admission date' },
};
const conflict = (field, message) => new HttpError(409, message, { [field]: message });

async function getStudent(id) {
  const rows = await collection('students').aggregate([
    { $match: { id: Number(id) } },
    { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'user' } },
    { $unwind: '$user' },
    { $lookup: { from: 'allocations', let: { sid: '$id' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$student_id', '$$sid'] }, { $eq: ['$status', 'active'] }] } } },
      { $limit: 1 }, { $lookup: { from: 'beds', localField: 'bed_id', foreignField: 'id', as: 'bed' } }, { $unwind: { path: '$bed', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'rooms', localField: 'bed.room_id', foreignField: 'id', as: 'room' } }, { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'hostels', localField: 'room.hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: { path: '$hostel', preserveNullAndEmptyArrays: true } },
    ], as: 'allocation' } },
    { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 0, id: 1, user_id: 1, name: '$user.name', email: '$user.email', phone: '$user.phone',
      roll_number: 1, course: 1, year_of_study: 1, gender: 1, date_of_birth: 1, blood_group: 1,
      guardian_name: 1, guardian_phone: 1, address: 1, admission_date: 1, status: 1,
      hostel_id: { $ifNull: ['$allocation.hostel.id', null] }, hostel_name: { $ifNull: ['$allocation.hostel.name', null] },
      room_number: { $ifNull: ['$allocation.room.room_number', null] }, bed_number: { $ifNull: ['$allocation.bed.bed_number', null] },
    } },
  ]).toArray();
  return rows[0];
}

router.get('/', authorize('admin', 'warden'), asyncHandler(async (_req, res) => {
  const students = await collection('students').find().toArray();
  const names = await Promise.all(students.map(async (s) => ({ id: s.id, name: (await collection('users').findOne({ id: s.user_id }))?.name || '' })));
  names.sort((a, b) => a.name.localeCompare(b.name));
  const rows = await Promise.all(names.map((s) => getStudent(s.id)));
  res.json(rows);
}));
router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!['admin', 'warden'].includes(req.user.role) && req.user.student_id !== id) throw new HttpError(403, 'You can only view your own profile');
  const student = await getStudent(id);
  if (!student) throw new HttpError(404, 'Student not found');
  res.json(student);
}));
router.post('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ ...staffRules, password: { required: true, minLength: 6, maxLength: 72, label: 'a temporary password' } }, req.body);
  const b = req.body; const email = b.email.toLowerCase();
  try {
    const id = await withTransaction(async (session) => {
      if (await collection('users').findOne({ email })) throw conflict('email', 'Email is already registered');
      if (await collection('students').findOne({ roll_number_lc: b.roll_number.toLowerCase() })) throw conflict('roll_number', 'Roll number already exists');
      const u = await insert('users', { name: b.name, email, password_hash: await bcrypt.hash(b.password, 10), role: 'student', phone: b.phone, is_active: true, created_at: new Date() }, session);
      const s = await insert('students', {
        user_id: u.id, roll_number: b.roll_number, roll_number_lc: b.roll_number.toLowerCase(), course: b.course,
        year_of_study: Number(b.year_of_study), gender: b.gender, date_of_birth: b.date_of_birth || null,
        blood_group: b.blood_group || null, guardian_name: b.guardian_name || null, guardian_phone: b.guardian_phone || null,
        address: b.address || null, admission_date: b.admission_date || new Date().toISOString().slice(0, 10), status: 'active',
      }, session);
      return s.id;
    });
    res.status(201).json(await getStudent(id));
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'Email or roll number already exists');
    throw err;
  }
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); const isStaff = ['admin', 'warden'].includes(req.user.role);
  if (!isStaff && req.user.student_id !== id) throw new HttpError(403, 'You can only edit your own profile');
  const existing = await collection('students').findOne({ id });
  if (!existing) throw new HttpError(404, 'Student not found');
  const b = req.body; const user = await collection('users').findOne({ id: existing.user_id });
  try {
    await withTransaction(async (session) => {
      if (isStaff) {
        assertValid({ ...staffRules, status: { required: true, oneOf: ['active', 'inactive', 'alumni'] }, password: { minLength: 6, maxLength: 72 } }, b);
        const email = b.email.toLowerCase();
        if (await collection('users').findOne({ email, id: { $ne: user.id } })) throw conflict('email', 'Email is already registered');
        if (await collection('students').findOne({ roll_number_lc: b.roll_number.toLowerCase(), id: { $ne: id } })) throw conflict('roll_number', 'Roll number already exists');
        const userSet = { name: b.name, email, phone: b.phone, is_active: b.status === 'active' };
        if (b.password) userSet.password_hash = await bcrypt.hash(b.password, 10);
        await collection('users').updateOne({ id: user.id }, { $set: userSet }, { session });
        await collection('students').updateOne({ id }, { $set: {
          roll_number: b.roll_number, roll_number_lc: b.roll_number.toLowerCase(), course: b.course,
          year_of_study: Number(b.year_of_study), gender: b.gender, date_of_birth: b.date_of_birth || null,
          blood_group: b.blood_group || null, guardian_name: b.guardian_name || null, guardian_phone: b.guardian_phone || null,
          address: b.address || null, admission_date: b.admission_date || existing.admission_date, status: b.status,
        } }, { session });
      } else {
        assertValid(profileRules, b);
        await collection('users').updateOne({ id: user.id }, { $set: { phone: b.phone } }, { session });
        await collection('students').updateOne({ id }, { $set: {
          date_of_birth: b.date_of_birth || null, blood_group: b.blood_group || null, guardian_name: b.guardian_name || null,
          guardian_phone: b.guardian_phone || null, address: b.address || null,
        } }, { session });
      }
    });
    res.json(await getStudent(id));
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'Email or roll number already exists');
    throw err;
  }
}));
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const student = await collection('students').findOne({ id: Number(req.params.id) });
  if (!student) throw new HttpError(404, 'Student not found');
  await withTransaction(async (session) => {
    const fees = await collection('fees').find({ student_id: student.id }, { session }).project({ id: 1 }).toArray();
    await collection('payments').deleteMany({ fee_id: { $in: fees.map((f) => f.id) } }, { session });
    for (const name of ['students', 'allocations', 'fees', 'attendance', 'leaves', 'meal_opt_outs', 'complaints']) {
      const field = name === 'students' ? 'id' : 'student_id';
      await collection(name).deleteMany({ [field]: name === 'students' ? student.id : student.id }, { session });
    }
    await collection('notifications').deleteMany({ user_id: student.user_id }, { session });
    await collection('users').deleteOne({ id: student.user_id }, { session });
  });
  res.json({ message: 'Student deleted' });
}));
module.exports = router;
