const { collection, nextId } = require('../config/db');

async function notify(userIds, title, message, link = null, session = null) {
  const ids = [...new Set([].concat(userIds).filter((id) => Number.isInteger(Number(id))).map(Number))];
  if (!ids.length) return 0;
  const now = new Date();
  const notifications = [];
  for (const user_id of ids) {
    notifications.push({ id: await nextId('notifications', session), user_id, title, message, link, is_read: false, created_at: now });
  }
  await collection('notifications').insertMany(
    notifications,
    { session }
  );
  return ids.length;
}

const userIdOfStudent = async (studentId) => {
  const student = await collection('students').findOne({ id: Number(studentId) }, { projection: { user_id: 1 } });
  return student ? student.user_id : null;
};

const activeUserIdsByRole = async (roles) => (
  await collection('users').find({ is_active: true, role: { $in: roles } }, { projection: { id: 1 } }).toArray()
).map((u) => u.id);

module.exports = { notify, userIdOfStudent, activeUserIdsByRole };
