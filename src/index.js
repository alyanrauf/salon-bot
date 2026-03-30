require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const { getDb, invalidateSettingsCache } = require('./db/database');

// Platform handlers
const { handleWhatsApp, verifyWhatsApp } = require('./handlers/whatsapp');
const { handleInstagram, verifyInstagram } = require('./handlers/instagram');
const { handleFacebook, verifyFacebook } = require('./handlers/facebook');

// Admin auth
const { requireAdminAuth } = require('./admin/auth');

// Chat router (reused for web widget)
const { routeMessage } = require('./core/router');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple cookie parser (no extra dep)
app.use((req, res, next) => {
  const raw = req.headers.cookie || '';
  req.cookies = Object.fromEntries(
    raw.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
  );
  next();
});

// Serve widget.js with CORS so any website can load it
app.use('/widget.js', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Serve public directory (widget.js lives here)
app.use(express.static(path.join(__dirname, '../public')));

// CORS for the chat API endpoint
app.use('/api/chat', (req, res, next) => {
  const allowed = process.env.WIDGET_ALLOWED_ORIGINS || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Salon Bot is running ✅'));

// ─── Web chat API ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId required' });
  }
  try {
    const reply = await routeMessage(sessionId, message.trim(), 'webchat');
    res.json({ reply });
  } catch (err) {
    logger.error('[chat-api] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── Webhook routes ───────────────────────────────────────────────────────────

// WhatsApp (single webhook, Meta differentiates by object type)
app.get('/webhook', (req, res) => {
  // Meta sends the same verification for all products on one app
  const token = req.query['hub.verify_token'];
  if (token === process.env.META_VERIFY_TOKEN) {
    logger.info('[Webhook] Verified');
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  const object = req.body?.object;
  if (object === 'whatsapp_business_account') return handleWhatsApp(req, res);
  if (object === 'instagram') return handleInstagram(req, res);
  if (object === 'page') return handleFacebook(req, res);
  res.sendStatus(200); // Acknowledge unknown events
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

// Login
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.setHeader(
      'Set-Cookie',
      `adminToken=${process.env.ADMIN_SESSION_SECRET}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`
    );
    return res.redirect('/admin');
  }
  res.status(401).send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
    <h2 style="color:#e74c3c">Incorrect password</h2>
    <a href="/admin">Try again</a>
    </body></html>
  `);
});

// Logout
app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'adminToken=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/admin');
});

// Admin panel (protected)
app.get('/admin', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin/views/panel.html'));
});

// Admin API — get deals
app.get('/admin/api/deals', requireAdminAuth, (req, res) => {
  const db = getDb();
  const deals = db.prepare('SELECT * FROM deals ORDER BY id').all();
  res.json(deals);
});

// Admin API — get services
app.get('/admin/api/services', requireAdminAuth, (req, res) => {
  const db = getDb();
  const services = db.prepare('SELECT * FROM services ORDER BY branch, name').all();
  res.json(services);
});

// Admin API — save deals
app.post('/admin/deals', requireAdminAuth, (req, res) => {
  try {
    const { deals } = req.body;
    if (!Array.isArray(deals)) return res.json({ ok: false, error: 'Invalid data' });

    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO deals (id, title, description, active, updated_at)
      VALUES (@id, @title, @description, @active, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        active = excluded.active,
        updated_at = excluded.updated_at
    `);
    const insert = db.prepare(`
      INSERT INTO deals (title, description, active, updated_at)
      VALUES (@title, @description, @active, datetime('now'))
    `);

    // Get current IDs to detect deletions
    const existingIds = new Set(db.prepare('SELECT id FROM deals').all().map(r => r.id));
    const incomingIds = new Set(deals.filter(d => d.id).map(d => d.id));
    const toDelete = [...existingIds].filter(id => !incomingIds.has(id));

    const runAll = db.transaction(() => {
      // Delete removed deals
      for (const id of toDelete) {
        db.prepare('DELETE FROM deals WHERE id = ?').run(id);
      }
      // Upsert/insert
      for (const deal of deals) {
        if (deal.id) {
          upsert.run({ id: deal.id, title: deal.title, description: deal.description, active: deal.active ? 1 : 0 });
        } else {
          insert.run({ title: deal.title, description: deal.description, active: deal.active ? 1 : 0 });
        }
      }
    });
    runAll();

    const updated = db.prepare('SELECT * FROM deals ORDER BY id').all();
    res.json({ ok: true, deals: updated });
  } catch (err) {
    logger.error('[admin] Save deals error:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

// Admin API — save services
app.post('/admin/services', requireAdminAuth, (req, res) => {
  try {
    const { services } = req.body;
    if (!Array.isArray(services)) return res.json({ ok: false, error: 'Invalid data' });

    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO services (id, name, price, description, branch, updated_at)
      VALUES (@id, @name, @price, @description, @branch, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name        = excluded.name,
        price       = excluded.price,
        description = excluded.description,
        branch      = excluded.branch,
        updated_at  = excluded.updated_at
    `);
    const insert = db.prepare(`
      INSERT INTO services (name, price, description, branch, updated_at)
      VALUES (@name, @price, @description, @branch, datetime('now'))
    `);

    const existingIds = new Set(db.prepare('SELECT id FROM services').all().map(r => r.id));
    const incomingIds = new Set(services.filter(s => s.id).map(s => s.id));
    const toDelete = [...existingIds].filter(id => !incomingIds.has(id));

    const runAll = db.transaction(() => {
      for (const id of toDelete) {
        db.prepare('DELETE FROM services WHERE id = ?').run(id);
      }
      for (const svc of services) {
        if (svc.id) {
          upsert.run({ id: svc.id, name: svc.name, price: svc.price, description: svc.description, branch: svc.branch || 'All Branches' });
        } else {
          insert.run({ name: svc.name, price: svc.price, description: svc.description, branch: svc.branch || 'All Branches' });
        }
      }
    });
    runAll();

    const updated = db.prepare('SELECT * FROM services ORDER BY branch, name').all();
    res.json({ ok: true, services: updated });
  } catch (err) {
    logger.error('[admin] Save services error:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

// Admin panel HTML
app.get('/admin', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin/views/panel.html'));
});

// ── Stats ──────────────────────────────────────────────────────────────────
app.get('/admin/api/stats', requireAdminAuth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    total_bookings: db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,
    today_bookings: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date = ?").get(today).n,
    active_services: db.prepare('SELECT COUNT(*) AS n FROM services').get().n,
    total_clients: db.prepare('SELECT COUNT(DISTINCT customer_name) AS n FROM bookings').get().n,
  };
  res.json(stats);
});

// ── Bookings ───────────────────────────────────────────────────────────────
app.get('/admin/api/bookings', requireAdminAuth, (req, res) => {
  const db = getDb();
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const args = [];
  if (req.query.date) { sql += ' AND date = ?'; args.push(req.query.date); }
  if (req.query.status) { sql += ' AND status = ?'; args.push(req.query.status); }
  sql += ' ORDER BY created_at DESC';
  if (req.query.limit) { sql += ' LIMIT ?'; args.push(parseInt(req.query.limit)); }
  res.json(db.prepare(sql).all(...args));
});

// ── Booking validation helpers ────────────────────────────────────────────────

function validateBookingBody(body) {
  const { customer_name, phone, service, branch, date, time, status } = body;
  const errs = [];
  if (!customer_name?.trim()) errs.push('customer_name');
  if (!phone?.trim())         errs.push('phone');
  if (!service?.trim())       errs.push('service');
  if (!branch?.trim())        errs.push('branch');
  if (!status?.trim())        errs.push('status');
  if (!time?.trim())          errs.push('time');
  if (!date?.trim()) {
    errs.push('date');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (date.trim() < today) errs.push('date (cannot be in the past)');
  }
  return errs;
}

function checkStaffBranch(staff_id, branch, db) {
  if (!staff_id) return null;  // staff is optional
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(staff_id);
  if (!staff) return 'Selected staff member not found.';
  if (staff.branch_id === null) return null;  // unassigned staff — allowed at any branch
  const br = db.prepare('SELECT id FROM branches WHERE name = ?').get(branch);
  if (!br || staff.branch_id !== br.id)
    return 'Selected staff does not belong to this branch.';
  return null;
}

function checkBookingTiming(date, time, db) {
  const dow = new Date(date).getDay();
  const dayType = (dow === 0 || dow === 6) ? 'weekend' : 'workday';
  const timing = db.prepare('SELECT * FROM salon_timings WHERE day_type = ?').get(dayType);
  if (!timing) return null;
  const [rh, rm] = time.split(':').map(Number);
  const requested = rh * 60 + rm;
  const [oh, om] = timing.open_time.split(':').map(Number);
  const [ch, cm] = timing.close_time.split(':').map(Number);
  if (requested < oh * 60 + om || requested > ch * 60 + cm)
    return `Time ${time} is outside ${dayType} hours (${timing.open_time}–${timing.close_time})`;
  return null;
}

app.post('/admin/api/bookings', requireAdminAuth, (req, res) => {
  const db = getDb();
  const { customer_name, phone, service, branch, date, time, notes, status, staff_id, staff_name } = req.body;
  const errs = validateBookingBody(req.body);
  if (errs.length) return res.status(400).json({ ok: false, error: `Required fields missing or invalid: ${errs.join(', ')}` });
  const timingErr = checkBookingTiming(date.trim(), time.trim(), db);
  if (timingErr) return res.status(400).json({ ok: false, error: timingErr });
  const staffErr = checkStaffBranch(staff_id, branch.trim(), db);
  if (staffErr) return res.status(400).json({ ok: false, error: staffErr });
  const r = db.prepare(`
    INSERT INTO bookings (customer_name, phone, service, branch, date, time, notes, status, source, staff_id, staff_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).run(customer_name.trim(), phone.trim(), service.trim(), branch.trim(), date.trim(), time.trim(), notes || null, status.trim(), staff_id || null, staff_name || null);
  res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/admin/api/bookings/:id', requireAdminAuth, (req, res) => {
  const db = getDb();
  const { customer_name, phone, service, branch, date, time, notes, status, staff_id, staff_name } = req.body;
  const errs = validateBookingBody(req.body);
  if (errs.length) return res.status(400).json({ ok: false, error: `Required fields missing or invalid: ${errs.join(', ')}` });
  const timingErr = checkBookingTiming(date.trim(), time.trim(), db);
  if (timingErr) return res.status(400).json({ ok: false, error: timingErr });
  const staffErr = checkStaffBranch(staff_id, branch.trim(), db);
  if (staffErr) return res.status(400).json({ ok: false, error: staffErr });
  db.prepare(`
    UPDATE bookings SET customer_name=?, phone=?, service=?, branch=?, date=?, time=?, notes=?, status=?, staff_id=?, staff_name=?, updated_at=datetime('now')
    WHERE id=?
  `).run(customer_name.trim(), phone.trim(), service.trim(), branch.trim(), date.trim(), time.trim(), notes || null, status.trim(), staff_id || null, staff_name || null, req.params.id);
  res.json({ ok: true });
});

app.patch('/admin/api/bookings/:id/status', requireAdminAuth, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE bookings SET status=?, updated_at=datetime('now') WHERE id=?")
    .run(req.body.status, req.params.id);
  res.json({ ok: true });
});

app.delete('/admin/api/bookings/:id', requireAdminAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM bookings WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Clients ────────────────────────────────────────────────────────────────
app.get('/admin/api/clients', requireAdminAuth, (req, res) => {
  const db = getDb();
  const clients = db.prepare(`
    SELECT customer_name, phone,
           COUNT(*) AS booking_count,
           MAX(date) AS last_visit
    FROM bookings
    GROUP BY customer_name, phone
    ORDER BY last_visit DESC
  `).all();
  res.json(clients);
});

// ─── Settings: Branches ────────────────────────────────────────────────────────

app.get('/admin/api/settings/branches', requireAdminAuth, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM branches ORDER BY number ASC').all());
});

app.post('/admin/api/settings/branches', requireAdminAuth, (req, res) => {
  const { name, address, map_link, phone } = req.body;
  const errs = [];
  if (!name?.trim()) errs.push('name');
  if (!address?.trim()) errs.push('address');
  if (!map_link?.trim() || !map_link.trim().startsWith('http')) errs.push('map_link (must be a valid URL starting with http)');
  if (!phone?.trim()) errs.push('phone');
  if (errs.length) return res.status(400).json({ error: `Required fields missing or invalid: ${errs.join(', ')}` });

  const db = getDb();
  const maxNum = db.prepare('SELECT COALESCE(MAX(number), 0) as m FROM branches').get().m;
  const r = db.prepare(
    `INSERT INTO branches (number, name, address, map_link, phone) VALUES (?, ?, ?, ?, ?)`
  ).run(maxNum + 1, name.trim(), address.trim(), map_link.trim(), phone.trim());
  res.json(db.prepare('SELECT * FROM branches WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/admin/api/settings/branches/:id', requireAdminAuth, (req, res) => {
  const { name, address, map_link, phone } = req.body;
  const errs = [];
  if (!name?.trim()) errs.push('name');
  if (!address?.trim()) errs.push('address');
  if (!map_link?.trim() || !map_link.trim().startsWith('http')) errs.push('map_link');
  if (!phone?.trim()) errs.push('phone');
  if (errs.length) return res.status(400).json({ error: `Required fields missing or invalid: ${errs.join(', ')}` });

  getDb().prepare(
    `UPDATE branches SET name=?, address=?, map_link=?, phone=?, updated_at=datetime('now') WHERE id=?`
  ).run(name.trim(), address.trim(), map_link.trim(), phone.trim(), req.params.id);
  res.json({ ok: true });
});

app.delete('/admin/api/settings/branches/:id', requireAdminAuth, (req, res) => {
  getDb().prepare('DELETE FROM branches WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Settings: Staff ───────────────────────────────────────────────────────────

app.get('/admin/api/settings/staff', requireAdminAuth, (req, res) => {
  const staff = getDb().prepare(`
    SELECT s.*, b.name as branch_name
    FROM staff s
    LEFT JOIN branches b ON s.branch_id = b.id
    ORDER BY s.name ASC
  `).all();
  res.json(staff);
});

app.post('/admin/api/settings/staff', requireAdminAuth, (req, res) => {
  const { name, phone, role, branch_id, status } = req.body;
  const db = getDb();
  const validRoles = db.prepare('SELECT name FROM staff_roles').all().map(r => r.name);
  const errs = [];
  if (!name?.trim()) errs.push('name');
  if (!phone?.trim()) errs.push('phone');
  if (!role || !validRoles.includes(role)) errs.push(`role (${validRoles.join(', ')})`);
  if (errs.length) return res.status(400).json({ error: `Required fields missing or invalid: ${errs.join(', ')}` });

  const r = db.prepare(
    `INSERT INTO staff (name, phone, role, branch_id, status) VALUES (?, ?, ?, ?, ?)`
  ).run(name.trim(), phone.trim(), role, branch_id || null, status || 'active');
  res.json(db.prepare('SELECT * FROM staff WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/admin/api/settings/staff/:id', requireAdminAuth, (req, res) => {
  const { name, phone, role, branch_id, status } = req.body;
  const db = getDb();
  const validRoles = db.prepare('SELECT name FROM staff_roles').all().map(r => r.name);
  const errs = [];
  if (!name?.trim()) errs.push('name');
  if (!phone?.trim()) errs.push('phone');
  if (!role || !validRoles.includes(role)) errs.push('role');
  if (errs.length) return res.status(400).json({ error: `Required fields missing or invalid: ${errs.join(', ')}` });

  getDb().prepare(
    `UPDATE staff SET name=?, phone=?, role=?, branch_id=?, status=?, updated_at=datetime('now') WHERE id=?`
  ).run(name.trim(), phone.trim(), role, branch_id || null, status || 'active', req.params.id);
  res.json({ ok: true });
});

app.delete('/admin/api/settings/staff/:id', requireAdminAuth, (req, res) => {
  getDb().prepare('DELETE FROM staff WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Settings: Salon Timings ───────────────────────────────────────────────────

app.get('/admin/api/settings/timings', requireAdminAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM salon_timings').all();
  const result = {};
  rows.forEach(r => { result[r.day_type] = r; });
  res.json(result);
});

app.put('/admin/api/settings/timings', requireAdminAuth, (req, res) => {
  const { workday, weekend } = req.body;
  const timeRx = /^\d{2}:\d{2}$/;
  const errs = [];
  if (!workday?.open_time || !timeRx.test(workday.open_time)) errs.push('workday.open_time');
  if (!workday?.close_time || !timeRx.test(workday.close_time)) errs.push('workday.close_time');
  if (!weekend?.open_time || !timeRx.test(weekend.open_time)) errs.push('weekend.open_time');
  if (!weekend?.close_time || !timeRx.test(weekend.close_time)) errs.push('weekend.close_time');
  if (errs.length) return res.status(400).json({ error: `Invalid or missing fields: ${errs.join(', ')}` });
  if (workday.close_time <= workday.open_time)
    return res.status(400).json({ error: 'Workday closing time must be after opening time' });
  if (weekend.close_time <= weekend.open_time)
    return res.status(400).json({ error: 'Weekend closing time must be after opening time' });

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO salon_timings (day_type, open_time, close_time, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(day_type) DO UPDATE SET
      open_time  = excluded.open_time,
      close_time = excluded.close_time,
      updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    upsert.run('workday', workday.open_time, workday.close_time);
    upsert.run('weekend', weekend.open_time, weekend.close_time);
  })();
  res.json({ ok: true });
});

// ─── Settings: Staff Roles ─────────────────────────────────────────────────────

app.get('/admin/api/settings/roles', requireAdminAuth, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM staff_roles ORDER BY name ASC').all());
});

app.post('/admin/api/settings/roles', requireAdminAuth, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Role name is required' });
  const normalized = name.trim().toLowerCase();
  try {
    const r = getDb().prepare(`INSERT INTO staff_roles (name) VALUES (?)`).run(normalized);
    res.json(getDb().prepare('SELECT * FROM staff_roles WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Role already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/settings/roles/:id', requireAdminAuth, (req, res) => {
  getDb().prepare('DELETE FROM staff_roles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Settings: App Settings (currency etc.) ────────────────────────────────────

app.get('/admin/api/settings/general', requireAdminAuth, (req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM app_settings').all();
  const result = {};
  rows.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

app.put('/admin/api/settings/general', requireAdminAuth, (req, res) => {
  const { currency } = req.body;
  if (!currency?.trim()) return res.status(400).json({ error: 'Currency is required' });
  getDb().prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('currency', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(currency.trim());
  invalidateSettingsCache();
  res.json({ ok: true });
});

// ─── Seed db handling ───────────────────────────────────────────────────────────
app.get("/run-seed", (req, res) => {
  if (req.query.key !== "adminkey123") return res.status(401).send("Unauthorized");
  try {
    delete require.cache[require.resolve("./db/seed.js")];
    require("./db/seed.js")();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Salon Bot server running on port ${PORT}`);
  // Initialize DB on startup
  getDb();
});
