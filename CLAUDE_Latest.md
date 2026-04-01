# CLAUDE_Latest.md — Salon Bot: Current Project State

> **Updated:** 2026-04-01
> **Stack:** Node.js 18+, Express 4, better-sqlite3, ws, @anthropic-ai/sdk (Haiku intent), @google/genai (Gemini 2.5 Flash Native Audio, voice call)

---

## Architecture Overview

```text
Browser / WhatsApp / Instagram / Facebook
         │
         ▼
   src/index.js  (Express + HTTP server)
         │
   ┌─────┴──────┐
   │            │
/api/chat    /webhook
(web widget)  (Meta platforms)
   │            │
   └─────┬──────┘
         ▼
   src/core/router.js
         │
   ┌─────┴──────────────────┐
   │         │              │
intent.js  session.js   replies/
(Haiku AI) (in-memory)  (booking, prices, deals, branches)
                             │
                        src/db/database.js
                        (better-sqlite3)

/api/call  ──WebSocket──▶  src/server/apiCallLive.js
(voice)                    (Gemini 2.5 Flash Live Audio, server-side proxy)
                                │
                           src/data/salonCache.js
                           (JSON file + memory cache)
```

---

## Voice Call Architecture (current)

```text
Widget 📞 button (user gesture)
  → WebSocket to wss://server/api/call
  → src/server/apiCallLive.js opens Gemini Live session
      • Embeds full salon data from salonCache into systemInstruction
      • Only tool exposed: create_booking
  ↕ mic audio PCM16 @ 16kHz (AudioWorklet capture)
  ↕ AI audio PCM16 @ 24kHz (playback queue)
  → create_booking tool call → SQLite → confirmation spoken
```

**Key design decision:** All read-only data (services, deals, branches, timings, staff) is embedded in the Gemini `systemInstruction` at session start — no tool calls for lookups. Only `create_booking` remains as a tool. This eliminates 15–20 second latency that occurred when Gemini made sequential tool calls at conversation start.

---

## File-by-File Status

### `src/server/apiCallLive.js` ✅

Server-side WebSocket proxy to Gemini Live Audio. One WebSocket connection per browser call. On each connection:

- Calls `buildSalonContext()` to get current salon data
- Embeds it into `systemInstruction`
- Opens a Gemini Live session
- Streams PCM16 mic audio from browser → Gemini
- Streams PCM16 response audio from Gemini → browser
- Handles `create_booking` tool call (writes to SQLite)
- Validates WebSocket origin via `WIDGET_ALLOWED_ORIGINS` env var

**Fixed bugs (from previous version):**

- ESM `import/export` → converted to CommonJS `require/module.exports`
- Parallel callers used shared `__CALL_USER__` session ID → now unique per connection
- WebSocket origin not validated → now validated

### `src/data/salonCache.js` ✅ (new)

JSON-file-backed in-memory cache for all salon data served to the voice agent.

**File:** `src/data/salon-cache.json` (auto-generated, do not commit)

**Lifecycle:**

- `initCache()` — called at server startup; queries all 5 tables, writes full JSON, loads into memory
- `updateServices()` — patches only the `services` key in JSON + memory
- `updateDeals()` — patches only `deals`
- `updateBranches()` — patches only `branches`
- `updateStaff()` — patches only `staff`
- `updateTimings()` — patches only `timings`
- `buildSalonContext()` — reads from memory mirror, returns formatted plain-text block for Gemini system instruction

**Trigger points in `src/index.js`:**

| Admin route | Cache update called |
| --- | --- |
| `POST /admin/deals` | `updateDeals()` |
| `POST /admin/services` | `updateServices()` |
| `POST /admin/api/settings/branches` | `updateBranches()` |
| `PUT /admin/api/settings/branches/:id` | `updateBranches()` |
| `DELETE /admin/api/settings/branches/:id` | `updateBranches()` |
| `POST /admin/api/settings/staff` | `updateStaff()` |
| `PUT /admin/api/settings/staff/:id` | `updateStaff()` |
| `DELETE /admin/api/settings/staff/:id` | `updateStaff()` |
| `PUT /admin/api/settings/timings` | `updateTimings()` |

### `public/widget.js` ✅

Embeddable vanilla-JS chat + voice call widget. Serves both standalone and WordPress (via `wp-plugin/`).

**Voice call pipeline (fixed):**

- AudioWorklet (`PcmCapture`) captures mic at native rate, downsamples to 16kHz, sends PCM16 over WebSocket
- `worklet.connect(ctx.destination)` — **required** to keep Web Audio graph alive (was commented out, causing Gemini to receive no audio)
- Playback queue (`processPlaybackQueue`) plays Gemini audio chunks sequentially
- Single `playbackCtx` AudioContext reused for full call (no per-chunk context leak)
- `teardownCall()` correctly stops mic tracks, closes both AudioContexts, closes WebSocket

**Tone feedback:**

