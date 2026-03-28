# CLAUDE.md — Salon Bot

## Current Task
<!-- Fill this in yourself before each session -->


---

## Architecture

Node.js + Express chatbot server that handles WhatsApp, Instagram, and Facebook Messenger via a single Meta webhook. A unified intent router (powered by Claude Haiku) classifies incoming messages and dispatches to reply generators that read from a local SQLite database. A vanilla-JS admin panel at `/admin` lets the salon owner manage bookings, services, deals, branches, staff, roles, timings, and currency.

**Request flow:**
```
Meta Webhook → POST /webhook → platform handler → routeMessage()
  → detectIntent() [Claude Haiku API]
  → reply function (prices / deals / branches / booking)
  → metaSender → Meta Graph API
```

Web widget (`/api/chat`) follows the same `routeMessage()` path, bypassing the webhook handlers.

---

## Folder Structure

```
src/
  index.js          ← All Express routes (webhook, admin API, auth)
  admin/
    auth.js         ← Cookie-based admin auth middleware
    views/panel.html← Admin UI (single-page, vanilla JS)
  core/
    router.js       ← Intent → reply dispatcher
    intent.js       ← Claude Haiku intent classification
    session.js      ← In-memory session store (TTL 10min)
  db/
    database.js     ← SQLite schema init + singleton getDb()
    seed.js         ← Dev seed data (deals + services)
  handlers/
    whatsapp.js     ← WhatsApp webhook payload parser
    instagram.js    ← Instagram webhook payload parser
    facebook.js     ← Facebook webhook payload parser
  replies/
    prices.js       ← Service/price reply generator
    deals.js        ← Deals reply generator
    branches.js     ← Branch info reply generator
    booking.js      ← Multi-step booking state machine
  utils/
    logger.js       ← Timestamped console wrapper
    metaSender.js   ← Meta Graph API message sender
public/
  admin/
    panel.css       ← Admin panel styles
    panel.js        ← Admin panel JS (all tabs, modals, API calls)
  widget.js         ← Embeddable web chat widget
wp-plugin/
  salon-bot-widget.php ← WordPress plugin to embed the widget
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/index.js` | All routes — webhook, admin CRUD, auth, stats |
| `src/db/database.js` | Schema definition + `getDb()` singleton |
| `src/core/router.js` | Intent → reply function mapping |
| `src/core/intent.js` | Claude Haiku API call for intent classification |
| `src/replies/booking.js` | 2-step booking state machine |
| `public/admin/panel.js` | All admin UI logic — tabs, modals, API fetch |
| `src/admin/views/panel.html` | Admin panel HTML shell |
| `.env` | All secrets and config (never commit) |

---

## Conventions

- **No framework magic** — plain Express, plain SQLite (`better-sqlite3`), vanilla JS in admin
- **Synchronous DB** — `better-sqlite3` is sync; all DB calls are blocking by design
- **Parameterized queries always** — never string-concatenate SQL
- **Transactions for multi-row writes** — use `db.transaction()` for upsert+delete patterns
- **Admin API returns `{ ok: true }` or `{ ok: false, error: string }`** on mutations
- **Reply functions return plain strings** — formatted with `*bold*` and emoji for WhatsApp markdown
- **Logger over console** — use `logger.info()`, `logger.error()` not `console.log`
- **XSS protection in admin JS** — always use `esc()` before inserting user data into innerHTML
- **State variables prefixed `all`** — e.g. `allBranches`, `allStaff`, `allRoles`

---

## Integration Points

| Service | How |
|---------|-----|
| **Meta Graph API** | `src/utils/metaSender.js` — sends messages via `https://graph.facebook.com/v19.0/` using per-platform access tokens from `.env` |
| **Claude Haiku API** | `src/core/intent.js` — `@anthropic-ai/sdk`, classifies user messages into: `PRICE`, `SERVICE_LIST`, `SERVICE_DETAIL`, `DEALS`, `BRANCH`, `BOOKING`, `UNKNOWN` |
| **Calendly** | Env vars `CALENDLY_BRANCH1`, `CALENDLY_BRANCH2` — booking reply sends these links directly, no API call |
| **WordPress** | `wp-plugin/salon-bot-widget.php` — injects `widget.js` script tag; communicates via `/api/chat` |
| **SQLite (local)** | `salon.db` in project root — tables: `deals`, `services`, `bookings`, `branches`, `staff`, `salon_timings`, `staff_roles`, `app_settings` |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `services` | Services with name, price, description, branch |
| `deals` | Promotional deals (active/inactive) |
| `bookings` | Appointment records |
| `branches` | Salon locations |
| `staff` | Staff members with role + branch_id FK |
| `salon_timings` | Workday/weekend open+close times |
| `staff_roles` | Configurable staff roles (add/delete via admin) |
| `app_settings` | Key-value store — currently holds `currency` prefix |

---

## Off Limits

- `node_modules/` — never touch
- `salon.db`, `salon.db-shm`, `salon.db-wal` — never edit manually; use migrations or seed
- `wp-plugin/salon-bot-widget.php` — standalone WordPress plugin, minimal changes only
- `.env` — never commit, never log values

---

## Self-Update Rule

After making any significant code change, update this file to reflect:
- What changed and why
- Any new tables, routes, or JS functions introduced
- Any new conventions or patterns
- Updates to **Current Task** if focus has shifted
