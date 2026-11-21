// Connects to MongoDB and creates required indexes. Safe to run repeatedly.
require('dotenv').config();
const { connect, client } = require('../src/config/db');

(async () => {
  try {
    const database = await connect();
    console.log(`MongoDB initialized (${database.databaseName}); indexes are ready.`);
  } catch (err) {
    console.error('Could not initialize MongoDB:', err.message);
    process.exitCode = 1;
  } finally {
    if (client()) await client().close();
  }
})();
