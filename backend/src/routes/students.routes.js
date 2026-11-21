const router = require('express').Router();
const bcrypt = require('bcrypt');
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

const STUDENT_SELECT = `
  SELECT s.id, s.user_id, u.name, u.email, u.phone, s.roll_number, s.course, s.year_of_study, s.gender,
         s.date_of_birth, s.blood_group, s.guardian_name, s.guardian_phone, s.address, s.admission_date, s.status,
         h.id AS hostel_id, h.name AS hostel_name, r.room_number, b.bed_number
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN allocations a ON a.student_id = s.id AND a.status = 'active'
    LEFT JOIN beds b ON b.id = a.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN hostels h ON h.id = r.hostel_id`;

const fetchStudent = async (id) => (await query(`${STUDENT_SELECT} WHERE s.id = $1`, [id])).rows[0];

const profileRules = {
  phone: { type: 'phone' },
  date_of_birth: { type: 'date', label: 'date of birth' },
  blood_group: { oneOf: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], label: 'blood group' },
  guardian_name: { maxLength: 100, label: "the guardian's name" },
  guardian_phone: { type: 'phone', label: "the guardian's phone" },
  address: { maxLength: 255 },
};

const staffRules = {
  ...profileRules,
  name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 150 },
  roll_number: { required: true, maxLength: 30, label: 'the roll number' },
  course: { required: true, maxLength: 100 },
  year_of_study: { required: true, type: 'int', min: 1, max: 4, label: 'the year of study' },
  gender: { required: true, oneOf: ['male', 'female', 'other'] },
  admission_date: { type: 'date', label: 'admission date' },
};

const conflict = (field, message) => new HttpError(409, message, { [field]: message });

router.get(
  '/',
  authorize('admin', 'warden'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${STUDENT_SELECT} ORDER BY u.name`);
    res.json(rows);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const isStaff = ['admin', 'warden'].includes(req.user.role);
    if (!isStaff && req.user.student_id !== id) throw new HttpError(403, 'You can only view your own profile');
    const student = await fetchStudent(id);
    if (!student) throw new HttpError(404, 'Student not found');
    res.json(student);
  })
);

router.post(
  '/',
  authorize('admin', 'warden'),
  asyncHandler(async (req, res) => {
    assertValid({ ...staffRules, password: { required: true, minLength: 6, maxLength: 72, label: 'a temporary password' } }, req.body);
    const b = req.body;
    const email = b.email.toLowerCase();

    const id = await withTransaction(async (c) => {
      if ((await c.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount) throw conflict('email', 'Email is already registered');
      if ((await c.query('SELECT 1 FROM students WHERE LOWER(roll_number) = LOWER($1)', [b.roll_number])).rowCount) {
        throw conflict('roll_number', 'Roll number already exists');
      }
      const hash = await bcrypt.hash(b.password, 10);
      const u = await c.query(
        `INSERT INTO users (name, email, password_hash, role, phone) VALUES ($1, $2, $3, 'student', $4) RETURNING id`,
        [b.name, email, hash, b.phone]
      );
      const s = await c.query(
        `INSERT INTO students (user_id, roll_number, course, year_of_study, gender, date_of_birth, blood_group,
                               guardian_name, guardian_phone, address, admission_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::date, CURRENT_DATE)) RETURNING id`,
        [u.rows[0].id, b.roll_number, b.course, b.year_of_study, b.gender, b.date_of_birth, b.blood_group,
         b.guardian_name, b.guardian_phone, b.address, b.admission_date]
      );
      return s.rows[0].id;
    });
    res.status(201).json(await fetchStudent(id));
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const isStaff = ['admin', 'warden'].includes(req.user.role);
    if (!isStaff && req.user.student_id !== id) throw new HttpError(403, 'You can only edit your own profile');
    const existing = await fetchStudent(id);
    if (!existing) throw new HttpError(404, 'Student not found');
    const b = req.body;

    await withTransaction(async (c) => {
      if (isStaff) {
        assertValid({ ...staffRules, status: { required: true, oneOf: ['active', 'inactive', 'alumni'] }, password: { minLength: 6, maxLength: 72 } }, b);
        const email = b.email.toLowerCase();
        if ((await c.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, existing.user_id])).rowCount) throw conflict('email', 'Email is already registered');
        if ((await c.query('SELECT 1 FROM students WHERE LOWER(roll_number) = LOWER($1) AND id <> $2', [b.roll_number, id])).rowCount) {
          throw conflict('roll_number', 'Roll number already exists');
        }
        // Inactive / alumni students can no longer sign in
        await c.query('UPDATE users SET name = $1, email = $2, phone = $3, is_active = $4 WHERE id = $5',
          [b.name, email, b.phone, b.status === 'active', existing.user_id]);
        if (b.password) await c.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(b.password, 10), existing.user_id]);
        await c.query(
          `UPDATE students SET roll_number = $1, course = $2, year_of_study = $3, gender = $4, date_of_birth = $5,
                  blood_group = $6, guardian_name = $7, guardian_phone = $8, address = $9,
                  admission_date = COALESCE($10::date, admission_date), status = $11
            WHERE id = $12`,
          [b.roll_number, b.course, b.year_of_study, b.gender, b.date_of_birth, b.blood_group,
           b.guardian_name, b.guardian_phone, b.address, b.admission_date, b.status, id]
        );
      } else {
        // Students may only change their contact details
        assertValid(profileRules, b);
        await c.query('UPDATE users SET phone = $1 WHERE id = $2', [b.phone, existing.user_id]);
        await c.query(
          `UPDATE students SET date_of_birth = $1, blood_group = $2, guardian_name = $3, guardian_phone = $4, address = $5 WHERE id = $6`,
          [b.date_of_birth, b.blood_group, b.guardian_name, b.guardian_phone, b.address, id]
        );
      }
    });
    res.json(await fetchStudent(id));
  })
);

// Permanently removes the student and every record that belongs to them (admin only).
router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const student = await fetchStudent(Number(req.params.id));
    if (!student) throw new HttpError(404, 'Student not found');
    await query('DELETE FROM users WHERE id = $1', [student.user_id]);
    res.json({ message: 'Student deleted' });
  })
);

module.exports = router;
