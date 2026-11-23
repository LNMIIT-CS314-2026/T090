'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const SCHEMA_VERSION = 2;
const TABLES = ['reports', 'audit_logs', 'notifications', 'impact_metrics', 'status_history', 'verifications', 'publications', 'users', 'departments', 'sequences'];

/** Opens (and creates if needed) the database and applies the schema. Use ':memory:' for tests. */
function openDb(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');

  // A database from the first increment has an older schema. It only holds demo data, so it is
  // dropped and rebuilt; the server then seeds it again.
  const hasTables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().n > 0;
  if (hasTables && db.pragma('user_version', { simple: true }) < SCHEMA_VERSION) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => { for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`); })();
    db.pragma('foreign_keys = ON');
    console.log('Older database schema found: the demo database was rebuilt.');
  }
  db.exec(SCHEMA);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  return db;
}

module.exports = { openDb, SCHEMA_VERSION };
