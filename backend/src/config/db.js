
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { MongoClient } = require('mongodb');

const COLLECTIONS = [
  'users',
  'students',
  'hostels',
  'rooms',
  'beds',
  'allocations',
  'fees',
  'payments',
  'attendance',
  'leaves',
  'mess_menu',
  'meal_opt_outs',
  'complaints',
  'notifications',
  'counters',
];

let client;
let database;
let connectingPromise;

// ========================================
// CONNECT TO MONGODB
// ========================================


async function connect() {
  if (database) return database;

  if (connectingPromise) return connectingPromise;

  connectingPromise = Promise.resolve().then(async () => {
    try {
      const uri = process.env.MONGODB_URI?.trim();
      const dbName = process.env.MONGODB_DB?.trim() || 'hostel_management';

      if (!uri) {
        throw new Error('MONGODB_URI is missing');
      }

      if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
        throw new Error(
          'Invalid MONGODB_URI. It must start with mongodb:// or mongodb+srv://'
        );
      }

      client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        maxPoolSize: 10,
      });

      await client.connect();

      database = client.db(dbName);

      await database.command({ ping: 1 });

      console.log('MongoDB connected successfully!');
      console.log('Database:', dbName);

      await ensureIndexes(database);

      console.log('MongoDB indexes initialized successfully!');

      return database;

    } catch (error) {
      console.error('MongoDB startup failed!');
      console.error('Error name:', error.name);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (client) {
        await client.close().catch(() => { });
      }

      client = undefined;
      database = undefined;

      throw error;

    } finally {
      connectingPromise = undefined;
    }
  });

  return connectingPromise;
}


// ========================================
// GET DATABASE INSTANCE
// ========================================

function db() {
  if (!database) {
    throw new Error('MongoDB is not connected. Call connect() first.');
  }

  return database;
}

// ========================================
// GET COLLECTION
// ========================================

function collection(name, target) {
  if (!COLLECTIONS.includes(name)) {
    throw new Error(`Unknown collection: ${name}`);
  }

  return (target || db()).collection(name);
}

// ========================================
// AUTO-INCREMENT ID GENERATOR
// ========================================

async function nextId(name, session) {
  const result = await collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    {
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: true,
      session,
    }
  );

  return result.value.value;
}

// ========================================
// INSERT DOCUMENT
// ========================================

async function insert(name, doc, session) {
  const item = {
    ...doc,
    id: doc.id || await nextId(name, session),
  };

  await collection(name).insertOne(item, { session });

  return item;
}

// ========================================
// TRANSACTION HANDLER
// ========================================

async function withTransaction(fn) {
  if (!client) {
    throw new Error('MongoDB client is not initialized');
  }

  const session = client.startSession();

  let result;

  try {
    await session.withTransaction(async () => {
      result = await fn(session);
    });

    return result;

  } finally {
    await session.endSession();
  }
}

// ========================================
// CREATE DATABASE INDEXES
// ========================================

async function ensureIndexes(target = db()) {
  const indexes = {
    users: [
      [
        { email: 1 },
        { unique: true, name: 'users_email_unique' },
      ],
      [
        { role: 1, username: 1 },
        {
          unique: true,
          partialFilterExpression: {
            username: { $type: 'string' },
          },
          name: 'users_role_username_unique',
        },
      ],
      [
        { role: 1, is_active: 1 },
        {},
      ],
    ],

    students: [
      [
        { user_id: 1 },
        { unique: true, name: 'students_user_unique' },
      ],
      [
        { roll_number_lc: 1 },
        { unique: true, name: 'students_roll_unique' },
      ],
    ],

    hostels: [
      [
        { name_lc: 1 },
        { unique: true, name: 'hostels_name_unique' },
      ],
    ],

    rooms: [
      [
        { hostel_id: 1, room_number_lc: 1 },
        { unique: true, name: 'rooms_number_unique' },
      ],
    ],

    beds: [
      [
        { room_id: 1, bed_number: 1 },
        { unique: true, name: 'beds_room_number_unique' },
      ],
    ],

    allocations: [
      [
        { bed_id: 1, status: 1 },
        {
          unique: true,
          partialFilterExpression: { status: 'active' },
          name: 'one_active_allocation_per_bed',
        },
      ],
      [
        { student_id: 1, status: 1 },
        {
          unique: true,
          partialFilterExpression: { status: 'active' },
          name: 'one_active_allocation_per_student',
        },
      ],
    ],

    attendance: [
      [
        { student_id: 1, attendance_date: 1 },
        {
          unique: true,
          name: 'attendance_student_date_unique',
        },
      ],
    ],

    mess_menu: [
      [
        { day_of_week: 1, meal_type: 1 },
        {
          unique: true,
          name: 'mess_menu_day_meal_unique',
        },
      ],
    ],

    meal_opt_outs: [
      [
        { student_id: 1, meal_date: 1, meal_type: 1 },
        {
          unique: true,
          name: 'meal_opt_out_unique',
        },
      ],
    ],

    notifications: [
      [
        { user_id: 1, created_at: -1 },
        {},
      ],
    ],

    complaints: [
      [
        { assigned_to: 1, status: 1 },
        {},
      ],
    ],

    fees: [
      [
        { student_id: 1, due_date: 1 },
        {},
      ],
    ],

    payments: [
      [
        { fee_id: 1 },
        {},
      ],
    ],

    leaves: [
      [
        { student_id: 1, status: 1, from_date: 1, to_date: 1 },
        {},
      ],
    ],
  };

  for (const [name, list] of Object.entries(indexes)) {
    for (const [keys, options] of list) {
      await collection(name, target).createIndex(keys, options);
    }
  }
}

// ========================================
// ERROR HELPERS
// ========================================

const isDuplicate = (err) => {
  return err && err.code === 11000;
};

// ========================================
// DATE FORMAT HELPER
// ========================================

const dateOnly = (value) => {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value;
};

// ========================================
// EXPORT FUNCTIONS
// ========================================

module.exports = {
  COLLECTIONS,
  connect,
  db,
  collection,
  nextId,
  insert,
  withTransaction,
  ensureIndexes,
  isDuplicate,
  dateOnly,
  client: () => client,
};
