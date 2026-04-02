/**
 * salonDataCache.js
 *
 * Persistent JSON cache for salon operational data.
 * Eliminates repeated DB reads for services, branches, timings, etc.
 *
 * File location : data/salon-data.json (project root)
 * Protected GET : GET /salon-data.json?key=<SALON_DATA_KEY>
 *
 * Usage:
 *   initCache()                        — call on server start
 *   getCache()                         — returns in-memory snapshot
 *   patchCache(entity, op, payload)    — incremental CRUD update
 *   saveAtomic()                       — flush in-memory state to disk
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CACHE_DIR  = path.join(__dirname, '../../data');
const CACHE_FILE = path.join(CACHE_DIR, 'salon-data.json');
const CACHE_TMP  = CACHE_FILE + '.tmp';

// ── In-memory snapshot ────────────────────────────────────────────────────────
let _cache = null;

// ── Mutex: serialise all disk writes via a promise chain ──────────────────────
let _writeQueue = Promise.resolve();

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildEmpty() {
  const now = new Date().toISOString();
  return {
    meta: { version: 1, generatedAt: now, updatedAt: now },
    deals:        [],
    services:     [],
    bookings:     [],
    branches:     [],
    staff:        [],
    salonTimings: {},
    staffRoles:   [],
    appSettings:  {},
  };
}

/**
 * Full rebuild from the live DB.
 * Only called when the cache file does not exist or is corrupt.
 */
function _buildFromDb() {
  const { getDb } = require('../db/database');
  const db = getDb();
  const cache = _buildEmpty();

  cache.deals    = db.prepare('SELECT * FROM deals ORDER BY id').all();
  cache.services = db.prepare('SELECT * FROM services ORDER BY branch, name').all();
  cache.bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  cache.branches = db.prepare('SELECT * FROM branches ORDER BY number').all();
  cache.staff    = db.prepare(`
    SELECT s.*, b.name AS branch_name
    FROM   staff s
    LEFT JOIN branches b ON s.branch_id = b.id
    ORDER BY s.name
  `).all();

  const timings = db.prepare('SELECT * FROM salon_timings').all();
  cache.salonTimings = {};
  timings.forEach(t => { cache.salonTimings[t.day_type] = t; });

  cache.staffRoles = db.prepare('SELECT * FROM staff_roles ORDER BY name').all();

  const settingRows = db.prepare('SELECT key, value FROM app_settings').all();
  cache.appSettings = {};
  settingRows.forEach(r => { cache.appSettings[r.key] = r.value; });

  const now = new Date().toISOString();
  cache.meta.generatedAt = now;
  cache.meta.updatedAt   = now;
  return cache;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Persist the in-memory cache to disk atomically.
 * Writes are serialised through _writeQueue to prevent concurrent corruption.
 */
function saveAtomic() {
  _writeQueue = _writeQueue.then(() => {
    if (!_cache) return;
    try {
      _cache.meta.updatedAt = new Date().toISOString();
      const json = JSON.stringify(_cache, null, 2);
      fs.writeFileSync(CACHE_TMP, json, 'utf8');
      fs.renameSync(CACHE_TMP, CACHE_FILE);
    } catch (err) {
      logger.error('[cache] Atomic write failed:', err.message);
    }
  });
  return _writeQueue;
}

/**
 * Initialise the cache on server start.
 *  - Loads existing file if present and valid.
 *  - Rebuilds from DB if file is missing or corrupt.
 */
async function initCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    if (fs.existsSync(CACHE_FILE)) {
      try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        _cache = JSON.parse(raw);
        logger.info('[cache] Loaded salon-data.json from disk');
        return;
      } catch (parseErr) {
        logger.error('[cache] Cache file corrupt — rebuilding from DB:', parseErr.message);
      }
    }

    logger.info('[cache] Building salon-data.json from DB...');
    _cache = _buildFromDb();
    await saveAtomic();
    logger.info('[cache] salon-data.json created successfully');
  } catch (err) {
    logger.error('[cache] initCache failed:', err.message);
    _cache = _buildEmpty();   // degraded mode — don't crash the server
  }
}

/** Returns the current in-memory cache object (may be null before initCache). */
function getCache() {
  return _cache;
}

/**
 * Apply an incremental CRUD patch to the in-memory cache and flush to disk.
 *
 * @param {string} entityType  'deals' | 'services' | 'bookings' | 'branches' |
 *                             'staff' | 'salonTimings' | 'staffRoles' | 'appSettings'
 * @param {'upsert'|'delete'|'replace'} op
 * @param {object|Array} payload
 *   - replace : the complete new array / object for this entity
 *   - upsert  : single row object (must have an .id field, except salonTimings)
 *   - delete  : { id } or { day_type } for salonTimings
 */
async function patchCache(entityType, op, payload) {
  if (!_cache) return;
  try {
    if (op === 'replace') {
      _cache[entityType] = payload;

    } else if (op === 'upsert') {
      if (entityType === 'salonTimings') {
        // payload can be a single timing row { day_type, open_time, close_time }
        // or a map { workday: {...}, weekend: {...} }
        if (payload && payload.day_type) {
          _cache.salonTimings[payload.day_type] = payload;
        } else if (payload && typeof payload === 'object') {
          Object.assign(_cache.salonTimings, payload);
        }
      } else if (entityType === 'appSettings') {
        // payload is a key-value map, e.g. { currency: 'Rs.' }
        if (payload && typeof payload === 'object') {
          Object.assign(_cache.appSettings, payload);
        }
      } else {
        const arr = _cache[entityType];
        if (!Array.isArray(arr)) return;
        const pid = Number(payload.id);
        const idx = arr.findIndex(item => Number(item.id) === pid);
        if (idx >= 0) {
          arr[idx] = payload;
        } else {
          arr.push(payload);
        }
      }

    } else if (op === 'delete') {
      if (entityType === 'salonTimings') {
        if (payload && payload.day_type) {
          delete _cache.salonTimings[payload.day_type];
        }
      } else if (entityType === 'appSettings') {
        if (payload && payload.key) {
          delete _cache.appSettings[payload.key];
        }
      } else {
        const arr = _cache[entityType];
        if (!Array.isArray(arr)) return;
        const pid = Number(payload.id);
        const idx = arr.findIndex(item => Number(item.id) === pid);
        if (idx >= 0) arr.splice(idx, 1);
      }
    }

    await saveAtomic();
  } catch (err) {
    logger.error(`[cache] patchCache error (${entityType}/${op}):`, err.message);
  }
}

module.exports = { initCache, getCache, patchCache, saveAtomic };
