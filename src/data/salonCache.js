const { getDb } = require('../db/database');

let _cache = null;

function refreshCache() {
    const db = getDb();

    const services = db.prepare('SELECT name, price, description FROM services ORDER BY name').all();
    const branches = db.prepare('SELECT name, address, phone FROM branches ORDER BY name').all();
    const timings  = db.prepare('SELECT day_type, open_time, close_time FROM salon_timings').all();
    const staff    = db.prepare(`
        SELECT s.name, s.role, b.name AS branch_name
        FROM staff s
        LEFT JOIN branches b ON s.branch_id = b.id
        WHERE s.status = 'active'
          AND LOWER(s.role) NOT IN ('admin','manager','receptionist')
        ORDER BY b.name, s.name
    `).all();
    const deals    = db.prepare('SELECT title, description FROM deals WHERE active = 1 ORDER BY title').all();

    _cache = { services, branches, timings, staff, deals };
}

function getCache() {
    if (!_cache) refreshCache();
    return _cache;
}

function buildSalonContext() {
    const c = getCache();

    const svcLines = c.services.length
        ? c.services.map(s => `- ${s.name}: ${s.price}${s.description ? ' (' + s.description + ')' : ''}`).join('\n')
        : '(none configured)';

    const branchLines = c.branches.length
        ? c.branches.map(b => `- ${b.name}: ${b.address}${b.phone ? ', ' + b.phone : ''}`).join('\n')
        : '(none configured)';

    const timingLines = c.timings.length
        ? c.timings.map(t => `- ${t.day_type}: ${t.open_time} – ${t.close_time}`).join('\n')
        : '(not configured)';

    const byBranch = {};
    for (const s of c.staff) {
        const key = s.branch_name || 'Unassigned';
        (byBranch[key] = byBranch[key] || []).push(`${s.name} (${s.role || 'Stylist'})`);
    }
    const staffLines = Object.keys(byBranch).length
        ? Object.entries(byBranch).map(([b, names]) => `  ${b}: ${names.join(', ')}`).join('\n')
        : '(none configured)';

    const dealLines = c.deals.length
        ? c.deals.map(d => `- ${d.title}: ${d.description}`).join('\n')
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

module.exports = { refreshCache, getCache, buildSalonContext };
