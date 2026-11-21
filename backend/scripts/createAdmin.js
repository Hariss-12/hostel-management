// Creates the first admin account using ADMIN_* values from backend/.env
// Run it yourself once after applying schema.sql:  npm run create-admin
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

(async () => {
  const name = process.env.ADMIN_NAME || 'Hostel Admin';
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 6) {
    console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD (min 6 characters) in backend/.env first.');
    process.exit(1);
  }
  try {
    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rowCount) {
      console.log(`A user with ${email} already exists. Nothing changed.`);
    } else {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
        [name, email, hash]
      );
      console.log(`Admin created. Sign in with ${email}`);
    }
  } catch (err) {
    console.error('Could not create admin:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
