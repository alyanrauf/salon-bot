require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const { getDb } = require('./db/database');

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

app.post('/admin/api/bookings', requireAdminAuth, (req, res) => {
  const db = getDb();
  const { customer_name, phone, service, branch, date, time, notes, status } = req.body;
  if (!customer_name) return res.status(400).json({ error: 'customer_name required' });
  const r = db.prepare(`
    INSERT INTO bookings (customer_name, phone, service, branch, date, time, notes, status, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `).run(customer_name, phone || null, service || null, branch || null, date || null, time || null, notes || null, status || 'pending');
  res.json(db.prepare('SELECT * FROM bookings WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/admin/api/bookings/:id', requireAdminAuth, (req, res) => {
  const db = getDb();
  const { customer_name, phone, service, branch, date, time, notes, status } = req.body;
  db.prepare(`
    UPDATE bookings SET customer_name=?, phone=?, service=?, branch=?, date=?, time=?, notes=?, status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(customer_name, phone || null, service || null, branch || null, date || null, time || null, notes || null, status || 'pending', req.params.id);
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

// ── Calendly Webhooks ────────────────────────────────────────────────────────────────

app.post('/webhooks/calendly', (req, res) => {
  const event = req.body;
  const type = event?.event;

  if (!type) return res.sendStatus(200); // ignore malformed pings

  const db = getDb();

  // ── New booking ────────────────────────────────────────────────────────────
  if (type === 'invitee.created') {
    try {
      const inv = event.payload.invitee;
      const slot = event.payload.event;

      // Determine branch from event_type UUID stored in .env
      let branch = 'Branch 1'; // default fallback
      if (slot.event_type) {
        const uuid = slot.event_type.split('/').pop(); // extract UUID from URI
        if (uuid === process.env.CALENDLY_BRANCH2_UUID) branch = 'Branch 2';
        if (uuid === process.env.CALENDLY_BRANCH1_UUID) branch = 'Branch 1';
      }

      // Parse date and time from ISO string e.g. "2025-04-10T14:30:00.000000Z"
      const startRaw = slot.start_time || '';
      const date = startRaw.slice(0, 10);        // "2025-04-10"
      const time = startRaw.slice(11, 16);       // "14:30"

      // Calendly URI used as unique key to prevent duplicate inserts
      const calendlyUri = inv.uri || null;

      // Skip if already inserted (Calendly can fire duplicate webhooks)
      if (calendlyUri) {
        const exists = db
          .prepare('SELECT id FROM bookings WHERE calendly_uri = ?')
          .get(calendlyUri);
        if (exists) return res.sendStatus(200);
      }

      db.prepare(`
        INSERT INTO bookings
          (customer_name, phone, service, branch, date, time, status, source, notes, calendly_uri)
        VALUES
          (@customer_name, @phone, @service, @branch, @date, @time, @status, @source, @notes, @calendly_uri)
      `).run({
        customer_name: inv.name || 'Unknown',
        phone: inv.text_reminder_number || null,
        service: slot.name || null,
        branch,
        date,
        time,
        status: 'confirmed',
        source: 'calendly',
        notes: inv.questions_and_answers
          ? inv.questions_and_answers.map(q => `${q.question}: ${q.answer}`).join(' | ')
          : null,
        calendly_uri: calendlyUri,
      });

      logger.info(`[Calendly] New booking: ${inv.name} on ${date} at ${time} — ${branch}`);
    } catch (err) {
      logger.error('[Calendly] invitee.created error:', err.message);
    }
  }

  // ── Cancellation ───────────────────────────────────────────────────────────
  if (type === 'invitee.canceled') {
    try {
      const inv = event.payload.invitee;
      const calendlyUri = inv.uri || null;

      if (calendlyUri) {
        // Best case: match by Calendly URI (exact)
        db.prepare(`
          UPDATE bookings
          SET status = 'cancelled', updated_at = datetime('now')
          WHERE calendly_uri = ?
        `).run(calendlyUri);
      } else {
        // Fallback: match by name + date
        const slot = event.payload.event;
        const date = (slot.start_time || '').slice(0, 10);
        db.prepare(`
          UPDATE bookings
          SET status = 'cancelled', updated_at = datetime('now')
          WHERE customer_name = ? AND date = ?
        `).run(inv.name || '', date);
      }

      logger.info(`[Calendly] Cancelled booking for: ${inv.name}`);
    } catch (err) {
      logger.error('[Calendly] invitee.canceled error:', err.message);
    }
  }

  res.sendStatus(200);
});

// ─── Seed db handling ───────────────────────────────────────────────────────────
app.get("/run-seed", async (req, res) => {
  try {
    await require("./db/seed.js")();
    res.send("Seed completed!");
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
