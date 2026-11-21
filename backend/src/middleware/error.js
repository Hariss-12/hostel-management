const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON in request body' });

  // PostgreSQL error codes
  if (err.code === '23505') return res.status(409).json({ message: 'A record with the same unique value already exists' });
  if (err.code === '23503') return res.status(409).json({ message: 'This record is linked to other data, so it cannot be changed or removed' });
  if (['22P02', '22007', '22008', '23502', '23514', '22001'].includes(err.code)) {
    return res.status(400).json({ message: 'One of the submitted values is invalid' });
  }
  if (err.code === '42P01' || err.code === '42703') {
    console.error('Database schema mismatch:', err.message);
    return res.status(503).json({
      message: 'The HMS database schema is incomplete. Apply the latest backend/database/schema.sql file to the hostel_management database.',
      ...(process.env.NODE_ENV === 'development' ? { detail: err.message } : {}),
    });
  }
  if (['ECONNREFUSED', '28P01', '3D000', '28000'].includes(err.code)) {
    console.error('Database connection problem:', err.message);
    return res.status(503).json({ message: 'The database is not reachable. Check the backend .env settings.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
};

module.exports = { notFound, errorHandler };
