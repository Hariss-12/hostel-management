require('dotenv').config();
const bcrypt = require('bcrypt');
const { connect, collection, client } = require('../src/config/db');
(async () => {
  const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[a-z0-9._-]{3,50}$/.test(username) || password.length < 6 || password.length > 72) {
    console.error('Set ADMIN_USERNAME (3-50 letters, numbers, dots, underscores or hyphens) and ADMIN_PASSWORD (6-72 characters).');
    process.exitCode = 1; return;
  }
  try {
    await connect();
    const accounts = await collection('users').find({ role: 'admin' }).sort({ id: 1 }).toArray();
    if (accounts.length !== 1) throw new Error(`Expected exactly one administrator account; found ${accounts.length}. No account was changed.`);
    await collection('users').updateOne({ id: accounts[0].id }, { $set: { username, password_hash: await bcrypt.hash(password, 10) } });
    console.log('Administrator credentials updated.');
  } catch (err) {
    console.error('Could not update administrator credentials:', err.message);
    process.exitCode = 1;
  } finally { if (client()) await client().close(); }
})();
