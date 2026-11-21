// Hostels, rooms and beds. Mounted at /api, so paths are /hostels, /rooms and /beds.
const router = require('express').Router();
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { optInt } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(['/hostels', '/rooms', '/beds'], authenticate, authorize('admin', 'warden'));
router.param('id', idParam);

// ------------------------------- Hostels -------------------------------
const hostelRules = {
  name: { required: true, maxLength: 100 },
  type: { required: true, oneOf: ['boys', 'girls', 'mixed'] },
  address: { maxLength: 255 },
  warden_id: { type: 'int', label: 'warden' },
};

const HOSTEL_SELECT = `
  SELECT h.id, h.name, h.type, h.address, h.warden_id, u.name AS warden_name,
         (SELECT COUNT(*) FROM rooms r WHERE r.hostel_id = h.id) AS room_count,
         (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.hostel_id = h.id AND b.is_usable) AS bed_count,
         (SELECT COUNT(*) FROM allocations a JOIN beds b ON b.id = a.bed_id JOIN rooms r ON r.id = b.room_id
           WHERE r.hostel_id = h.id AND a.status = 'active') AS occupied
    FROM hostels h LEFT JOIN users u ON u.id = h.warden_id`;

async function assertWarden(id) {
  if (id == null) return;
  const { rowCount } = await query(`SELECT 1 FROM users WHERE id = $1 AND role = 'warden'`, [id]);
  if (!rowCount) throw new HttpError(400, 'Selected warden does not exist', { warden_id: 'Choose a valid warden' });
}

const hostelNameTaken = async (name, exceptId = 0) =>
  (await query('SELECT 1 FROM hostels WHERE LOWER(name) = LOWER($1) AND id <> $2', [name, exceptId])).rowCount > 0;

router.get('/hostels', asyncHandler(async (req, res) => {
  res.json((await query(`${HOSTEL_SELECT} ORDER BY h.name`)).rows);
}));

router.post('/hostels', authorize('admin'), asyncHandler(async (req, res) => {
  assertValid(hostelRules, req.body);
  const b = req.body;
  await assertWarden(b.warden_id);
  if (await hostelNameTaken(b.name)) throw new HttpError(409, 'A hostel with this name already exists', { name: 'Name already in use' });
  const { rows } = await query('INSERT INTO hostels (name, type, address, warden_id) VALUES ($1, $2, $3, $4) RETURNING id', [b.name, b.type, b.address, b.warden_id]);
  res.status(201).json((await query(`${HOSTEL_SELECT} WHERE h.id = $1`, [rows[0].id])).rows[0]);
}));

router.put('/hostels/:id', authorize('admin'), asyncHandler(async (req, res) => {
  assertValid(hostelRules, req.body);
  const b = req.body;
  const id = Number(req.params.id);
  await assertWarden(b.warden_id);
  if (await hostelNameTaken(b.name, id)) throw new HttpError(409, 'A hostel with this name already exists', { name: 'Name already in use' });
  const upd = await query('UPDATE hostels SET name = $1, type = $2, address = $3, warden_id = $4 WHERE id = $5', [b.name, b.type, b.address, b.warden_id, id]);
  if (!upd.rowCount) throw new HttpError(404, 'Hostel not found');
  res.json((await query(`${HOSTEL_SELECT} WHERE h.id = $1`, [id])).rows[0]);
}));

router.delete('/hostels/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const del = await query('DELETE FROM hostels WHERE id = $1', [Number(req.params.id)]);
  if (!del.rowCount) throw new HttpError(404, 'Hostel not found');
  res.json({ message: 'Hostel deleted' });
}));

// -------------------------------- Rooms --------------------------------
const roomRules = {
  hostel_id: { required: true, type: 'int', label: 'a hostel' },
  room_number: { required: true, maxLength: 20, label: 'the room number' },
  floor: { required: true, type: 'int', min: 0, max: 50 },
  room_type: { required: true, oneOf: ['single', 'double', 'triple', 'dormitory'], label: 'room type' },
  capacity: { required: true, type: 'int', min: 1, max: 12 },
  monthly_fee: { required: true, type: 'number', min: 0, label: 'the monthly fee' },
};

router.get('/rooms', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.hostel_id, h.name AS hostel_name, r.room_number, r.floor, r.room_type, r.capacity, r.monthly_fee,
            (SELECT COUNT(*) FROM beds b WHERE b.room_id = r.id AND b.is_usable) AS usable_beds,
            (SELECT COUNT(*) FROM allocations a JOIN beds b ON b.id = a.bed_id WHERE b.room_id = r.id AND a.status = 'active') AS occupied
       FROM rooms r JOIN hostels h ON h.id = r.hostel_id
      WHERE ($1::int IS NULL OR r.hostel_id = $1)
      ORDER BY h.name, r.floor, r.room_number`,
    [optInt(req.query.hostel_id)]
  );
  res.json(rows);
}));

router.post('/rooms', asyncHandler(async (req, res) => {
  assertValid(roomRules, req.body);
  const b = req.body;
  const room = await withTransaction(async (c) => {
    const dup = await c.query('SELECT 1 FROM rooms WHERE hostel_id = $1 AND LOWER(room_number) = LOWER($2)', [b.hostel_id, b.room_number]);
    if (dup.rowCount) throw new HttpError(409, 'This room number already exists in the hostel', { room_number: 'Room number already exists in this hostel' });
    const r = await c.query(
      `INSERT INTO rooms (hostel_id, room_number, floor, room_type, capacity, monthly_fee) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [b.hostel_id, b.room_number, b.floor, b.room_type, b.capacity, b.monthly_fee]
    );
    await c.query('INSERT INTO beds (room_id, bed_number) SELECT $1::int, g FROM generate_series(1, $2::int) g', [r.rows[0].id, b.capacity]);
    return r.rows[0];
  });
  res.status(201).json(room);
}));

