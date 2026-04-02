# CLAUDE.md — Salon Bot

## Current Task

---

## What Changed and Why (2026-04-02)

### Persistent JSON Cache Layer

Added `src/cache/salonDataCache.js` — a lightweight persistent cache that writes all salon operational data to `data/salon-data.json` so read-heavy voice-call tool handlers and future integrations never hit SQLite for stable reference data.

**What is cached:**

| Key | Content |
| --- | ------- |
| `deals` | All deals rows |
| `services` | All services rows |
| `bookings` | All booking rows |
| `branches` | All branch rows |
| `staff` | Staff rows with `branch_name` join |
| `salonTimings` | `{ workday: {...}, weekend: {...} }` keyed by `day_type` |
| `staffRoles` | All staff_role rows |

**New files / changes:**

| File | What changed |
| ---- | ------------ |
| `src/cache/salonDataCache.js` | New — cache module: `initCache`, `getCache`, `patchCache`, `saveAtomic` |
| `src/index.js` | Imports cache; calls `initCache()` on server start; adds `GET /salon-data.json` endpoint; adds `patchCache()` fire-and-forget after every DB mutation (deals, services, bookings, branches, staff, timings, roles) |
| `src/server/apiCallLive.js` | `handleVoiceTool` reads `get_services`, `get_branches`, `get_timings` from cache with DB fallback; patches cache after `create_booking` |
| `data/salon-data.json` | Auto-created on first server start |

**New API route:**

- `GET /salon-data.json?key=<SALON_DATA_KEY>` — returns the full JSON cache. Protected by `SALON_DATA_KEY` env var (falls back to `adminkey123` dev key with a log warning if unset). Returns `401` for wrong/missing key, `503` if cache not yet warm.

**Design decisions:**

- **Atomic writes** — cache is written to `salon-data.json.tmp` then renamed, preventing partial-write corruption.
- **Write mutex** — all saves are serialised through a promise chain (`_writeQueue`) so concurrent DB mutations never interleave disk writes.
- **Incremental patching** — `patchCache(entity, 'upsert'|'delete'|'replace', payload)` updates only the affected slice; full DB rebuild only runs if the file is missing or corrupt on startup.
- **Fire-and-forget** — cache patches are called with `.catch()` after the DB write succeeds; they never block the HTTP response.
- **DB fallback** — voice tool handlers fall back to a direct DB query if the cache is not yet warm (cold-start race condition safety).

**Configuration:**

Add to `.env`:

```env
SALON_DATA_KEY=your-secure-key
```

---

## What Changed and Why (2026-03-30)

### Emoji Sizing Fix (widget.js + wp-plugin)

**Problem:** Emojis in the greeting and all chat messages appeared ~7× taller than surrounding text. Two root causes:

1. `#salonbot-messages` declared `font-size:14px` without `!important`, allowing WordPress theme CSS to override it and produce a large inherited font-size for child elements.
2. No `<img>` size constraint inside `.sb-msg` — WordPress's `twemoji` script replaces Unicode emoji with `<img class="emoji">` tags; without a scoped override those images could render at a theme-controlled `1em` that is far larger than 14px.

**Fix in `public/widget.js`:**

- Added `!important` to `font-size:14px` on `#salonbot-messages`
- Added new CSS rule: `.sb-msg img{height:1.2em!important;width:auto!important;vertical-align:middle!important;display:inline-block!important}` — constrains any `<img>` inside a message bubble (including twemoji replacements) to 1.2 × 14px ≈ 17px, inline with the text.

**Fix in `wp-plugin/salon-bot-widget.php`:**

- Added scoped override inside the existing `<style>` block: `#salonbot-wrap img, #salonbot-wrap img.emoji { height:1em!important; width:auto!important; max-height:1.2em!important; vertical-align:middle!important; display:inline-block!important; }`
- Selector specificity (1,1,1) beats WordPress's global `img.emoji` rule (0,1,1), ensuring `1em` is always evaluated against the widget's 14px context, not the theme's font-size.

---

## What Changed and Why (2026-03-28)

### Real-Time Time Availability Validation

