// Creates the local showcase student; set DEMO_PASSWORD in the environment.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { connect, collection, insert, withTransaction, client, isDuplicate } = require('../src/config/db');
(async () => {
  const password = process.env.DEMO_PASSWORD || '';
  if (password.length < 8 || password.length > 72) {
    console.error('Set DEMO_PASSWORD (8-72 characters) in the environment before running this local-only script.');
    process.exitCode = 1; return;
  }
  try {
    await connect();
    await withTransaction(async (session) => {
      let user = await collection('users').findOne({ email: 'student1@demo.com' }, { session });
      if (user && user.role !== 'student') throw new Error('Demo email already belongs to another role.');
      if (!user) user = await insert('users', { name: 'Demo Student', email: 'student1@demo.com', password_hash: await bcrypt.hash(password, 10), role: 'student', phone: '9876543210', is_active: true, created_at: new Date() }, session);
      if (!(await collection('students').findOne({ user_id: user.id }, { session }))) {
        await insert('students', { user_id: user.id, roll_number: 'STU001', roll_number_lc: 'stu001', course: 'B.Tech IT', year_of_study: 3, gender: 'male', admission_date: new Date().toISOString().slice(0, 10), status: 'active' }, session);
      }
    });
    console.log('Demo student is ready. Sign-in details are configured through the environment.');
  } catch (e) {
    console.error('Could not create demo student:', isDuplicate(e) ? 'Email or roll number already exists.' : e.message);
    process.exitCode = 1;
  } finally { if (client()) await client().close(); }
})();
