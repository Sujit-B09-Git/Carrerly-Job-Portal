const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const databaseFile = path.join(__dirname, 'careerly.sqlite');
const db = new DatabaseSync(databaseFile);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const violations = db.prepare('PRAGMA foreign_key_check').all();

console.log(`SQLite database: ${databaseFile}`);
console.log(`Foreign-key violations: ${violations.length}`);
tables.forEach(({ name }) => {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
  console.log(`${name}: ${count}`);
});

if (violations.length) process.exitCode = 1;
