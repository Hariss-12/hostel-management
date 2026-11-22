const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
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
  console.error('Set MONGODB_URI to the complete mongodb:// or mongodb+srv:// URI in backend/.env or the backend service environment. Do not include surrounding quotes or placeholder values.');
  console.error('Check MONGODB_DB in the same environment.');
  process.exit(1);
});