- Dial tone (425 Hz repeating) while connecting
- Connected jingle (600 → 900 Hz) on WebSocket open
- Ended tone (800 → 500 Hz) on WebSocket close

### `src/core/session.js`

In-memory booking session store (TTL 10 min).

**Fixed bug:** `setSession()` was using bracket notation (`sessions[userId] = ...`) on a `Map`, making sessions invisible to `getSession()` which used `.get()`. Now correctly uses `sessions.set()`.

### `src/replies/booking.js`

7-step booking state machine: `ASK_NAME → ASK_PHONE → ASK_SERVICE → ASK_BRANCH → ASK_STAFF → ASK_DATE → ASK_TIME`

**Fixed bug:** `getActiveStaff()` had `ORDER BY s.name AND s.role NOT IN (...)` — `AND` is boolean, not SQL syntax. Fixed to proper `WHERE` clause filter.

**Channel-aware error messages at `ASK_TIME`:** WhatsApp gets `*bold*`/emoji, Instagram/Facebook get plain text, webchat gets concise slot message.

### `src/index.js`

All Express routes. ~580 lines. Imports `initCache` and 5 section-specific updaters from `salonCache`.

**Booking validation helpers:**

- `validateBookingBody()` — checks 7 required fields, rejects past dates
- `checkBookingTiming()` — validates time against `salon_timings`
- `checkStaffBranch()` — validates staff belongs to selected branch

### `wp-plugin/salon-bot-widget.php`

WordPress plugin that embeds `widget.js`.

**Fixed bug:** Script tag had `defer` attribute — `document.currentScript` is `null` for deferred scripts, crashing the widget. Removed `defer`.

### `src/db/database.js`

SQLite schema, WAL mode, `getDb()` singleton. Stable, no changes needed.

### `src/core/router.js`

Intent → reply dispatcher. Handles CANCEL at any step, checks session expiry (5 min hardcoded, slightly inconsistent with session.js 10 min TTL — low priority).

### `src/core/intent.js`

Claude Haiku intent classification. Called for every message including mid-booking steps — wasteful but functional.

---

## Known Remaining Issues (low priority)

| # | File | Issue |
| --- | --- | --- |
| 1 | `src/core/router.js` | `isSessionExpired(session, 5)` uses 5 min, session TTL is 10 min |
| 2 | `src/core/intent.js` | Haiku called for every message including mid-booking (name, phone) — wastes tokens |
| 3 | `src/index.js` | Monolithic — all routes in one file (~580 lines) |
| 4 | `src/index.js` | `/run-seed?key=adminkey123` — hardcoded insecure key |
| 5 | `wp-plugin/widget.php` | Minor XSS risk in admin `<pre>` embed preview block |

---

## Environment Variables Required

```env
GEMINI_API_KEY          # Gemini Live Audio API key
ANTHROPIC_API_KEY       # Claude Haiku for intent classification
ADMIN_PASSWORD          # Admin panel login
ADMIN_SESSION_SECRET    # Admin cookie value
META_VERIFY_TOKEN       # Meta webhook verification
WA_ACCESS_TOKEN         # WhatsApp access token
IG_ACCESS_TOKEN         # Instagram access token
FB_ACCESS_TOKEN         # Facebook access token
PORT                    # Server port (default 3000)
WIDGET_ALLOWED_ORIGINS  # Comma-separated origins for WebSocket (default *)
```

---

## Database Tables

| Table | Purpose |
| --- | --- |
| `services` | Name, price, description, branch |
| `deals` | Title, description, active flag |
| `bookings` | Appointments — customer_name, phone, service, branch, date, time, status, source, staff_id, staff_name |
| `branches` | Name, address, map_link, phone, number |
| `staff` | Name, phone, role, branch_id, status |
| `salon_timings` | day_type (workday/weekend), open_time, close_time |
| `staff_roles` | Configurable role names |
| `app_settings` | Key-value — currently holds `currency` |

---

## Folder Structure

```text
src/
  index.js              ← All Express routes + server start
  admin/auth.js         ← Cookie-based admin auth
  admin/views/panel.html← Admin single-page UI
  core/
    router.js           ← Intent → reply dispatcher
    intent.js           ← Claude Haiku intent classification
    session.js          ← In-memory session store (TTL 10 min)
  data/
    salonCache.js       ← JSON cache module (init + per-section updaters)
    salon-cache.json    ← Auto-generated JSON file (do not commit)
  db/
    database.js         ← SQLite schema + getDb() singleton
    seed.js             ← Dev seed (deals, services, staff)
  handlers/
    whatsapp.js / instagram.js / facebook.js
  replies/
    booking.js          ← 7-step booking state machine
    prices.js / deals.js / branches.js
  server/
    apiCallLive.js      ← Gemini Live Audio WebSocket proxy
  utils/
    logger.js / metaSender.js
public/
  widget.js             ← Embeddable chat + voice widget
  admin/panel.js / panel.css
wp-plugin/
  salon-bot-widget.php  ← WordPress plugin
```
