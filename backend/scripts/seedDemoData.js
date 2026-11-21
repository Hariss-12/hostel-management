/**
 * Seeds reusable showcase records for HMS.
 *
 * Run only after applying database/schema.sql:
 *   npm run seed-demo
 *
 * This script is idempotent for the dedicated demo accounts and demo records.
 * It does not delete existing records or modify the administrator account.
 * Demo account passwords are reset on each run so the showcase credentials
 * below remain usable. Do not use these accounts in production.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

const DEMO_USERS = [
  { key: 'student1', name: 'Demo Student', email: 'student1@demo.com', password: 'Demo@1234', role: 'student', phone: '9876543210' },
  { key: 'student2', name: 'Arun Kumar', email: 'student2@demo.com', password: 'Demo@1234', role: 'student', phone: '9876543211' },
  { key: 'warden', name: 'Demo Warden', email: 'warden@demo.com', password: 'Warden@1234', role: 'warden', phone: '9876543212' },
  { key: 'maintenance', name: 'Demo Maintenance', email: 'maintenance@demo.com', password: 'Maint@1234', role: 'maintenance', phone: '9876543213' },
];

const REQUIRED_TABLES = [
  'users', 'students', 'hostels', 'rooms', 'beds', 'allocations', 'fees',
  'payments', 'attendance', 'leaves', 'mess_menu', 'meal_opt_outs',
  'complaints', 'notifications',
];

async function ensureDemoUser(client, spec) {
  const passwordHash = await bcrypt.hash(spec.password, 10);
  const existing = await client.query(
    'SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)',
    [spec.email]
  );

  if (existing.rowCount) {
    const user = existing.rows[0];
    if (user.role !== spec.role) {
      throw new Error(`${spec.email} already exists with role '${user.role}', expected '${spec.role}'. No account was changed.`);
    }
    await client.query(
      `UPDATE users
          SET name = $1, password_hash = $2, phone = $3, is_active = TRUE
        WHERE id = $4`,
      [spec.name, passwordHash, spec.phone, user.id]
    );
    return user.id;
  }

  const created = await client.query(
    `INSERT INTO users (name, email, password_hash, role, phone, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id`,
    [spec.name, spec.email, passwordHash, spec.role, spec.phone]
  );
  return created.rows[0].id;
}

async function ensureStudent(client, userId, data) {
  const duplicateRoll = await client.query(
    `SELECT id FROM students WHERE LOWER(roll_number) = LOWER($1) AND user_id <> $2`,
    [data.rollNumber, userId]
  );
  if (duplicateRoll.rowCount) {
    throw new Error(`Roll number ${data.rollNumber} is already assigned to another account.`);
  }

  const existing = await client.query('SELECT id FROM students WHERE user_id = $1', [userId]);
  if (existing.rowCount) {
    const updated = await client.query(
      `UPDATE students
          SET roll_number = $1, course = $2, year_of_study = $3, gender = $4,
              guardian_name = $5, guardian_phone = $6, admission_date = COALESCE(admission_date, CURRENT_DATE),
              status = 'active'
        WHERE user_id = $7
        RETURNING id`,
      [data.rollNumber, data.course, data.year, data.gender, data.guardianName || null, data.guardianPhone || null, userId]
    );
    return updated.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO students
       (user_id, roll_number, course, year_of_study, gender, guardian_name, guardian_phone, admission_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, 'active')
     RETURNING id`,
    [userId, data.rollNumber, data.course, data.year, data.gender, data.guardianName || null, data.guardianPhone || null]
  );
  return inserted.rows[0].id;
}

async function ensureRoom(client, hostelId, roomNumber, floor, roomType, capacity, monthlyFee) {
  const result = await client.query(
    `INSERT INTO rooms (hostel_id, room_number, floor, room_type, capacity, monthly_fee)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (hostel_id, room_number)
     DO UPDATE SET floor = EXCLUDED.floor, room_type = EXCLUDED.room_type,
                   capacity = EXCLUDED.capacity, monthly_fee = EXCLUDED.monthly_fee
     RETURNING id`,
    [hostelId, roomNumber, floor, roomType, capacity, monthlyFee]
  );
  const roomId = result.rows[0].id;
  for (let bedNumber = 1; bedNumber <= capacity; bedNumber += 1) {
    await client.query(
      `INSERT INTO beds (room_id, bed_number, is_usable)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (room_id, bed_number) DO NOTHING`,
      [roomId, bedNumber]
    );
  }
  return roomId;
}

async function ensureAllocation(client, studentId, bedId, adminId) {
  const current = await client.query(
    `SELECT id, bed_id FROM allocations WHERE student_id = $1 AND status = 'active'`,
    [studentId]
  );
  if (current.rowCount) return current.rows[0].id;

  const occupied = await client.query(
    `SELECT id FROM allocations WHERE bed_id = $1 AND status = 'active'`,
    [bedId]
  );
  if (occupied.rowCount) {
    console.warn(`Demo bed ${bedId} is already occupied; allocation was left unchanged.`);
    return null;
  }
  const result = await client.query(
    `INSERT INTO allocations (student_id, bed_id, start_date, status, remarks, created_by)
     VALUES ($1, $2, CURRENT_DATE - 20, 'active', 'Showcase demo allocation', $3)
     RETURNING id`,
    [studentId, bedId, adminId]
  );
  return result.rows[0].id;
}

async function ensureFee(client, studentId, title, amount, daysUntilDue, createdBy) {
  const existing = await client.query(
    'SELECT id FROM fees WHERE student_id = $1 AND title = $2',
    [studentId, title]
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE fees SET amount = $1, due_date = CURRENT_DATE + $2::int WHERE id = $3`,
      [amount, daysUntilDue, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const created = await client.query(
    `INSERT INTO fees (student_id, title, amount, due_date, created_by)
     VALUES ($1, $2, $3, CURRENT_DATE + $4::int, $5) RETURNING id`,
    [studentId, title, amount, daysUntilDue, createdBy]
  );
  return created.rows[0].id;
}

async function ensurePayment(client, feeId, receiptNo, amount, method, receivedBy) {
  await client.query(
    `INSERT INTO payments (fee_id, receipt_no, amount, method, reference, payment_date, received_by, remarks)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE - 2, $6, 'Showcase demo payment')
     ON CONFLICT (receipt_no) DO NOTHING`,
    [feeId, receiptNo, amount, method, `DEMO-${receiptNo}`, receivedBy]
  );
}

async function ensureLeave(client, studentId, reason, destination, offset, status, wardenId) {
  const startOffset = offset;
  const endOffset = offset + 2;
  const found = await client.query(
    `SELECT id FROM leaves WHERE student_id = $1 AND reason = $2`,
    [studentId, reason]
  );
  if (found.rowCount) return found.rows[0].id;
  const result = await client.query(
    `INSERT INTO leaves (student_id, from_date, to_date, reason, destination, contact_phone, status, decided_by, decided_at, warden_remark)
     VALUES ($1, CURRENT_DATE + $2::int, CURRENT_DATE + $3::int, $4, $5, '9876543210', $6::varchar(10),
             CASE WHEN $6::varchar(10) = 'approved' THEN $7 ELSE NULL END,
             CASE WHEN $6::varchar(10) = 'approved' THEN NOW() ELSE NULL END,
             CASE WHEN $6::varchar(10) = 'approved' THEN 'Approved for demo' ELSE NULL END)
     RETURNING id`,
    [studentId, startOffset, endOffset, reason, destination, status, wardenId]
  );
  return result.rows[0].id;
}

async function ensureComplaint(client, studentId, maintenanceId, category, title, description, location, priority, status) {
  const found = await client.query(
    'SELECT id FROM complaints WHERE student_id = $1 AND title = $2',
    [studentId, title]
  );
  if (found.rowCount) {
    await client.query(
      `UPDATE complaints SET category = $1, description = $2, location = $3, priority = $4,
              status = $5::varchar(15), assigned_to = $6,
              resolution_note = CASE WHEN $5::varchar(15) = 'resolved' THEN COALESCE(resolution_note, 'Issue fixed during demo') ELSE resolution_note END,
              resolved_at = CASE WHEN $5::varchar(15) = 'resolved' THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END,
              updated_at = NOW()
        WHERE id = $7`,
      [category, description, location, priority, status, ['assigned', 'in_progress'].includes(status) ? maintenanceId : null, found.rows[0].id]
    );
    return found.rows[0].id;
  }
  const result = await client.query(
    `INSERT INTO complaints (student_id, category, title, description, location, priority, status, assigned_to,
                             resolution_note, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::varchar(15), $8,
             CASE WHEN $7::varchar(15) = 'resolved' THEN 'Issue fixed during demo' ELSE NULL END,
             CASE WHEN $7::varchar(15) = 'resolved' THEN NOW() ELSE NULL END)
     RETURNING id`,
    [studentId, category, title, description, location, priority, status,
     ['assigned', 'in_progress'].includes(status) ? maintenanceId : null]
  );
  return result.rows[0].id;
}

async function ensureNotification(client, userId, title, message, link) {
  await client.query(
    `INSERT INTO notifications (user_id, title, message, link)
     SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications WHERE user_id = $1 AND title = $2 AND message = $3
      )`,
    [userId, title, message, link]
  );
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dbInfo = await client.query('SELECT current_database() AS database_name');
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES]
    );
    const present = new Set(tables.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((name) => !present.has(name));
    if (missing.length) {
      throw new Error(`Database '${dbInfo.rows[0].database_name}' is missing tables: ${missing.join(', ')}. Apply backend/database/schema.sql first.`);
    }

    const ids = {};
    for (const spec of DEMO_USERS) ids[spec.key] = await ensureDemoUser(client, spec);

    const adminResult = await client.query(
      `SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1`
    );
    if (!adminResult.rowCount) throw new Error('No active administrator exists. Run npm run create-admin first.');
    ids.admin = adminResult.rows[0].id;

    const hostelResult = await client.query(
      `INSERT INTO hostels (name, type, address, warden_id)
       VALUES ('Demo Boys Hostel', 'boys', 'Campus Road, Demo Block', $1)
       ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type, address = EXCLUDED.address, warden_id = EXCLUDED.warden_id
       RETURNING id`,
      [ids.warden]
    );
    const hostelId = hostelResult.rows[0].id;
    const room101 = await ensureRoom(client, hostelId, '101', 1, 'triple', 3, 6500);
    await ensureRoom(client, hostelId, '102', 1, 'double', 2, 6000);

    const students = {};
    students.student1 = await ensureStudent(client, ids.student1, {
      rollNumber: 'STU001', course: 'B.Tech Information Technology', year: 3, gender: 'male',
    });
    students.student2 = await ensureStudent(client, ids.student2, {
      rollNumber: 'STU002', course: 'B.Tech Computer Science', year: 2, gender: 'male',
    });

    const bedRows = await client.query('SELECT id, bed_number FROM beds WHERE room_id = $1 ORDER BY bed_number', [room101]);
    const bedByNumber = new Map(bedRows.rows.map((row) => [Number(row.bed_number), row.id]));
    if (!bedByNumber.has(1) || !bedByNumber.has(2)) throw new Error('Demo room 101 does not have beds 1 and 2.');
    await ensureAllocation(client, students.student1, bedByNumber.get(1), ids.admin);
    await ensureAllocation(client, students.student2, bedByNumber.get(2), ids.admin);

    const feeHostel = await ensureFee(client, students.student1, 'Hostel Fee - Demo Term', 12000, 10, ids.admin);
    const feeMess = await ensureFee(client, students.student1, 'Mess Fee - Demo Term', 4500, 10, ids.admin);
    await ensureFee(client, students.student1, 'Maintenance Fee - Demo Term', 1000, 20, ids.admin);
    const feeStudent2 = await ensureFee(client, students.student2, 'Hostel Fee - Demo Term', 12000, 10, ids.admin);
    await ensurePayment(client, feeHostel, 'DEMO-RCT-STU001-01', 6000, 'upi', ids.admin);
    await ensurePayment(client, feeMess, 'DEMO-RCT-STU001-02', 4500, 'cash', ids.admin);

    const attendancePattern1 = ['present', 'present', 'late', 'present', 'absent', 'present', 'present', 'present', 'present', 'late'];
    const attendancePattern2 = ['present', 'absent', 'present', 'present', 'present', 'late', 'present', 'present', 'present', 'present'];
    for (let offset = 0; offset < 20; offset += 1) {
      for (const [studentId, pattern] of [[students.student1, attendancePattern1], [students.student2, attendancePattern2]]) {
        const status = pattern[offset % pattern.length];
        await client.query(
          `INSERT INTO attendance (student_id, attendance_date, status, remarks, marked_by)
           VALUES ($1, CURRENT_DATE - $2::int, $3, $4, $5)
           ON CONFLICT (student_id, attendance_date)
           DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by`,
          [studentId, offset, status, status === 'late' ? 'Arrived after roll call' : null, ids.warden]
        );
      }
    }

    await ensureLeave(client, students.student1, 'Family function', 'Coimbatore', 7, 'pending', ids.warden);
    await ensureLeave(client, students.student1, 'Weekend home visit', 'Erode', 15, 'approved', ids.warden);

    const weeklyMenu = [
      ['Idli, sambar, chutney', 'Rice, sambar, poriyal, curd', 'Sundal and tea', 'Chapati, kurma'],
      ['Pongal, vadai, chutney', 'Lemon rice, potato roast, curd', 'Banana and milk', 'Dosa, sambar'],
      ['Poori, potato masala', 'Meals, rasam, kootu', 'Bajji and tea', 'Vegetable pulao, raita'],
      ['Upma, sambar', 'Tomato rice, appalam, curd', 'Biscuits and milk', 'Chapati, dal'],
      ['Dosa, chutney', 'Meals, sambar, poriyal', 'Sundal and buttermilk', 'Idiyappam, kurma'],
      ['Puttu, kadala curry', 'Veg biryani, raita', 'Fruit and tea', 'Parotta, salna'],
      ['Bread, omelette, banana', 'Meals, rasam, poriyal', 'Puffs and juice', 'Curd rice, pickle'],
    ];
    const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];
    for (let day = 1; day <= 7; day += 1) {
      for (let index = 0; index < mealTypes.length; index += 1) {
        await client.query(
          `INSERT INTO mess_menu (day_of_week, meal_type, items) VALUES ($1, $2, $3)
           ON CONFLICT (day_of_week, meal_type) DO UPDATE SET items = EXCLUDED.items`,
          [day, mealTypes[index], weeklyMenu[day - 1][index]]
        );
      }
    }

    await client.query(
      `INSERT INTO meal_opt_outs (student_id, meal_date, meal_type)
       VALUES ($1, CURRENT_DATE + 3, 'dinner')
       ON CONFLICT (student_id, meal_date, meal_type) DO NOTHING`,
      [students.student1]
    );

    await ensureComplaint(client, students.student1, ids.maintenance, 'electrical', 'Ceiling fan is not working', 'The ceiling fan in the room does not start. Please check the switch and fan connection.', 'Demo Boys Hostel, Room 101', 'high', 'assigned');
    await ensureComplaint(client, students.student1, ids.maintenance, 'plumbing', 'Wash basin tap is leaking', 'Water continues to drip from the wash basin tap.', 'Demo Boys Hostel, Room 101', 'medium', 'open');
    await ensureComplaint(client, students.student2, ids.maintenance, 'internet', 'Wi-Fi connection is unstable', 'The Wi-Fi connection disconnects frequently in the evening.', 'Demo Boys Hostel, Room 101', 'medium', 'in_progress');

    await ensureNotification(client, ids.student1, 'Welcome to the hostel portal', 'Your demo student account is ready. Room, fees, attendance and hostel services are available here.', '/');
    await ensureNotification(client, ids.student1, 'Hostel fee generated', 'Your Hostel Fee - Demo Term invoice is available. Please review the due date.', '/fees');
    await ensureNotification(client, ids.student1, 'Leave request submitted', 'Your family function leave request is waiting for warden approval.', '/leaves');
    await ensureNotification(client, ids.warden, 'Leave request pending', 'Demo Student has submitted a leave request for review.', '/leaves');
    await ensureNotification(client, ids.maintenance, 'New maintenance assignment', 'A high-priority ceiling fan complaint has been assigned to you.', '/complaints');

    await client.query('COMMIT');

    console.log(`Demo data seeded in database '${dbInfo.rows[0].database_name}'.`);
    console.log('Student: student1@demo.com / Demo@1234 (roll number STU001)');
    console.log('Second student: student2@demo.com / Demo@1234 (roll number STU002)');
    console.log('Warden: warden@demo.com / Warden@1234');
    console.log('Maintenance: maintenance@demo.com / Maint@1234');
    console.log('Admin account was not changed. Use your existing admin credentials.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Could not seed demo data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
