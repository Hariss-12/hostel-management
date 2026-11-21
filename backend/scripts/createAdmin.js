// Creates the first administrator from ADMIN_* environment variables.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { connect, collection, insert, client, isDuplicate } = require('../src/config/db');
(async () => {
  const name = process.env.ADMIN_NAME || 'Hostel Admin';
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 6 || password.length > 72) {
    console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD (6-72 characters) in backend/.env first.');
    process.exitCode = 1; return;
  }
  try {
    await connect();
    if (await collection('users').findOne({ email })) console.log('An account with the configured email already exists. Nothing changed.');
    else {
      await insert('users', { name, email, password_hash: await bcrypt.hash(password, 10), role: 'admin', is_active: true, created_at: new Date() });
      console.log('Administrator account created.');
    }
  } catch (err) {
    console.error('Could not create admin:', isDuplicate(err) ? 'Email is already registered.' : err.message);
    process.exitCode = 1;
  } finally { if (client()) await client().close(); }
})();
