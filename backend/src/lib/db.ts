// src/lib/db.ts
import Database from 'better-sqlite3';
import 'dotenv/config';

const DB_PATH = process.env.DB_PATH || './data/app.db';

// Infer the type from the constructor:
let _db: InstanceType<typeof Database> | null = null;

export function getDb() {
  if (_db) return _db;
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  _db = db;
  return _db;
}
