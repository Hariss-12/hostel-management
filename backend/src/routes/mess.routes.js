const router = require('express').Router();
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { today, isDate, MEAL_TYPES, MEAL_ORDER_SQL } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

router.use(authenticate);
router.param('id', idParam);

// Weekly menu (1 = Monday ... 7 = Sunday)
router.get('/menu', authorize('admin', 'warden', 'student'), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT id, day_of_week, meal_type, items FROM mess_menu ORDER BY day_of_week, ${MEAL_ORDER_SQL}`);
  res.json(rows);
}));

// Add or replace one meal of the weekly menu
router.put('/menu', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({
    day_of_week: { required: true, type: 'int', min: 1, max: 7, label: 'a day' },
    meal_type: { required: true, oneOf: MEAL_TYPES, label: 'meal' },
    items: { required: true, maxLength: 300, label: 'the menu items' },
  }, req.body);
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO mess_menu (day_of_week, meal_type, items) VALUES ($1, $2, $3)
     ON CONFLICT (day_of_week, meal_type) DO UPDATE SET items = EXCLUDED.items
     RETURNING id, day_of_week, meal_type, items`,
    [b.day_of_week, b.meal_type, b.items]
  );
  res.json(rows[0]);
}));

router.delete('/menu/:id', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const del = await query('DELETE FROM mess_menu WHERE id = $1', [Number(req.params.id)]);
  if (!del.rowCount) throw new HttpError(404, 'Menu entry not found');
  res.json({ message: 'Menu entry removed' });
}));

// Staff: expected headcount per meal for a date (hostellers minus opt-outs)
router.get('/summary', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const [totalQ, menuQ, optQ] = await Promise.all([
    query(`SELECT COUNT(*) AS n FROM students s JOIN allocations a ON a.student_id = s.id AND a.status = 'active' WHERE s.status = 'active'`),
    query(`SELECT meal_type, items FROM mess_menu WHERE day_of_week = EXTRACT(ISODOW FROM $1::date)::int ORDER BY ${MEAL_ORDER_SQL}`, [date]),
    query(
      `SELECT o.id, o.meal_type, u.name AS student_name, s.roll_number
         FROM meal_opt_outs o JOIN students s ON s.id = o.student_id JOIN users u ON u.id = s.user_id
        WHERE o.meal_date = $1::date ORDER BY o.meal_type, u.name`, [date]),
  ]);
  const total = totalQ.rows[0].n;
  const meals = MEAL_TYPES.map((m) => {
    const optedOut = optQ.rows.filter((o) => o.meal_type === m).length;
    const menu = menuQ.rows.find((x) => x.meal_type === m);
    return { meal_type: m, items: menu ? menu.items : null, opted_out: optedOut, expected: Math.max(total - optedOut, 0) };
  });
  res.json({ date, total, meals, opt_outs: optQ.rows });
}));

// Student: skip a meal ----------------------------------------------------
router.get('/opt-outs/mine', authorize('student'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, meal_date, meal_type FROM meal_opt_outs WHERE student_id = $1 AND meal_date >= CURRENT_DATE ORDER BY meal_date, meal_type`,
    [req.user.student_id]
  );
  res.json(rows);
}));

router.post('/opt-outs', authorize('student'), asyncHandler(async (req, res) => {
  assertValid({
    meal_date: { required: true, type: 'date', label: 'a date' },
    meal_type: { required: true, oneOf: MEAL_TYPES, label: 'a meal' },
  }, req.body);
  const b = req.body;
  if (b.meal_date < today()) throw new HttpError(400, 'You cannot skip a meal in the past', { meal_date: 'Choose today or a later date' });
  const ins = await query(
    `INSERT INTO meal_opt_outs (student_id, meal_date, meal_type) VALUES ($1, $2, $3)
     ON CONFLICT (student_id, meal_date, meal_type) DO NOTHING RETURNING id`,
    [req.user.student_id, b.meal_date, b.meal_type]
  );
  if (!ins.rowCount) throw new HttpError(409, 'You have already skipped this meal', { meal_type: 'Already skipped' });
  res.status(201).json({ id: ins.rows[0].id });
}));

router.delete('/opt-outs/:id', authorize('student'), asyncHandler(async (req, res) => {
  const del = await query('DELETE FROM meal_opt_outs WHERE id = $1 AND student_id = $2 AND meal_date >= CURRENT_DATE', [Number(req.params.id), req.user.student_id]);
  if (!del.rowCount) throw new HttpError(404, 'Skipped meal not found');
  res.json({ message: 'Meal restored' });
}));

module.exports = router;
