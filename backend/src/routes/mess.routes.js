const router = require('express').Router();
const { collection, insert, isDuplicate } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { assertValid } = require('../middleware/validate');
const { idParam } = require('../middleware/params');
const { today, isDate, MEAL_TYPES } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
router.use(authenticate);
router.param('id', idParam);
const mealRank = (m) => MEAL_TYPES.indexOf(m);
router.get('/menu', authorize('admin', 'warden', 'student'), asyncHandler(async (_req, res) => {
  const rows = await collection('mess_menu').find({}, { projection: { _id: 0, id: 1, day_of_week: 1, meal_type: 1, items: 1 } }).toArray();
  rows.sort((a, b) => a.day_of_week - b.day_of_week || mealRank(a.meal_type) - mealRank(b.meal_type)); res.json(rows);
}));
router.put('/menu', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  assertValid({ day_of_week: { required: true, type: 'int', min: 1, max: 7, label: 'a day' }, meal_type: { required: true, oneOf: MEAL_TYPES, label: 'meal' }, items: { required: true, maxLength: 300, label: 'the menu items' } }, req.body);
  const b = req.body;
  const id = (await collection('mess_menu').findOne({ day_of_week: Number(b.day_of_week), meal_type: b.meal_type }))?.id;
  const doc = id ? await collection('mess_menu').findOneAndUpdate({ id }, { $set: { items: b.items } }, { returnDocument: 'after', includeResultMetadata: false }) :
    await insert('mess_menu', { day_of_week: Number(b.day_of_week), meal_type: b.meal_type, items: b.items });
  res.json({ id: doc.id, day_of_week: doc.day_of_week, meal_type: doc.meal_type, items: doc.items });
}));
router.delete('/menu/:id', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  if (!(await collection('mess_menu').deleteOne({ id: Number(req.params.id) })).deletedCount) throw new HttpError(404, 'Menu entry not found');
  res.json({ message: 'Menu entry removed' });
}));
router.get('/summary', authorize('admin', 'warden'), asyncHandler(async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const activeAllocations = await collection('allocations').find({ status: 'active' }).toArray();
  const hostellerIds = [];
  for (const a of activeAllocations) { const s = await collection('students').findOne({ id: a.student_id, status: 'active' }); if (s) hostellerIds.push(s.id); }
  const total = hostellerIds.length;
  const [menu, opts] = await Promise.all([
    collection('mess_menu').find({ day_of_week: ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1 }).toArray(),
    collection('meal_opt_outs').find({ meal_date: date }).toArray(),
  ]);
  const optOuts = [];
  for (const o of opts) { const s = await collection('students').findOne({ id: o.student_id }); const u = s && await collection('users').findOne({ id: s.user_id }); if (s && u) optOuts.push({ id: o.id, meal_type: o.meal_type, student_name: u.name, roll_number: s.roll_number }); }
  optOuts.sort((a, b) => a.meal_type.localeCompare(b.meal_type) || a.student_name.localeCompare(b.student_name));
  const meals = MEAL_TYPES.map((m) => {
    const optedOut = optOuts.filter((o) => o.meal_type === m).length; const meal = menu.find((x) => x.meal_type === m);
    return { meal_type: m, items: meal ? meal.items : null, opted_out: optedOut, expected: Math.max(total - optedOut, 0) };
  });
  res.json({ date, total, meals, opt_outs: optOuts });
}));
router.get('/opt-outs/mine', authorize('student'), asyncHandler(async (req, res) => {
  const rows = await collection('meal_opt_outs').find({ student_id: req.user.student_id, meal_date: { $gte: today() } }, { projection: { _id: 0, id: 1, meal_date: 1, meal_type: 1 } }).sort({ meal_date: 1, meal_type: 1 }).toArray(); res.json(rows);
}));
router.post('/opt-outs', authorize('student'), asyncHandler(async (req, res) => {
  assertValid({ meal_date: { required: true, type: 'date', label: 'a date' }, meal_type: { required: true, oneOf: MEAL_TYPES, label: 'a meal' } }, req.body);
  const b = req.body; if (b.meal_date < today()) throw new HttpError(400, 'You cannot skip a meal in the past', { meal_date: 'Choose today or a later date' });
  try { const o = await insert('meal_opt_outs', { student_id: req.user.student_id, meal_date: b.meal_date, meal_type: b.meal_type }); res.status(201).json({ id: o.id }); }
  catch (e) { if (isDuplicate(e)) throw new HttpError(409, 'You have already skipped this meal', { meal_type: 'Already skipped' }); throw e; }
}));
router.delete('/opt-outs/:id', authorize('student'), asyncHandler(async (req, res) => {
  const result = await collection('meal_opt_outs').deleteOne({ id: Number(req.params.id), student_id: req.user.student_id, meal_date: { $gte: today() } });
  if (!result.deletedCount) throw new HttpError(404, 'Skipped meal not found'); res.json({ message: 'Meal restored' });
}));
module.exports = router;
