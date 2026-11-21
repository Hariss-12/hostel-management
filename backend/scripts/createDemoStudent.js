const bcrypt = require('bcrypt');
const { query, withTransaction } = require('../src/config/db');

async function createDemoStudent() {
  try {
    const email = 'student1@demo.com';
    const password = 'Demo@1234';

    const passwordHash = await bcrypt.hash(password, 10);

    await withTransaction(async (client) => {
      let result = await client.query(
        'SELECT id, role FROM users WHERE email = $1',
        [email]
      );

      let user;

      if (result.rows.length) {
        user = result.rows[0];

        if (user.role !== 'student') {
          throw new Error('Email already belongs to another role');
        }
      } else {
        result = await client.query(
          `INSERT INTO users
           (name, email, password_hash, role, phone)
           VALUES ($1, $2, $3, 'student', $4)
           RETURNING id`,
          [
            'Demo Student',
            email,
            passwordHash,
            '9876543210'
          ]
        );

        user = result.rows[0];
      }

      await client.query(
        `INSERT INTO students
         (user_id, roll_number, course, year_of_study, gender)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          user.id,
          'STU001',
          'B.Tech IT',
          3,
          'male'
        ]
      );
    });

    console.log('Demo student created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Student ID: STU001');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

createDemoStudent();