router.put('/rooms/:id', asyncHandler(async (req, res) => {
  assertValid(roomRules, req.body);
  const b = req.body;
  const id = Number(req.params.id);
  const room = await withTransaction(async (c) => {
    const cur = await c.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rowCount) throw new HttpError(404, 'Room not found');
    const dup = await c.query('SELECT 1 FROM rooms WHERE hostel_id = $1 AND LOWER(room_number) = LOWER($2) AND id <> $3', [b.hostel_id, b.room_number, id]);
    if (dup.rowCount) throw new HttpError(409, 'This room number already exists in the hostel', { room_number: 'Room number already exists in this hostel' });

    // Keep the number of bed rows equal to the room capacity
    const bedCount = (await c.query('SELECT COUNT(*) AS n FROM beds WHERE room_id = $1', [id])).rows[0].n;
    const cap = Number(b.capacity);
    if (cap < bedCount) {
      const used = (await c.query('SELECT COUNT(*) AS n FROM beds b JOIN allocations a ON a.bed_id = b.id WHERE b.room_id = $1 AND b.bed_number > $2', [id, cap])).rows[0].n;
      if (used > 0) {
        throw new HttpError(409, 'Cannot reduce capacity: the beds being removed have allocation records. Mark them as under maintenance instead.', { capacity: 'Beds above this number are or were in use' });
      }
      await c.query('DELETE FROM beds WHERE room_id = $1 AND bed_number > $2', [id, cap]);
    } else if (cap > bedCount) {
      await c.query('INSERT INTO beds (room_id, bed_number) SELECT $1::int, g FROM generate_series($2::int, $3::int) g', [id, bedCount + 1, cap]);
    }
    const r = await c.query(
      `UPDATE rooms SET hostel_id = $1, room_number = $2, floor = $3, room_type = $4, capacity = $5, monthly_fee = $6 WHERE id = $7 RETURNING *`,
      [b.hostel_id, b.room_number, b.floor, b.room_type, b.capacity, b.monthly_fee, id]
    );
    return r.rows[0];
  });
  res.json(room);
}));

router.delete('/rooms/:id', asyncHandler(async (req, res) => {
  const del = await query('DELETE FROM rooms WHERE id = $1', [Number(req.params.id)]);
  if (!del.rowCount) throw new HttpError(404, 'Room not found');
  res.json({ message: 'Room deleted' });
}));

// ------------------------------ Beds ------------------------------
router.get('/rooms/:id/beds', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.bed_number, b.is_usable, a.id AS allocation_id, s.id AS student_id, u.name AS student_name, s.roll_number
       FROM beds b
       LEFT JOIN allocations a ON a.bed_id = b.id AND a.status = 'active'
       LEFT JOIN students s ON s.id = a.student_id
       LEFT JOIN users u ON u.id = s.user_id
      WHERE b.room_id = $1 ORDER BY b.bed_number`,
    [Number(req.params.id)]
  );
  res.json(rows);
}));

// Free, usable beds (used by the allocation and transfer forms)
router.get('/beds/available', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.bed_number, r.room_number, r.floor, r.room_type, r.monthly_fee,
            h.id AS hostel_id, h.name AS hostel_name, h.type AS hostel_type
       FROM beds b JOIN rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
      WHERE b.is_usable
        AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.bed_id = b.id AND a.status = 'active')
        AND ($1::int IS NULL OR h.id = $1)
      ORDER BY h.name, r.room_number, b.bed_number`,
    [optInt(req.query.hostel_id)]
  );
  res.json(rows);
}));

router.put('/beds/:id', asyncHandler(async (req, res) => {
  assertValid({ is_usable: { required: true, type: 'boolean', label: 'bed status' } }, req.body);
  const id = Number(req.params.id);
  if (!req.body.is_usable) {
    const occ = await query(`SELECT 1 FROM allocations WHERE bed_id = $1 AND status = 'active'`, [id]);
    if (occ.rowCount) throw new HttpError(409, 'This bed is occupied. Transfer or vacate the student first.');
  }
  const upd = await query('UPDATE beds SET is_usable = $1 WHERE id = $2 RETURNING id, bed_number, is_usable', [req.body.is_usable, id]);
  if (!upd.rowCount) throw new HttpError(404, 'Bed not found');
  res.json(upd.rows[0]);
}));

module.exports = router;