Added `validateTimeInput()` in `public/admin/panel.js`. It fires on every `change` event of both `#bm-time` and `#bm-date`, checks the entered time against `allTimings[dayType]` (loaded from `/admin/api/settings/timings` at init), and writes a human-readable error into `#bm-time-error` immediately — before form submission. `saveBooking()` calls `validateTimeInput()` as a gate and blocks submission if it returns `false`. This prevents API round-trips for invalid times and gives instant feedback.

### Channel-Safe Time Error Messages (Chatbot)

The ASK_TIME step in `src/replies/booking.js` now reads `session.platform` and returns channel-appropriate error text when the requested time is outside salon hours:

- **WhatsApp** — bold markdown (`*…*`), emoji-decorated (existing style preserved)
- **Instagram / Facebook** — plain text, no markdown syntax (Meta Messenger does not render WhatsApp-style bold)
- **Web Widget (webchat)** — concise inline message: `"Selected time is not available. Please choose a slot between X and Y."`

### Branch-Restricted Staff Selection

Staff in the admin booking modal are now filtered to the selected branch the moment a branch is chosen. `populateStaffSelect(selectedId, branchName)` gained a second parameter; when `branchName` is provided it filters `allStaff` to staff whose `branch_id` matches that branch (or is `null` for unassigned staff). A `change` event on `#bm-branch` triggers re-population automatically.

Server-side: `checkStaffBranch(staff_id, branch, db)` in `src/index.js` validates the staff–branch relationship on every POST and PUT to `/admin/api/bookings`. If the staff member belongs to a different branch, the API returns `{ ok: false, error: "Selected staff does not belong to this branch." }`.

---

## New Patterns and Conventions

- **Real-time input validation** — booking modal fields (`#bm-time`, `#bm-date`, `#bm-branch`) have `change` listeners wired in a `DOMContentLoaded` block near the bottom of `panel.js`. Inline errors appear in dedicated `<div id="…-error" class="field-error">` elements below the input, styled via `.field-error` in `panel.css`.
- **Channel-aware reply formatting** — chatbot error messages that involve availability must branch on `session.platform`. WhatsApp uses `*bold*`/emoji markdown; Instagram/Facebook use plain text; webchat uses concise slot language.
- **Staff–branch relational enforcement** — `populateStaffSelect(selectedId, branchName)` on the frontend; `checkStaffBranch(staff_id, branch, db)` on the backend. Both layers must agree: frontend filters the dropdown, backend rejects cross-branch assignments even if the UI is bypassed (API automation, social integrations).
- **`allTimings` state variable** — loaded at admin panel init alongside branches, roles, staff, and currency. Keyed by day type: `allTimings.workday`, `allTimings.weekend`. Each has `open_time` and `close_time` in `HH:MM` format.

---

## Current Focus / Next Steps

- All booking validation (required fields, past dates, salon hours, staff–branch) is now enforced consistently on both frontend and backend for admin panel bookings
- Channel-safe time error messages are live across WhatsApp, Instagram, Facebook, and web widget booking flows
- Next: consider surfacing available time slots to the user proactively (show a list of open slots instead of asking for free input) to reduce back-and-forth on invalid times

---

## Architecture

Node.js + Express chatbot server that handles WhatsApp, Instagram, and Facebook Messenger via a single Meta webhook. A unified intent router (powered by Claude Haiku) classifies incoming messages and dispatches to reply generators that read from a local SQLite database. A vanilla-JS admin panel at `/admin` lets the salon owner manage bookings, services, deals, branches, staff, roles, timings, and currency.

**Request flow:**

```text
Meta Webhook → POST /webhook → platform handler → routeMessage()
  → detectIntent() [Claude Haiku API]
  → reply function (prices / deals / branches / booking)
  → metaSender → Meta Graph API
```

Web widget (`/api/chat`) follows the same `routeMessage()` path, bypassing the webhook handlers.

**Booking flow (chatbot):**
7-step state machine in `src/replies/booking.js`:

