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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Salon Bot is running ✅'));

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
      INSERT INTO services (id, name, price, branch, updated_at)
      VALUES (@id, @name, @price, @branch, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        branch = excluded.branch,
        updated_at = excluded.updated_at
    `);
    const insert = db.prepare(`
      INSERT INTO services (name, price, branch, updated_at)
      VALUES (@name, @price, @branch, datetime('now'))
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
          upsert.run({ id: svc.id, name: svc.name, price: svc.price, branch: svc.branch || 'All Branches' });
        } else {
          insert.run({ name: svc.name, price: svc.price, branch: svc.branch || 'All Branches' });
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

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Salon Bot server running on port ${PORT}`);
  // Initialize DB on startup
  getDb();
});
