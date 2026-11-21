const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify } = require('../utils/notify');
const { today, isDate } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`;

// status is calculated from the payments, never stored
const FEE_SELECT = `
  SELECT f.id, f.student_id, f.title, f.amount, f.due_date, f.created_at, u.name AS student_name, s.roll_number,
         COALESCE(p.paid, 0) AS paid_amount, f.amount - COALESCE(p.paid, 0) AS balance,
         CASE WHEN COALESCE(p.paid, 0) >= f.amount THEN 'paid'
              WHEN f.due_date < CURRENT_DATE THEN 'overdue'
              WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
              ELSE 'pending' END AS status
    FROM fees f
    JOIN students s ON s.id = f.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN (SELECT fee_id, SUM(amount) AS paid FROM payments GROUP BY fee_id) p ON p.fee_id = f.id`;

const PAYMENT_SELECT = `
  SELECT p.id, p.receipt_no, p.amount, p.method, p.reference, p.payment_date, p.remarks,
         f.id AS fee_id, f.title AS fee_title, s.id AS student_id, s.roll_number, u.name AS student_name,
         rb.name AS received_by_name
    FROM payments p
    JOIN fees f ON f.id = p.fee_id
    JOIN students s ON s.id = f.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users rb ON rb.id = p.received_by`;

const fetchFee = async (id) => (await query(`${FEE_SELECT} WHERE f.id = $1`, [id])).rows[0];

router.get('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  res.json((await query(`${FEE_SELECT} ORDER BY f.due_date DESC, f.id DESC`)).rows);
}));

router.get('/mine', authorize('student'), asyncHandler(async (req, res) => {
  res.json((await query(`${FEE_SELECT} WHERE f.student_id = $1 ORDER BY f.due_date DESC, f.id DESC`, [req.user.student_id])).rows);
}));

// Payment records: staff see all, students see their own
router.get('/payments', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const isStudent = req.user.role === 'student';
  const { rows } = await query(
    `${PAYMENT_SELECT} WHERE ($1::int IS NULL OR s.id = $1) ORDER BY p.payment_date DESC, p.id DESC`,
    [isStudent ? req.user.student_id : null]
  );
  res.json(rows);
}));

// Everything needed to print a receipt
router.get('/payments/:id', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.receipt_no, p.amount, p.method, p.reference, p.payment_date, p.remarks, p.created_at,
            f.title AS fee_title, f.amount AS fee_amount, f.due_date,
            (SELECT COALESCE(SUM(x.amount), 0) FROM payments x WHERE x.fee_id = f.id) AS total_paid,
            s.id AS student_id, s.roll_number, s.course, u.name AS student_name, u.email AS student_email,
            rb.name AS received_by_name, h.name AS hostel_name, r.room_number, b.bed_number
       FROM payments p
       JOIN fees f ON f.id = p.fee_id
       JOIN students s ON s.id = f.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN users rb ON rb.id = p.received_by
       LEFT JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN hostels h ON h.id = r.hostel_id
      WHERE p.id = $1`,
    [Number(req.params.id)]
  );
  const receipt = rows[0];
  if (!receipt) throw new HttpError(404, 'Receipt not found');
  if (req.user.role === 'student' && receipt.student_id !== req.user.student_id) throw new HttpError(403, 'You can only view your own receipts');
  res.json(receipt);
}));

