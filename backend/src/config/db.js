require('dotenv').config();
const { Pool, types } = require('pg');

// Return numbers as JS numbers and DATE columns as plain 'YYYY-MM-DD' strings
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT / COUNT(*)
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC
types.setTypeParser(1082, (v) => v); // DATE

// Connection settings come from backend/.env (see .env.example)
// Set DB_SSL=true when connecting to a hosted database from outside its network (e.g. Render external URL)
const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl,
      }
);

pool.on('error', (err) => console.error('Unexpected PostgreSQL error:', err.message));

const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN / COMMIT and rolls back on any error
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
