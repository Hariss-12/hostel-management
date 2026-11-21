const router = require('express').Router();
const { collection, insert, nextId, withTransaction, isDuplicate } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify } = require('../utils/notify');
const { today } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('id', idParam);
const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`;

async function feeRows(match = {}) {
  const rows = await collection('fees').aggregate([
    { $match: match }, { $lookup: { from: 'students', localField: 'student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'payments', localField: 'id', foreignField: 'fee_id', as: 'payments' } },
    { $addFields: { paid_amount: { $sum: '$payments.amount' } } },
    { $addFields: { balance: { $subtract: ['$amount', '$paid_amount'] }, status: { $switch: { branches: [
      { case: { $gte: ['$paid_amount', '$amount'] }, then: 'paid' }, { case: { $lt: ['$due_date', today()] }, then: 'overdue' },
      { case: { $gt: ['$paid_amount', 0] }, then: 'partial' },
    ], default: 'pending' } } } },
    { $project: { _id: 0, id: 1, student_id: 1, title: 1, amount: 1, due_date: 1, created_at: 1, student_name: '$user.name', roll_number: '$student.roll_number', paid_amount: 1, balance: 1, status: 1 } },
    { $sort: { due_date: -1, id: -1 } },
  ]).toArray();
  return rows;
}
async function paymentRows(match = {}) {
  return collection('payments').aggregate([
    { $match: match }, { $lookup: { from: 'fees', localField: 'fee_id', foreignField: 'id', as: 'fee' } }, { $unwind: '$fee' },
    { $lookup: { from: 'students', localField: 'fee.student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'users', localField: 'received_by', foreignField: 'id', as: 'receiver' } }, { $unwind: { path: '$receiver', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: 1, receipt_no: 1, amount: 1, method: 1, reference: 1, payment_date: 1, remarks: 1, fee_id: '$fee.id', fee_title: '$fee.title', student_id: '$student.id', roll_number: '$student.roll_number', student_name: '$user.name', received_by_name: '$receiver.name' } },
    { $sort: { payment_date: -1, id: -1 } },
  ]).toArray();
}
router.get('/', authorize('admin', 'warden'), asyncHandler(async (_req, res) => res.json(await feeRows())));
router.get('/mine', authorize('student'), asyncHandler(async (req, res) => res.json(await feeRows({ student_id: req.user.student_id }))));
router.get('/payments', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const rows = await paymentRows();
  res.json(req.user.role === 'student' ? rows.filter((p) => p.student_id === req.user.student_id) : rows);
}));
router.get('/payments/:id', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const payments = await collection('payments').aggregate([
    { $match: { id: Number(req.params.id) } }, { $lookup: { from: 'fees', localField: 'fee_id', foreignField: 'id', as: 'fee' } }, { $unwind: '$fee' },
    { $lookup: { from: 'students', localField: 'fee.student_id', foreignField: 'id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'users', localField: 'student.user_id', foreignField: 'id', as: 'user' } }, { $unwind: '$user' },
    { $lookup: { from: 'users', localField: 'received_by', foreignField: 'id', as: 'receiver' } }, { $unwind: { path: '$receiver', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'payments', localField: 'fee.id', foreignField: 'fee_id', as: 'allPayments' } },
    { $lookup: { from: 'allocations', let: { sid: '$student.id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$student_id', '$$sid'] }, { $eq: ['$status', 'active'] }] } } }, { $limit: 1 }, { $lookup: { from: 'beds', localField: 'bed_id', foreignField: 'id', as: 'bed' } }, { $unwind: { path: '$bed', preserveNullAndEmptyArrays: true } }, { $lookup: { from: 'rooms', localField: 'bed.room_id', foreignField: 'id', as: 'room' } }, { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } }, { $lookup: { from: 'hostels', localField: 'room.hostel_id', foreignField: 'id', as: 'hostel' } }, { $unwind: { path: '$hostel', preserveNullAndEmptyArrays: true } }], as: 'allocation' } },
    { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, id: 1, receipt_no: 1, amount: 1, method: 1, reference: 1, payment_date: 1, remarks: 1, created_at: 1, fee_title: '$fee.title', fee_amount: '$fee.amount', due_date: '$fee.due_date', total_paid: { $sum: '$allPayments.amount' }, student_id: '$student.id', roll_number: '$student.roll_number', course: '$student.course', student_name: '$user.name', student_email: '$user.email', received_by_name: '$receiver.name', hostel_name: '$allocation.hostel.name', room_number: '$allocation.room.room_number', bed_number: '$allocation.bed.bed_number' } },
  ]).toArray();
  const receipt = payments[0];
  if (!receipt) throw new HttpError(404, 'Receipt not found');
  if (req.user.role === 'student' && receipt.student_id !== req.user.student_id) throw new HttpError(403, 'You can only view your own receipts');
  res.json(receipt);
}));
router.post('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ scope: { required: true, oneOf: ['student', 'hostel', 'all'] }, student_id: { type: 'int', label: 'a student' }, hostel_id: { type: 'int', label: 'a hostel' }, title: { required: true, maxLength: 120 }, amount: { required: true, type: 'number', min: 1, label: 'the amount' }, due_date: { required: true, type: 'date', label: 'due date' } }, req.body);
  const b = req.body; let students;
  if (b.scope === 'student') {
    if (!b.student_id) throw new HttpError(400, 'Choose a student', { student_id: 'Choose a student' });
    const s = await collection('students').findOne({ id: Number(b.student_id) }); students = s ? [s] : [];
  } else {
    students = await collection('students').find({ status: 'active' }).toArray();
    if (b.scope === 'hostel') {
      if (!b.hostel_id) throw new HttpError(400, 'Choose a hostel', { hostel_id: 'Choose a hostel' });
      const selected = [];
      for (const s of students) {
        const a = await collection('allocations').findOne({ student_id: s.id, status: 'active' }); const bed = a && await collection('beds').findOne({ id: a.bed_id }); const room = bed && await collection('rooms').findOne({ id: bed.room_id });
        if (room && room.hostel_id === Number(b.hostel_id)) selected.push(s);
      }
      students = selected;
    }
  }
  if (!students.length) throw new HttpError(400, 'No eligible students found for this selection');
  await withTransaction(async (session) => {
    for (const s of students) await insert('fees', { student_id: s.id, title: b.title, amount: Number(b.amount), due_date: b.due_date, created_by: req.user.id, created_at: new Date() }, session);
    await notify(students.map((s) => s.user_id), 'New fee added', `${b.title}: ${money(b.amount)}, due ${b.due_date}.`, '/fees', session);
  });
  res.status(201).json({ created: students.length });
}));
router.put('/:id', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ title: { required: true, maxLength: 120 }, amount: { required: true, type: 'number', min: 1, label: 'the amount' }, due_date: { required: true, type: 'date', label: 'due date' } }, req.body);
  const id = Number(req.params.id); const fee = (await feeRows({ id }))[0];
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (Number(req.body.amount) < fee.paid_amount) throw new HttpError(400, 'Amount cannot be lower than what is already paid', { amount: `Already paid ${money(fee.paid_amount)}` });
  await collection('fees').updateOne({ id }, { $set: { title: req.body.title, amount: Number(req.body.amount), due_date: req.body.due_date } });
  res.json((await feeRows({ id }))[0]);
}));
router.delete('/:id', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const fee = (await feeRows({ id: Number(req.params.id) }))[0];
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (fee.paid_amount > 0) throw new HttpError(409, 'This fee already has payments and cannot be deleted');
  await collection('fees').deleteOne({ id: fee.id }); res.json({ message: 'Fee deleted' });
}));
router.post('/:id/payments', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ amount: { required: true, type: 'number', min: 1, label: 'the amount' }, method: { required: true, oneOf: ['cash', 'upi', 'card', 'bank_transfer', 'cheque'], label: 'payment method' }, payment_date: { type: 'date', label: 'payment date' }, reference: { maxLength: 100 }, remarks: { maxLength: 255 } }, req.body);
  const b = req.body; if (b.payment_date && b.payment_date > today()) throw new HttpError(400, 'Payment date cannot be in the future', { payment_date: 'Cannot be in the future' });
  const feeId = Number(req.params.id);
  const payment = await withTransaction(async (session) => {
    const fee = await collection('fees').findOne({ id: feeId }, { session }); if (!fee) throw new HttpError(404, 'Fee not found');
    await collection('fees').updateOne({ id: feeId }, { $inc: { _payment_revision: 1 } }, { session });
    const paid = await collection('payments').aggregate([{ $match: { fee_id: feeId } }, { $group: { _id: null, total: { $sum: '$amount' } } }], { session }).toArray();
    const balance = Number(fee.amount) - (paid[0]?.total || 0);
    if (balance <= 0) throw new HttpError(409, 'This fee is already fully paid');
    if (Number(b.amount) > balance) throw new HttpError(400, `Amount exceeds the balance of ${money(balance)}`, { amount: `Balance is ${money(balance)}` });
    const year = today().slice(0, 4); const receipt = `RCT-${year}-${String(await nextId('receipt', session)).padStart(6, '0')}`;
    const p = await insert('payments', { fee_id: feeId, receipt_no: receipt, amount: Number(b.amount), method: b.method, reference: b.reference || null, payment_date: b.payment_date || today(), received_by: req.user.id, remarks: b.remarks || null, created_at: new Date() }, session);
    const student = await collection('students').findOne({ id: fee.student_id }, { session });
    await notify(student.user_id, 'Payment received', `${money(b.amount)} received for ${fee.title}. Receipt ${receipt}.`, '/fees', session);
    return { id: p.id, receipt_no: p.receipt_no };
  });
  res.status(201).json(payment);
}));
module.exports = router;
