const { query } = require('../config/db');

// Creates one notification per user id. Pass a transaction client to join a transaction.
async function notify(userIds, title, message, link = null, client = null) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))];
  if (!ids.length) return 0;
  const runner = client || { query };
  await runner.query(
    `INSERT INTO notifications (user_id, title, message, link)
     SELECT unnest($1::int[]), $2::text, $3::text, $4::text`,
    [ids, title, message, link]
  );
  return ids.length;
}

const userIdOfStudent = async (studentId) => {
  const { rows } = await query('SELECT user_id FROM students WHERE id = $1', [studentId]);
  return rows[0] ? rows[0].user_id : null;
};

const activeUserIdsByRole = async (roles) => {
  const { rows } = await query('SELECT id FROM users WHERE is_active AND role = ANY($1::text[])', [roles]);
  return rows.map((r) => r.id);
};

module.exports = { notify, userIdOfStudent, activeUserIdsByRole };
