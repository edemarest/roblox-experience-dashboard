import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import 'dotenv/config';

const DB_PATH = process.env.DB_PATH || './data/app.db';
const MIGRATIONS_DIR = path.resolve('db/migrations'); // ensure your .sql files are here

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS _migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

const applied = new Set<string>(
  db.prepare('SELECT filename FROM _migrations ORDER BY id').all().map((r: any) => r.filename)
);

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const mark = db.prepare('INSERT INTO _migrations (filename) VALUES (?)');

for (const file of files) {
  if (applied.has(file)) continue;

  const full = path.join(MIGRATIONS_DIR, file);
  const sqlRaw = fs.readFileSync(full, 'utf8');
  const sql = sqlRaw.trim();

  // detect if the migration file manages its own transaction
  const hasBegin  = /\bBEGIN\b/i.test(sql);
  const hasCommit = /\bCOMMIT\b/i.test(sql);
  const managesTx = hasBegin || hasCommit;

  if (managesTx) {
    // trust the file to handle BEGIN/COMMIT
    db.exec(sql);
    // record the migration separately
    const tx = db.transaction((fname: string) => mark.run(fname));
    tx(file);
  } else {
    // wrap the file in a transaction ourselves
    const tx = db.transaction((fname: string, sqlText: string) => {
      db.exec(sqlText);
      mark.run(fname);
    });
    tx(file, sql);
  }

  console.log(`Applied migration: ${file}`);
}
