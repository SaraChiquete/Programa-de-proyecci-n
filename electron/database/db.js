const Database = require('better-sqlite3');
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let db;
function initDb() {
  const file = path.join(app.getPath('userData'), 'proyector.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}
const getDb = () => db;
module.exports = { initDb, getDb };
