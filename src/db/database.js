const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../salon.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL,
      active      BOOLEAN NOT NULL DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    price       TEXT    NOT NULL,
    description TEXT,
    branch      TEXT    NOT NULL DEFAULT 'All Branches',
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

    CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT    NOT NULL,
    phone         TEXT,
    service       TEXT,
    branch        TEXT,
    date          TEXT,
    time          TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending',
    source        TEXT    DEFAULT 'manual',
    notes         TEXT,
    calendly_uri  TEXT    UNIQUE,   -- prevents duplicate webhook inserts
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );
  `);
}

module.exports = { getDb };
