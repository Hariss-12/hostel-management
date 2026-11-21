const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

const ALLOCATION_SELECT = `
  SELECT a.id, a.student_id, a.bed_id, a.start_date, a.end_date, a.status, a.remarks,
         u.name AS student_name, s.roll_number, h.id AS hostel_id, h.name AS hostel_name,
         r.room_number, r.floor, r.room_type, r.monthly_fee, b.bed_number
    FROM allocations a
    JOIN students s ON s.id = a.student_id
    JOIN users u ON u.id = s.user_id
    JOIN beds b ON b.id = a.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN hostels h ON h.id = r.hostel_id`;

const bedLabel = (a) => `${a.hostel_name}, Room ${a.room_number}, Bed ${a.bed_number}`;

// Locks the bed row and makes sure it can be given to a student of this gender
async function lockFreeBed(c, bedId, gender) {
  const { rows } = await c.query(
    `SELECT b.id, b.is_usable, h.type AS hostel_type
       FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
      WHERE b.id = $1 FOR UPDATE OF b`,
    [bedId]
  );
  if (!rows[0]) throw new HttpError(404, 'Bed not found');
  if (!rows[0].is_usable) throw new HttpError(409, 'This bed is under maintenance', { bed_id: 'Bed is under maintenance' });
  if ((await c.query(`SELECT 1 FROM allocations WHERE bed_id = $1 AND status = 'active'`, [bedId])).rowCount) {
    throw new HttpError(409, 'This bed is already occupied', { bed_id: 'Bed is already occupied' });
  }
  const t = rows[0].hostel_type;
  if ((t === 'boys' && gender === 'female') || (t === 'girls' && gender === 'male')) {
    throw new HttpError(400, `This is a ${t} hostel and cannot house this student`, { bed_id: `Not allowed in a ${t} hostel` });
  }
}

router.get('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const { rows } = await query(`${ALLOCATION_SELECT} ORDER BY (a.status = 'active') DESC, a.start_date DESC, a.id DESC`);
  res.json(rows);
}));

// Student: own allocation history (active one first)
router.get('/mine', authorize('student'), asyncHandler(async (req, res) => {
  const { rows } = await query(`${ALLOCATION_SELECT} WHERE a.student_id = $1 ORDER BY (a.status = 'active') DESC, a.start_date DESC, a.id DESC`, [req.user.student_id]);
  res.json(rows);
}));

// Student: who shares the room right now
router.get('/roommates', authorize('student'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.name, s.course, s.year_of_study, b2.bed_number
       FROM allocations me
       JOIN beds b1 ON b1.id = me.bed_id
       JOIN beds b2 ON b2.room_id = b1.room_id
       JOIN allocations a2 ON a2.bed_id = b2.id AND a2.status = 'active' AND a2.student_id <> me.student_id
       JOIN students s ON s.id = a2.student_id
       JOIN users u ON u.id = s.user_id
      WHERE me.student_id = $1 AND me.status = 'active'
      ORDER BY b2.bed_number`,
    [req.user.student_id]
  );
  res.json(rows);
}));

router.post('/', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({
    student_id: { required: true, type: 'int', label: 'a student' },
    bed_id: { required: true, type: 'int', label: 'a bed' },
    start_date: { type: 'date', label: 'start date' },
    remarks: { maxLength: 255 },
  }, req.body);
  const b = req.body;

  const id = await withTransaction(async (c) => {
    const stu = (await c.query('SELECT id, user_id, gender, status FROM students WHERE id = $1', [b.student_id])).rows[0];
    if (!stu) throw new HttpError(404, 'Student not found');
    if (stu.status !== 'active') throw new HttpError(400, 'Only active students can be allocated a bed', { student_id: 'Student is not active' });
    if ((await c.query(`SELECT 1 FROM allocations WHERE student_id = $1 AND status = 'active'`, [stu.id])).rowCount) {
      throw new HttpError(409, 'This student already has a bed. Use Transfer to move them.', { student_id: 'Student already has a bed' });
    }
    await lockFreeBed(c, b.bed_id, stu.gender);
    const ins = await c.query(
      `INSERT INTO allocations (student_id, bed_id, start_date, remarks, created_by)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5) RETURNING id`,
      [stu.id, b.bed_id, b.start_date, b.remarks, req.user.id]
    );
    return ins.rows[0].id;
  });

  const alloc = (await query(`${ALLOCATION_SELECT} WHERE a.id = $1`, [id])).rows[0];
  const stu = (await query('SELECT user_id FROM students WHERE id = $1', [alloc.student_id])).rows[0];
  await notify(stu.user_id, 'Room allocated', `You have been allocated ${bedLabel(alloc)}.`, '/my-room');
  res.status(201).json(alloc);
}));

router.post('/:id/transfer', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ new_bed_id: { required: true, type: 'int', label: 'the new bed' }, remarks: { maxLength: 255 } }, req.body);
  const b = req.body;
  const id = Number(req.params.id);

  const newId = await withTransaction(async (c) => {
    const cur = (await c.query(
      `SELECT a.id, a.student_id, a.bed_id, a.status, s.gender FROM allocations a JOIN students s ON s.id = a.student_id WHERE a.id = $1 FOR UPDATE OF a`, [id]
    )).rows[0];
    if (!cur) throw new HttpError(404, 'Allocation not found');
    if (cur.status !== 'active') throw new HttpError(409, 'Only an active allocation can be transferred');
    if (Number(b.new_bed_id) === cur.bed_id) throw new HttpError(400, 'Choose a different bed', { new_bed_id: 'Student is already in this bed' });
    await lockFreeBed(c, b.new_bed_id, cur.gender);
    await c.query(`UPDATE allocations SET status = 'transferred', end_date = CURRENT_DATE WHERE id = $1`, [id]);
    const ins = await c.query(
      `INSERT INTO allocations (student_id, bed_id, start_date, remarks, created_by) VALUES ($1, $2, CURRENT_DATE, $3, $4) RETURNING id`,
      [cur.student_id, b.new_bed_id, b.remarks, req.user.id]
    );
    return ins.rows[0].id;
  });

  const alloc = (await query(`${ALLOCATION_SELECT} WHERE a.id = $1`, [newId])).rows[0];
  const stu = (await query('SELECT user_id FROM students WHERE id = $1', [alloc.student_id])).rows[0];
  await notify(stu.user_id, 'Room transfer', `You have been moved to ${bedLabel(alloc)}.`, '/my-room');
  res.json(alloc);
}));

router.post('/:id/vacate', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ remarks: { maxLength: 255 } }, req.body);
  const upd = await query(
    `UPDATE allocations SET status = 'vacated', end_date = CURRENT_DATE, remarks = COALESCE($2, remarks)
      WHERE id = $1 AND status = 'active' RETURNING student_id`,
    [Number(req.params.id), req.body.remarks]
  );
  if (!upd.rowCount) throw new HttpError(404, 'No active allocation found');
  const stu = (await query('SELECT user_id FROM students WHERE id = $1', [upd.rows[0].student_id])).rows[0];
  await notify(stu.user_id, 'Room vacated', 'Your hostel room allocation has ended.', '/my-room');
  res.json({ message: 'Room vacated' });
}));

module.exports = router;
