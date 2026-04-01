const fs   = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const CACHE_FILE = path.join(__dirname, 'salon-cache.json');

// In-memory mirror — reads hit memory after the first load, never the file
let _mem = null;

// ── Internal helpers ──────────────────────────────────────────────────────────

function _write(data) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    _mem = data;
}

function _read() {
    if (_mem) return _mem;
    try {
        _mem = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
        _mem = { services: [], deals: [], branches: [], timings: [], staff: [] };
    }
    return _mem;
}

function _patch(key, rows) {
    const cache = _read();
    cache[key] = rows;
    _write(cache);   // rewrites only this section in memory + persists to file
}

// ── Public: startup ───────────────────────────────────────────────────────────

// Call once when the server starts. Builds the full JSON from DB and writes it.
function initCache() {
    const db = getDb();
    _write({
        services: db.prepare('SELECT name, price, description FROM services ORDER BY name').all(),
        deals:    db.prepare('SELECT title, description FROM deals WHERE active = 1 ORDER BY title').all(),
        branches: db.prepare('SELECT name, address, phone FROM branches ORDER BY name').all(),
        timings:  db.prepare('SELECT day_type, open_time, close_time FROM salon_timings').all(),
        staff:    db.prepare(`
            SELECT s.name, s.role, b.name AS branch_name
            FROM staff s
            LEFT JOIN branches b ON s.branch_id = b.id
            WHERE s.status = 'active'
              AND LOWER(s.role) NOT IN ('admin','manager','receptionist')
            ORDER BY b.name, s.name
        `).all(),
    });
}

// ── Public: section-specific updaters ────────────────────────────────────────
// Each one re-queries only its own table and patches that key in the JSON file.

function updateServices() {
    _patch('services', getDb().prepare(
        'SELECT name, price, description FROM services ORDER BY name'
    ).all());
}

function updateDeals() {
    _patch('deals', getDb().prepare(
        'SELECT title, description FROM deals WHERE active = 1 ORDER BY title'
    ).all());
}

function updateBranches() {
    _patch('branches', getDb().prepare(
        'SELECT name, address, phone FROM branches ORDER BY name'
    ).all());
}

function updateStaff() {
    _patch('staff', getDb().prepare(`
        SELECT s.name, s.role, b.name AS branch_name
        FROM staff s
        LEFT JOIN branches b ON s.branch_id = b.id
        WHERE s.status = 'active'
          AND LOWER(s.role) NOT IN ('admin','manager','receptionist')
        ORDER BY b.name, s.name
    `).all());
}

function updateTimings() {
    _patch('timings', getDb().prepare(
        'SELECT day_type, open_time, close_time FROM salon_timings'
    ).all());
}

// ── Public: context builder for Gemini system instruction ────────────────────

function buildSalonContext() {
    const c = _read();

    const svcLines = (c.services || []).length
        ? c.services.map(s => `- ${s.name}: ${s.price}${s.description ? ' (' + s.description + ')' : ''}`).join('\n')
        : '(none configured)';

    const dealLines = (c.deals || []).length
        ? c.deals.map(d => `- ${d.title}: ${d.description}`).join('\n')
        : '(none configured)';

    const branchLines = (c.branches || []).length
        ? c.branches.map(b => `- ${b.name}: ${b.address}${b.phone ? ', ' + b.phone : ''}`).join('\n')
        : '(none configured)';

    const timingLines = (c.timings || []).length
        ? c.timings.map(t => `- ${t.day_type}: ${t.open_time} – ${t.close_time}`).join('\n')
        : '(not configured)';

    const byBranch = {};
    for (const s of (c.staff || [])) {
        const key = s.branch_name || 'Unassigned';
        (byBranch[key] = byBranch[key] || []).push(`${s.name} (${s.role || 'Stylist'})`);
    }
    const staffLines = Object.keys(byBranch).length
        ? Object.entries(byBranch).map(([b, names]) => `  ${b}: ${names.join(', ')}`).join('\n')
        : '(none configured)';

    return `SALON DATA (already known — do not call any tool to fetch this):

SERVICES & PRICES:
${svcLines}

ACTIVE DEALS & PACKAGES:
${dealLines}

BRANCHES:
${branchLines}

OPENING HOURS:
${timingLines}

STAFF (active stylists per branch):
${staffLines}`;
}

module.exports = { initCache, updateServices, updateDeals, updateBranches, updateStaff, updateTimings, buildSalonContext };
