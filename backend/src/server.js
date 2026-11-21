require('dotenv').config();
const app = require('./app');
const { connect } = require('./config/db');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and configure it.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

connect().then((database) => {
  app.listen(PORT, () => {
    console.log(`HMS API listening on http://localhost:${PORT}`);
    console.log(`MongoDB connection OK (${database.databaseName}); indexes are ready`);
  });
}).catch((err) => {
  console.error(`MongoDB startup failed: ${err.message}`);
  console.error('Check MONGODB_URI and MONGODB_DB in backend/.env.');
  process.exit(1);
});
