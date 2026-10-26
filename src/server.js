'use strict';
const path = require('path');
const { openDb } = require('./db/connection');
const { seed, isSeeded } = require('./db/seed');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(__dirname, '..', 'data', 'researchpulse.db');

const db = openDb(DB_FILE);
if (!isSeeded(db)) {
  seed(db);
  console.log('Database created and seeded with the demo data.');
}

const app = createApp(db);
const server = app.listen(PORT, () => {
  console.log(`ResearchPulse is running at http://localhost:${PORT}`);
  console.log('Demo password for every account: demo123');
});

process.on('SIGINT', () => {
  server.close();
  db.close();
  process.exit(0);
});
