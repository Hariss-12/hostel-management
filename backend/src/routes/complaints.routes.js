const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { notify, activeUserIdsByRole, userIdOfStudent } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

const COMPLAINT_SELECT = `
  SELECT c.id, c.student_id, c.category, c.title, c.description, c.location, c.priority, c.status,
         c.assigned_to, c.resolution_note, c.created_at, c.updated_at, c.resolved_at,
         u.name AS student_name, s.roll_number, mu.name AS assigned_to_name
    FROM complaints c
    JOIN students s ON s.id = c.student_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users mu ON mu.id = c.assigned_to`;

const fetchComplaint = async (id) => (await query(`${COMPLAINT_SELECT} WHERE c.id = $1`, [id])).rows[0];

// Which statuses each role may set
const ALLOWED_STATUS = {
  admin: ['open', 'assigned', 'in_progress', 'resolved', 'closed'],
  warden: ['open', 'assigned', 'in_progress', 'resolved', 'closed'],
  maintenance: ['in_progress', 'resolved'],
  student: ['open', 'closed'],
};

router.get('/', asyncHandler(async (req, res) => {
  const { role, id, student_id: studentId } = req.user;
  const { rows } = await query(
    `${COMPLAINT_SELECT}
      WHERE ($1::int IS NULL OR c.student_id = $1) AND ($2::int IS NULL OR c.assigned_to = $2)
      ORDER BY (c.status IN ('resolved', 'closed')),
               CASE c.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, c.created_at DESC`,
    [role === 'student' ? studentId : null, role === 'maintenance' ? id : null]
  );
  res.json(rows);
}));

router.post('/', authorize('student'), asyncHandler(async (req, res) => {
  assertValid({
    category: { required: true, oneOf: ['electrical', 'plumbing', 'furniture', 'cleaning', 'internet', 'other'] },
    title: { required: true, minLength: 3, maxLength: 150 },
    description: { required: true, minLength: 5, maxLength: 1000 },
    priority: { required: true, oneOf: ['low', 'medium', 'high'] },
    location: { maxLength: 100 },
  }, req.body);
  const b = req.body;

  let location = b.location;
  if (!location) {
    const room = await query(
      `SELECT h.name AS hostel, r.room_number FROM allocations a JOIN beds bd ON bd.id = a.bed_id
         JOIN rooms r ON r.id = bd.room_id JOIN hostels h ON h.id = r.hostel_id
        WHERE a.student_id = $1 AND a.status = 'active'`, [req.user.student_id]);
    if (room.rows[0]) location = `${room.rows[0].hostel}, Room ${room.rows[0].room_number}`;
  }
  const { rows } = await query(
    `INSERT INTO complaints (student_id, category, title, description, location, priority) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.student_id, b.category, b.title, b.description, location, b.priority]
  );
  await notify(await activeUserIdsByRole(['warden', 'admin']), 'New complaint', `${req.user.name}: ${b.title} (${b.priority} priority)`, '/complaints');
  res.status(201).json(await fetchComplaint(rows[0].id));
}));

router.put('/:id/assign', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ assigned_to: { required: true, type: 'int', label: 'a maintenance staff member' } }, req.body);
  const id = Number(req.params.id);
  const complaint = await fetchComplaint(id);
  if (!complaint) throw new HttpError(404, 'Complaint not found');
  if (['resolved', 'closed'].includes(complaint.status)) throw new HttpError(409, 'This complaint is already resolved');

  const staff = await query(`SELECT id, name FROM users WHERE id = $1 AND role = 'maintenance' AND is_active`, [req.body.assigned_to]);
  if (!staff.rowCount) throw new HttpError(400, 'Choose an active maintenance staff member', { assigned_to: 'Choose a valid staff member' });

  await query(
    `UPDATE complaints SET assigned_to = $1, status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END, updated_at = NOW() WHERE id = $2`,
    [staff.rows[0].id, id]
  );
  await notify(staff.rows[0].id, 'Complaint assigned to you', `${complaint.title} (${complaint.location || 'no location'}) - ${complaint.priority} priority`, '/complaints');
  await notify(await userIdOfStudent(complaint.student_id), 'Complaint assigned', `"${complaint.title}" has been assigned to ${staff.rows[0].name}.`, '/complaints');
  res.json(await fetchComplaint(id));
}));

router.put('/:id/status', asyncHandler(async (req, res) => {
  const { role } = req.user;
  assertValid({ status: { required: true, oneOf: ALLOWED_STATUS[role] }, resolution_note: { maxLength: 500, label: 'note' } }, req.body);
  const { status, resolution_note: note } = req.body;
  const id = Number(req.params.id);
  const c = await fetchComplaint(id);
  if (!c) throw new HttpError(404, 'Complaint not found');

  if (role === 'student') {
    if (c.student_id !== req.user.student_id) throw new HttpError(403, 'You can only update your own complaints');
    if (!['resolved', 'closed'].includes(c.status)) throw new HttpError(409, 'You can close or reopen a complaint only after it is resolved');
  }
  if (role === 'maintenance' && c.assigned_to !== req.user.id) throw new HttpError(403, 'This complaint is not assigned to you');
  if (status === 'assigned' && !c.assigned_to) throw new HttpError(400, 'Assign a staff member first', { status: 'Assign a staff member first' });
  if (status === 'resolved' && !note && !c.resolution_note) throw new HttpError(400, 'Add a short note describing the fix', { resolution_note: 'Describe what was done' });

  await query(
    `UPDATE complaints
        SET status = $1, resolution_note = COALESCE($2, resolution_note), updated_at = NOW(),
            resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN COALESCE(resolved_at, NOW()) ELSE NULL END
      WHERE id = $3`,
    [status, note, id]
  );

  const label = status.replace('_', ' ');
  if (role === 'student') {
    if (c.assigned_to) await notify(c.assigned_to, `Complaint ${status === 'open' ? 'reopened' : 'closed'}`, `${c.student_name} ${status === 'open' ? 'reopened' : 'closed'} "${c.title}".`, '/complaints');
  } else {
    await notify(await userIdOfStudent(c.student_id), 'Complaint update', `"${c.title}" is now ${label}.${note ? ` Note: ${note}` : ''}`, '/complaints');
  }
  res.json(await fetchComplaint(id));
}));

router.delete('/:id', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const c = await fetchComplaint(Number(req.params.id));
  if (!c) throw new HttpError(404, 'Complaint not found');
  if (req.user.role === 'student' && (c.student_id !== req.user.student_id || c.status !== 'open')) {
    throw new HttpError(403, 'You can only delete your own complaints that are still open');
  }
  await query('DELETE FROM complaints WHERE id = $1', [c.id]);
  res.json({ message: 'Complaint deleted' });
}));

module.exports = router;
