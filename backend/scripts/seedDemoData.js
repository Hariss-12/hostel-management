/**
 * Seeds local showcase records. Requires DEMO_PASSWORD in the environment.
 * Never prints or stores the password outside its bcrypt hash.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { connect, collection, insert, withTransaction, client } = require('../src/config/db');

async function seed() {
  const password = process.env.DEMO_PASSWORD || '';
  if (password.length < 8 || password.length > 72) throw new Error('Set DEMO_PASSWORD (8-72 characters) in the environment.');
  const hash = await bcrypt.hash(password, 10);
  const today = new Date().toISOString().slice(0, 10);
  return withTransaction(async (session) => {
    const userSpecs = [
      ['student1', 'Demo Student', 'student1@demo.com', 'student', '9876543210'],
      ['student2', 'Arun Kumar', 'student2@demo.com', 'student', '9876543211'],
      ['warden', 'Demo Warden', 'warden@demo.com', 'warden', '9876543212'],
      ['maintenance', 'Demo Maintenance', 'maintenance@demo.com', 'maintenance', '9876543213'],
    ];
    const users = {};
    for (const [key, name, email, role, phone] of userSpecs) {
      let user = await collection('users').findOne({ email }, { session });
      if (user && user.role !== role) throw new Error(`${email} exists with another role; no demo data was changed.`);
      if (user) {
        await collection('users').updateOne({ id: user.id }, { $set: { name, password_hash: hash, phone, is_active: true } }, { session });
      } else {
        user = await insert('users', { name, email, password_hash: hash, role, phone, is_active: true, created_at: new Date() }, session);
      }
      users[key] = user;
    }
    const studentSpecs = [['student1', 'STU001', 'B.Tech IT', 3, 'male'], ['student2', 'STU002', 'B.Sc CS', 2, 'female']];
    const students = {};
    for (const [key, roll, course, year, gender] of studentSpecs) {
      const user = users[key]; let s = await collection('students').findOne({ user_id: user.id }, { session });
      if (s) await collection('students').updateOne({ id: s.id }, { $set: { roll_number: roll, roll_number_lc: roll.toLowerCase(), course, year_of_study: year, gender, admission_date: s.admission_date || today, status: 'active' } }, { session });
      else s = await insert('students', { user_id: user.id, roll_number: roll, roll_number_lc: roll.toLowerCase(), course, year_of_study: year, gender, admission_date: today, status: 'active' }, session);
      students[key] = s;
    }
    let hostel = await collection('hostels').findOne({ name_lc: 'demo hostel' }, { session });
    if (!hostel) hostel = await insert('hostels', { name: 'Demo Hostel', name_lc: 'demo hostel', type: 'mixed', address: 'Campus', warden_id: users.warden.id }, session);
    const rooms = [];
    for (const [number, floor, type, fee] of [['101', 1, 'double', 5000], ['102', 1, 'double', 5000]]) {
      let room = await collection('rooms').findOne({ hostel_id: hostel.id, room_number_lc: number }, { session });
      if (!room) room = await insert('rooms', { hostel_id: hostel.id, room_number: number, room_number_lc: number, floor, room_type: type, capacity: 2, monthly_fee: fee }, session);
      for (let bed_number = 1; bed_number <= 2; bed_number += 1) {
        if (!(await collection('beds').findOne({ room_id: room.id, bed_number }, { session }))) await insert('beds', { room_id: room.id, bed_number, is_usable: true }, session);
      }
      rooms.push(room);
    }
    for (let i = 0; i < 2; i += 1) {
      const s = students[studentSpecs[i][0]]; const room = rooms[i]; const bed = await collection('beds').findOne({ room_id: room.id, bed_number: 1 }, { session });
      if (!(await collection('allocations').findOne({ student_id: s.id, status: 'active' }, { session }))) {
        await insert('allocations', { student_id: s.id, bed_id: bed.id, start_date: today, end_date: null, status: 'active', remarks: 'Demo allocation', created_by: users.warden.id, created_at: new Date() }, session);
      }
      let fee = await collection('fees').findOne({ student_id: s.id, title: 'Demo monthly fee' }, { session });
      if (!fee) fee = await insert('fees', { student_id: s.id, title: 'Demo monthly fee', amount: 5000, due_date: today, created_by: users.warden.id, created_at: new Date() }, session);
      if (!(await collection('payments').findOne({ fee_id: fee.id }, { session }))) await insert('payments', { fee_id: fee.id, receipt_no: `DEMO-${fee.id}`, amount: 1000, method: 'upi', payment_date: today, received_by: users.warden.id, remarks: 'Demo payment', created_at: new Date() }, session);
      if (!(await collection('attendance').findOne({ student_id: s.id, attendance_date: today }, { session }))) await insert('attendance', { student_id: s.id, attendance_date: today, status: 'present', remarks: null, marked_by: users.warden.id }, session);
      if (!(await collection('complaints').findOne({ student_id: s.id, title: 'Demo maintenance request' }, { session }))) await insert('complaints', { student_id: s.id, category: 'furniture', title: 'Demo maintenance request', description: 'Please inspect the desk.', location: `Demo Hostel, Room ${room.room_number}`, priority: 'medium', status: 'assigned', assigned_to: users.maintenance.id, resolution_note: null, created_at: new Date(), updated_at: new Date(), resolved_at: null }, session);
    }
    for (let day = 1; day <= 7; day += 1) {
      for (const [meal_type, items] of [['breakfast', 'Idli, fruit'], ['lunch', 'Rice, vegetables'], ['dinner', 'Roti, curry']]) {
        const found = await collection('mess_menu').findOne({ day_of_week: day, meal_type }, { session });
        if (found) await collection('mess_menu').updateOne({ id: found.id }, { $set: { items } }, { session });
        else await insert('mess_menu', { day_of_week: day, meal_type, items }, session);
      }
    }
    return { users: Object.keys(users).length, students: Object.keys(students).length, rooms: rooms.length };
  });
}
(async () => {
  try { await connect(); const result = await seed(); console.log(`Demo data ready (${result.students} students, ${result.rooms} rooms).`); }
  catch (err) { console.error('Could not seed demo data:', err.message); process.exitCode = 1; }
  finally { if (client()) await client().close(); }
})();