```text
ASK_NAME → ASK_PHONE → ASK_SERVICE → ASK_BRANCH → ASK_STAFF (optional) → ASK_DATE → ASK_TIME
```

- Past dates are rejected at `ASK_DATE`
- Time is validated against `salon_timings` (workday/weekend hours) at `ASK_TIME`

---

## Folder Structure

```text
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
    seed.js         ← Dev seed data (deals + services + conditional staff)
  handlers/
    whatsapp.js     ← WhatsApp webhook payload parser
    instagram.js    ← Instagram webhook payload parser
    facebook.js     ← Facebook webhook payload parser
  replies/
    prices.js       ← Service/price reply generator
    deals.js        ← Deals reply generator
    branches.js     ← Branch info reply generator
    booking.js      ← 7-step booking state machine
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
CLAUDE.md           ← This file
```

---

## Key Files

| File | Purpose |
| ------ | --------- |
| `src/index.js` | All routes — webhook, admin CRUD, auth, stats; contains `validateBookingBody()` and `checkBookingTiming()` helpers |
| `src/db/database.js` | Schema definition + `getDb()` singleton; seeds timings, roles, currency on first boot |
| `src/core/router.js` | Intent → reply function mapping |
| `src/core/intent.js` | Claude Haiku API call for intent classification |
| `src/replies/booking.js` | 7-step booking state machine; `isValidDate()` rejects past dates; `getSalonTiming()` enforces business hours |
| `public/admin/panel.js` | All admin UI logic — tabs, modals, API fetch; `setPhonePlaceholder()` for country-aware phone hints |
| `src/admin/views/panel.html` | Admin panel HTML shell |
| `src/db/seed.js` | Seeds deals + services; conditionally seeds currency and staff |
| `.env` | All secrets and config (never commit) |

---

## Conventions

- **No framework magic** — plain Express, plain SQLite (`better-sqlite3`), vanilla JS in admin
- **Synchronous DB** — `better-sqlite3` is sync; all DB calls are blocking by design
- **Parameterized queries always** — never string-concatenate SQL
- **Transactions for multi-row writes** — use `db.transaction()` for upsert+delete patterns
- **Admin API mutations return** `{ ok: true }` on success or `{ ok: false, error: string }` on failure; POST bookings returns the inserted row on success (consumed by admin JS)
- **Reply functions return plain strings** — formatted with `*bold*` and emoji for WhatsApp markdown
- **Logger over console** — use `logger.info()`, `logger.error()` not `console.log`
- **XSS protection in admin JS** — always use `esc()` before inserting user data into innerHTML
- **State variables prefixed `all`** — e.g. `allBranches`, `allStaff`, `allRoles`
- **Booking field trimming** — all required string fields are `.trim()`-ed before DB insert/update

---

## Booking Validation Rules

### Required fields (must be non-empty for both chatbot and admin panel)

| Field | Admin form ID | DB column |
| ------- | -------------- | --------- |
| Client Name | `#bm-name` | `customer_name` |
| Phone | `#bm-phone` | `phone` |
| Service | `#bm-service` | `service` |
| Branch | `#bm-branch` | `branch` |
| Status | `#bm-status` | `status` |
| Date | `#bm-date` | `date` |
| Time | `#bm-time` | `time` |

### Optional fields

| Field | Admin form ID | DB column |
| ------- | -------------- | --------- |
| Preferred Staff | `#bm-staff` | `staff_id` / `staff_name` |
| Notes | `#bm-notes` | `notes` |

### Where validation lives

**Client-side (`public/admin/panel.js` → `saveBooking()`):**

- Checks all 7 required fields; shows toast listing missing fields
- Rejects dates before today (ISO string comparison)
- Checks server response for `r.ok === false` and shows `r.error` in toast

**Server-side (`src/index.js` → `validateBookingBody()`):**

- Validates all 7 required fields
- Rejects `date` values lexicographically before today's ISO date (`YYYY-MM-DD`)
- Applied to both `POST /admin/api/bookings` and `PUT /admin/api/bookings/:id`

**Salon-hours check (`src/index.js` → `checkBookingTiming()`):**

