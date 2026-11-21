require('dotenv').config();
const app = require('./app');
const { query } = require('./config/db');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

const REQUIRED_TABLES = [
  'users', 'students', 'hostels', 'rooms', 'beds', 'allocations', 'fees',
  'payments', 'attendance', 'leaves', 'mess_menu', 'meal_opt_outs',
  'complaints', 'notifications',
];

app.listen(PORT, async () => {
  console.log(`HMS API listening on http://localhost:${PORT}`);
  try {
    const db = await query('SELECT current_database() AS name');
    const result = await query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES]
    );
    const present = new Set(result.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
    const columnCheck = await query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [['users', 'students']]
    );
    const columns = new Set(columnCheck.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const requiredColumns = [
      'users.id', 'users.name', 'users.email', 'users.password_hash', 'users.role', 'users.is_active',
      'students.id', 'students.user_id', 'students.roll_number', 'students.course',
      'students.year_of_study', 'students.gender', 'students.guardian_name',
      'students.guardian_phone', 'students.admission_date', 'students.status',
    ];
    const missingColumns = requiredColumns.filter((column) => !columns.has(column));
    console.log(`PostgreSQL connection OK (${db.rows[0].name})`);
    if (missing.length || missingColumns.length) {
      if (missing.length) console.error(`Missing tables: ${missing.join(', ')}`);
      if (missingColumns.length) console.error(`Missing columns: ${missingColumns.join(', ')}`);
      console.error('HMS database schema is incomplete. Apply the complete backend/database/schema.sql file in pgAdmin Query Tool, connected to the database shown above.');
    } else {
      console.log('HMS database schema check OK');
    }
  } catch (err) {
    console.error(`PostgreSQL/schema check FAILED: ${err.message}`);
    console.error('Check DB_* values in backend/.env and apply backend/database/schema.sql to the intended database.');
  }
});
