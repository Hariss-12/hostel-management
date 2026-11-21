const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ message: err.message, errors: err.errors });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON in request body' });

  if (err.code === 11000) return res.status(409).json({ message: 'A record with the same unique value already exists' });
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError' || err.code === 'ENOTFOUND') {
    console.error('Database connection problem:', err.message);
    return res.status(503).json({ message: 'The database is not reachable. Check MONGODB_URI and MONGODB_DB in backend/.env.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
};

module.exports = { notFound, errorHandler };