// Create a fee for one student, a whole hostel, or every active student
router.post('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({
    scope: { required: true, oneOf: ['student', 'hostel', 'all'] },
    student_id: { type: 'int', label: 'a student' },
    hostel_id: { type: 'int', label: 'a hostel' },
    title: { required: true, maxLength: 120 },
    amount: { required: true, type: 'number', min: 1, label: 'the amount' },
    due_date: { required: true, type: 'date', label: 'due date' },
  }, req.body);
  const b = req.body;

  let students;
  if (b.scope === 'student') {
    if (!b.student_id) throw new HttpError(400, 'Choose a student', { student_id: 'Choose a student' });
    students = await query('SELECT id, user_id FROM students WHERE id = $1', [b.student_id]);
  } else if (b.scope === 'hostel') {
    if (!b.hostel_id) throw new HttpError(400, 'Choose a hostel', { hostel_id: 'Choose a hostel' });
    students = await query(
      `SELECT s.id, s.user_id FROM students s
         JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
         JOIN beds bd ON bd.id = a.bed_id JOIN rooms r ON r.id = bd.room_id
        WHERE r.hostel_id = $1 AND s.status = 'active'`, [b.hostel_id]);
  } else {
    students = await query(`SELECT id, user_id FROM students WHERE status = 'active'`);
  }
  if (!students.rowCount) throw new HttpError(400, 'No eligible students found for this selection');

  await withTransaction(async (c) => {
    await c.query(
      `INSERT INTO fees (student_id, title, amount, due_date, created_by)
       SELECT unnest($1::int[]), $2::text, $3::numeric, $4::date, $5::int`,
      [students.rows.map((s) => s.id), b.title, b.amount, b.due_date, req.user.id]
    );
    await notify(students.rows.map((s) => s.user_id), 'New fee added', `${b.title}: ${money(b.amount)}, due ${b.due_date}.`, '/fees', c);
  });
  res.status(201).json({ created: students.rowCount });
}));

router.put('/:id', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({
    title: { required: true, maxLength: 120 },
    amount: { required: true, type: 'number', min: 1, label: 'the amount' },
    due_date: { required: true, type: 'date', label: 'due date' },
  }, req.body);
  const fee = await fetchFee(Number(req.params.id));
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (Number(req.body.amount) < fee.paid_amount) {
    throw new HttpError(400, 'Amount cannot be lower than what is already paid', { amount: `Already paid ${money(fee.paid_amount)}` });
  }
  await query('UPDATE fees SET title = $1, amount = $2, due_date = $3 WHERE id = $4', [req.body.title, req.body.amount, req.body.due_date, fee.id]);
  res.json(await fetchFee(fee.id));
}));

router.delete('/:id', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const fee = await fetchFee(Number(req.params.id));
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (fee.paid_amount > 0) throw new HttpError(409, 'This fee already has payments and cannot be deleted');
  await query('DELETE FROM fees WHERE id = $1', [fee.id]);
  res.json({ message: 'Fee deleted' });
}));

// Record a payment and generate its receipt number
router.post('/:id/payments', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({
    amount: { required: true, type: 'number', min: 1, label: 'the amount' },
    method: { required: true, oneOf: ['cash', 'upi', 'card', 'bank_transfer', 'cheque'], label: 'payment method' },
    payment_date: { type: 'date', label: 'payment date' },
    reference: { maxLength: 100 },
    remarks: { maxLength: 255 },
  }, req.body);
  const b = req.body;
  if (b.payment_date && b.payment_date > today()) throw new HttpError(400, 'Payment date cannot be in the future', { payment_date: 'Cannot be in the future' });
  const feeId = Number(req.params.id);

  const payment = await withTransaction(async (c) => {
    const lock = await c.query('SELECT id, student_id, title, amount FROM fees WHERE id = $1 FOR UPDATE', [feeId]);
    if (!lock.rowCount) throw new HttpError(404, 'Fee not found');
    const paid = (await c.query('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE fee_id = $1', [feeId])).rows[0].paid;
    const balance = lock.rows[0].amount - paid;
    if (balance <= 0) throw new HttpError(409, 'This fee is already fully paid');
    if (Number(b.amount) > balance) throw new HttpError(400, `Amount exceeds the balance of ${money(balance)}`, { amount: `Balance is ${money(balance)}` });

    const ins = await c.query(
      `INSERT INTO payments (fee_id, receipt_no, amount, method, reference, payment_date, received_by, remarks)
       VALUES ($1, 'RCT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || nextval('receipt_seq'), $2, $3, $4,
               COALESCE($5::date, CURRENT_DATE), $6, $7)
       RETURNING id, receipt_no`,
      [feeId, b.amount, b.method, b.reference, b.payment_date, req.user.id, b.remarks]
    );
    const stu = (await c.query('SELECT user_id FROM students WHERE id = $1', [lock.rows[0].student_id])).rows[0];
    await notify(stu.user_id, 'Payment received', `${money(b.amount)} received for ${lock.rows[0].title}. Receipt ${ins.rows[0].receipt_no}.`, '/fees', c);
    return ins.rows[0];
  });
  res.status(201).json(payment);
}));

module.exports = router;