- Determines `workday` or `weekend` from the booking date's day-of-week
- Looks up `salon_timings` row for that day type
- Rejects if requested `HH:MM` time falls outside the configured open–close window
- Returns `null` (skip check) if no timing row is configured
- Applied to both POST and PUT booking routes

**Past-date rejection in chatbot (`src/replies/booking.js` → `isValidDate()`):**

- `"today"` and `"tomorrow"` are always accepted
- For all other inputs: validates format first (regex), then parses to a `Date` object
- Rejects if the parsed date is before today (midnight-normalised comparison)
- Uses the same `new Date(text + ' ' + year)` fallback as `isWeekendDate()` for "30 March" style input

**Admin date picker constraint:**

- `document.getElementById('bm-date').min` is set to today's ISO date in both `openBookingModal()` and `editBooking()`, preventing the browser date picker from selecting past dates

---

## Phone Placeholder Behavior

`setPhonePlaceholder(branchName?)` in `public/admin/panel.js` — called on modal open and edit.

**Detection order:**

1. If `branchName` is provided, find that branch in `allBranches` and scan `branch.address` (lowercase) for geographic keywords (e.g. "lahore" → `PK`, "dubai" → `AE`)
2. Fallback: read `navigator.language` and map to country code via `LOCALE_MAP`
3. Set `#bm-phone` placeholder to `"{prefix} 300 1234567"` (e.g. `+92 300 1234567`)

**Supported countries:**

| Code | Prefix | Keywords / Locales |
| ------ | -------- | -------------------- |
| PK | +92 | pakistan, lahore, karachi, islamabad, rawalpindi, faisalabad; ur, en-PK |
| IN | +91 | india, delhi, mumbai, bangalore, chennai, hyderabad; hi, en-IN |
| AE | +971 | dubai, uae, abu dhabi, sharjah, ajman, united arab; ar-AE, en-AE |
| SA | +966 | saudi, riyadh, jeddah, ksa; ar-SA |
| GB | +44 | uk, united kingdom, london, manchester; en-GB |
| US | +1 | usa, united states, new york, los angeles; en-US |

---

## Seed.js Behavior (`src/db/seed.js`)

Triggered via `GET /run-seed?key=adminkey123`.

| What | Behaviour |
| ------ | ----------- |
| Deals (4 records) | **Destructive** — `DELETE FROM deals` then re-inserts |
| Services (20+ records) | **Destructive** — `DELETE FROM services` then re-inserts |
| Currency | **Conditional** — inserts `Rs.` into `app_settings` only if the key does not already exist |
| Branches | **Not seeded** — branches start empty; create them via admin Settings → Branches panel |
| Staff (3 records) | **Conditional** — inserts sample staff (2 stylists + 1 receptionist) to `branches[0]` only if branches exist AND the staff table is currently empty |

---

## Integration Points

| Service | How |
| --------- | ----- |
| **Meta Graph API** | `src/utils/metaSender.js` — sends messages via `https://graph.facebook.com/v19.0/` using per-platform access tokens from `.env` |
| **Claude Haiku API** | `src/core/intent.js` — `@anthropic-ai/sdk`, classifies user messages into: `PRICE`, `SERVICE_LIST`, `SERVICE_DETAIL`, `DEALS`, `BRANCH`, `BOOKING`, `UNKNOWN` |
| **WordPress** | `wp-plugin/salon-bot-widget.php` — injects `widget.js` script tag; communicates via `/api/chat` |
| **SQLite (local)** | `salon.db` in project root — tables: `deals`, `services`, `bookings`, `branches`, `staff`, `salon_timings`, `staff_roles`, `app_settings` |

---

## Database Tables

| Table | Purpose |
| ------- | --------- |
| `services` | Services with name, price, description, branch |
| `deals` | Promotional deals (active/inactive) |
| `bookings` | Appointment records; `staff_id` FK and `staff_name` denorm column |
| `branches` | Salon locations (number, name, address, map_link, phone) |
| `staff` | Staff members with role + branch_id FK |
| `salon_timings` | Workday/weekend open+close times (used for booking time validation) |
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
