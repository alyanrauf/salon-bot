const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../salon.db');

let db;

// ── In-memory settings cache ──────────────────────────────────────────────────
let _settingsCache = null;

function getSettings() {
  if (_settingsCache) return _settingsCache;
  const rows = getDb().prepare('SELECT key, value FROM app_settings').all();
  _settingsCache = {};
  rows.forEach(r => { _settingsCache[r.key] = r.value; });
  return _settingsCache;
}

function invalidateSettingsCache() {
  _settingsCache = null;
}

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
      status        TEXT    NOT NULL DEFAULT 'confirmed',
      source        TEXT    DEFAULT 'manual',
      notes         TEXT,
      calendly_uri  TEXT    UNIQUE,
      created_at    TEXT    DEFAULT (datetime('now')),
      updated_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS branches (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      number     INTEGER UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      address    TEXT NOT NULL,
      map_link   TEXT NOT NULL,
      phone      TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      phone      TEXT NOT NULL,
      role       TEXT NOT NULL,
      branch_id  INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS salon_timings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      day_type   TEXT NOT NULL UNIQUE,
      open_time  TEXT NOT NULL,
      close_time TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff_roles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // One-time migration: seed branches from env vars if table is empty
  const branchCount = db.prepare('SELECT COUNT(*) as c FROM branches').get().c;
  if (branchCount === 0) {
    const insert = db.prepare(
      `INSERT INTO branches (number, name, address, map_link, phone) VALUES (?, ?, ?, ?, ?)`
    );
    for (let i = 1; i <= 2; i++) {
      const name = process.env[`BRANCH${i}_NAME`] || `Branch ${i}`;
      const address = process.env[`BRANCH${i}_ADDRESS`] || '';
      const mapLink = process.env[`BRANCH${i}_MAP_LINK`] || '';
      const phone = process.env[`BRANCH${i}_PHONE`] || '';
      insert.run(i, name, address, mapLink, phone);
    }
  }

  // Seed default salon timings if not set
  const timingCount = db.prepare('SELECT COUNT(*) as c FROM salon_timings').get().c;
  if (timingCount === 0) {
    const ins = db.prepare(
      `INSERT INTO salon_timings (day_type, open_time, close_time) VALUES (?, ?, ?)`
    );
    ins.run('workday', '10:00', '21:00');
    ins.run('weekend', '12:00', '22:00');
  }

  // Seed default staff roles if empty
  const roleCount = db.prepare('SELECT COUNT(*) as c FROM staff_roles').get().c;
  if (roleCount === 0) {
    const insRole = db.prepare(`INSERT INTO staff_roles (name) VALUES (?)`);
    ['stylist', 'receptionist', 'manager', 'admin'].forEach(r => insRole.run(r));
  }

  // Seed default currency if not set
  const currencyRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'currency'`).get();
  if (!currencyRow) {
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('currency', 'Rs.')`).run();
  }

  // One-time migration: add staff_id to bookings if missing
  const bookingCols = db.prepare(`PRAGMA table_info(bookings)`).all().map(c => c.name);
  if (!bookingCols.includes('staff_id')) {
    db.exec(`ALTER TABLE bookings ADD COLUMN staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL`);
  }
  if (!bookingCols.includes('staff_name')) {
    db.exec(`ALTER TABLE bookings ADD COLUMN staff_name TEXT`);
  }
}

module.exports = { getDb, getSettings, invalidateSettingsCache };
