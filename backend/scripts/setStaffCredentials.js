require('dotenv').config();
const bcrypt = require('bcrypt');
const { connect, collection, withTransaction, client } = require('../src/config/db');
(async () => {
  const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[a-z0-9._-]{3,50}$/.test(username) || password.length < 6 || password.length > 72) {
    console.error('Set ADMIN_USERNAME (3-50 letters, numbers, dots, underscores or hyphens) and ADMIN_PASSWORD (6-72 characters).');
    process.exitCode = 1; return;
  }
  try {
    await connect();
    const hash = await bcrypt.hash(password, 10);
    await withTransaction(async (session) => {
      const users = await collection('users').find({ role: { $in: ['warden', 'maintenance'] } }, { session }).sort({ role: 1, id: 1 }).toArray();
      for (const role of ['warden', 'maintenance']) {
        const account = users.filter((u) => u.role === role);
        if (account.length !== 1) throw new Error(`Expected exactly one ${role} account; found ${account.length}. No accounts were changed.`);
      }
      for (const u of users) await collection('users').updateOne({ id: u.id }, { $set: { username, password_hash: hash } }, { session });
    });
    console.log('Warden and maintenance credentials updated.');
  } catch (err) {
    console.error('Could not update staff credentials:', err.message);
    process.exitCode = 1;
  } finally { if (client()) await client().close(); }
})();
