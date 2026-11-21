// Applies backend/database/schema.sql to the database in DATABASE_URL / DB_* (safe to re-run).
// Usage (e.g. against Render's External Database URL):
//   DATABASE_URL="postgresql://..." DB_SSL=true npm run init-db
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schema applied successfully.');
  } catch (err) {
    console.error('Could not apply schema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
