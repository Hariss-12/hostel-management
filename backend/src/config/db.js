require('dotenv').config();
const { MongoClient } = require('mongodb');

const COLLECTIONS = [
  'users', 'students', 'hostels', 'rooms', 'beds', 'allocations', 'fees',
  'payments', 'attendance', 'leaves', 'mess_menu', 'meal_opt_outs',
  'complaints', 'notifications', 'counters',
];
let client;
let database;

async function connect() {
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing; configure it in backend/.env');
  client = new MongoClient(uri);
  await client.connect();
  database = client.db(process.env.MONGODB_DB || 'hostel_management');
  await ensureIndexes(database);
  return database;
}

function db() {
  if (!database) throw new Error('MongoDB is not connected');
  return database;
}

function collection(name, target) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection: ${name}`);
  return (target || db()).collection(name);
}

async function nextId(name, session) {
  const result = await collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true, session }
  );
  return result.value.value;
}

async function insert(name, doc, session) {
  const item = { ...doc, id: doc.id || await nextId(name, session) };
  await collection(name).insertOne(item, { session });
  return item;
}

async function withTransaction(fn) {
  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await fn(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

async function ensureIndexes(target = db()) {
  const indexes = {
    users: [
      [{ email: 1 }, { unique: true, name: 'users_email_unique' }],
      [{ role: 1, username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } }, name: 'users_role_username_unique' }],
      [{ role: 1, is_active: 1 }, {}],
    ],
    students: [
      [{ user_id: 1 }, { unique: true, name: 'students_user_unique' }],
      [{ roll_number_lc: 1 }, { unique: true, name: 'students_roll_unique' }],
    ],
    hostels: [[{ name_lc: 1 }, { unique: true, name: 'hostels_name_unique' }]],
    rooms: [[{ hostel_id: 1, room_number_lc: 1 }, { unique: true, name: 'rooms_number_unique' }]],
    beds: [[{ room_id: 1, bed_number: 1 }, { unique: true, name: 'beds_room_number_unique' }]],
    allocations: [
      [{ bed_id: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_allocation_per_bed' }],
      [{ student_id: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_allocation_per_student' }],
    ],
    attendance: [[{ student_id: 1, attendance_date: 1 }, { unique: true, name: 'attendance_student_date_unique' }]],
    mess_menu: [[{ day_of_week: 1, meal_type: 1 }, { unique: true, name: 'mess_menu_day_meal_unique' }]],
    meal_opt_outs: [[{ student_id: 1, meal_date: 1, meal_type: 1 }, { unique: true, name: 'meal_opt_out_unique' }]],
    notifications: [[{ user_id: 1, created_at: -1 }, {}]],
    complaints: [[{ assigned_to: 1, status: 1 }, {}]],
    fees: [[{ student_id: 1, due_date: 1 }, {}]],
    payments: [[{ fee_id: 1 }, {}]],
    leaves: [[{ student_id: 1, status: 1, from_date: 1, to_date: 1 }, {}]],
  };
  for (const [name, list] of Object.entries(indexes)) {
    for (const [keys, options] of list) await collection(name, target).createIndex(keys, options);
  }
}

const isDuplicate = (err) => err && err.code === 11000;
const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value;

module.exports = {
  COLLECTIONS, connect, db, collection, nextId, insert, withTransaction, ensureIndexes,
  isDuplicate, dateOnly, client: () => client,
};
