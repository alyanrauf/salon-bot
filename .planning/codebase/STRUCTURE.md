# Codebase Structure

**Analysis Date:** 2026-03-12

## Directory Layout

```
salon-bot/
├── src/                          # Main application code
│   ├── index.js                  # Express server, all routes (webhook + admin)
│   ├── core/                     # Intent, routing, session management
│   │   ├── intent.js             # Claude Haiku intent classification
│   │   ├── router.js             # Route message to reply function
│   │   └── session.js            # In-memory session store with TTL
│   ├── handlers/                 # Platform-specific webhook parsers
│   │   ├── whatsapp.js           # WhatsApp message handler
│   │   ├── instagram.js          # Instagram DM handler
│   │   └── facebook.js           # Facebook Messenger handler
│   ├── replies/                  # Response generators per intent
│   │   ├── prices.js             # Service list from database
│   │   ├── deals.js              # Active deals from database
│   │   ├── branches.js           # Branch info from env vars
│   │   └── booking.js            # Multi-step booking state machine
│   ├── db/                       # Database layer
│   │   ├── database.js           # SQLite singleton, schema init
│   │   └── seed.js               # Populate demo data (not in codebase)
│   ├── admin/                    # Admin panel authentication and UI
│   │   ├── auth.js               # Cookie-based session middleware
│   │   └── views/
│   │       └── panel.html        # Admin UI (HTML + vanilla JS)
│   └── utils/                    # Cross-cutting utilities
│       ├── logger.js             # Timestamped console wrapper
│       └── metaSender.js         # Unified Meta Graph API sender
├── package.json                  # Dependencies, scripts, Node version requirement
├── package-lock.json             # Locked dependency versions
├── .nvmrc                        # Node version (18)
├── .env.example                  # Required environment variables (template)
├── salon.db                      # SQLite database file (created at runtime)
└── .planning/                    # GSD planning documents
    └── codebase/                 # This directory
        ├── ARCHITECTURE.md
        ├── STRUCTURE.md
        ├── CONVENTIONS.md
        ├── TESTING.md
        ├── STACK.md
        ├── INTEGRATIONS.md
        └── CONCERNS.md
```

## Directory Purposes

**src/:**
- Purpose: All application code
- Contains: Server entry point, business logic, handlers, database operations
- Key files: `src/index.js` (main), `src/core/router.js` (message routing), `src/db/database.js` (data layer)

**src/core/:**
- Purpose: Core messaging logic (intent detection, routing, state management)
- Contains: Intent classifier, message router, session store
- Key files: `src/core/intent.js` (Claude API), `src/core/router.js` (dispatcher), `src/core/session.js` (booking state)

**src/handlers/:**
- Purpose: Parse platform-specific webhook formats and extract messages
- Contains: Three handlers (WhatsApp, Instagram, Facebook) with identical interface
- Key files: All three platform files follow same pattern (parse → route → send)

**src/replies/:**
- Purpose: Generate formatted chatbot responses based on intent
- Contains: Four reply generators (prices, deals, branches, booking)
- Key files: `src/replies/prices.js` (database), `src/replies/booking.js` (state machine), `src/replies/branches.js` (env vars)

**src/db/:**
- Purpose: Database initialization, schema, and queries
- Contains: SQLite singleton, schema definition
- Key files: `src/db/database.js` (only file; seed.js is for one-time init)

**src/admin/:**
- Purpose: Admin panel for managing salon configuration
- Contains: Authentication middleware, HTML UI with embedded JavaScript
- Key files: `src/admin/auth.js` (middleware), `src/admin/views/panel.html` (complete UI + JS)

**src/utils/:**
- Purpose: Shared utilities for logging and message delivery
- Contains: Logger wrapper, Meta Graph API client
- Key files: `src/utils/logger.js` (simple), `src/utils/metaSender.js` (platform dispatch)

## Key File Locations

**Entry Points:**
- `src/index.js`: Server startup, all HTTP routes, middleware configuration
- `package.json`: Scripts (start, dev, seed) and dependency declarations

**Configuration:**
- `.env.example`: Template for all required environment variables
- `src/replies/branches.js`: Static branch data pulled from env vars
- `.nvmrc`: Node version requirement (18+)

**Core Logic:**
- `src/core/router.js`: Message dispatcher to reply functions
- `src/core/intent.js`: Claude Haiku API integration for classification
- `src/core/session.js`: In-memory user session tracking with TTL

**Platform Integration:**
- `src/handlers/whatsapp.js`: Parse WhatsApp webhook, call router
- `src/handlers/instagram.js`: Parse Instagram webhook, call router
- `src/handlers/facebook.js`: Parse Facebook webhook, call router
- `src/utils/metaSender.js`: Send replies back via Meta Graph API (all platforms)

**Data Access:**
- `src/db/database.js`: SQLite connection, schema, query execution
- `src/replies/prices.js`: Query services table
- `src/replies/deals.js`: Query deals table (active only)

**Admin Interface:**
- `src/admin/views/panel.html`: Complete UI with embedded vanilla JavaScript, no build step
- `src/admin/auth.js`: Cookie-based session validation middleware

**Testing & Utilities:**
- `src/utils/logger.js`: Timestamp-prefixed console logging
- `src/db/seed.js`: One-time script to populate demo data (call via `npm run seed`)

## Naming Conventions

**Files:**
- `[domain].js` for modules: `router.js`, `intent.js`, `session.js`
- Platform prefixes: `whatsapp.js`, `instagram.js`, `facebook.js`
- Reply handlers: `[intent].js` (prices.js, deals.js, branches.js, booking.js)
- Utility wrappers: descriptive names (logger.js, metaSender.js, database.js)

**Directories:**
- Lowercase plural for collections: `handlers/`, `replies/`, `utils/`
- Feature-grouped: `admin/`, `core/`, `db/`
- No nested feature directories beyond 2 levels deep

**Functions:**
- Camel case: `handleWhatsApp()`, `getDb()`, `detectIntent()`, `routeMessage()`
- Action verbs: `get`, `send`, `handle`, `detect`, `verify`
- Platform-specific variants: `handleWhatsApp()` vs `handleInstagram()` (same pattern)

**Constants:**
- Uppercase: `SESSION_TTL_MS`, `GRAPH_API_VERSION`, `BASE_URL`, `BRANCHES`
- Uppercase for environment keys: `META_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `WA_ACCESS_TOKEN`

## Where to Add New Code

**New Feature (new intent type):**
- Primary code: Create `src/replies/[intent].js` with export function
- Router update: Add case in `src/core/router.js` switch statement
- Intent classifier: Add label to SYSTEM_PROMPT in `src/core/intent.js`
- Test locally: Use console or logs to verify intent detection

**New Platform (e.g., Telegram):**
- Handler: Create `src/handlers/telegram.js` with same export signature (handle + verify functions)
- Sender: Add case in `src/utils/metaSender.js` switch statement
- Server: Add new condition in POST `/webhook` (line 47-53 in index.js)
- Webhook URL: Register endpoint in platform's developer console

**New Admin API Endpoint:**
- Route: Add GET or POST in `src/index.js` after existing admin routes (lines 86-195)
- Auth: Wrap with `requireAdminAuth` middleware
- Database: Use `getDb()` singleton to query/update
- Response: Return JSON with structure matching existing endpoints (ok/error pattern)

**Utilities (logging, validation, etc):**
- Shared helpers: `src/utils/[function].js` as standalone export
- Cross-platform logic: `src/core/[logic].js` if stateful, else `src/utils/` if stateless

**Database Schema Changes:**
- Alter schema: Update `initSchema()` function in `src/db/database.js` (lines 17-37)
- Migrations: Since SQLite with CREATE TABLE IF NOT EXISTS, use ALTER TABLE for existing tables
- Seed data: Update `src/db/seed.js` to populate new columns

## Special Directories

**node_modules/:**
- Purpose: Third-party dependencies installed by npm
- Generated: Yes (created by `npm install`)
- Committed: No (ignored by .gitignore, use package-lock.json for reproduction)

**salon.db:**
- Purpose: SQLite database file with deals and services tables
- Generated: Yes (created by `getDb()` on first server start)
- Committed: No (project data, not source code)

**.env:**
- Purpose: Environment configuration (secrets and settings)
- Generated: Manually, from `.env.example`
- Committed: No (contains API keys and secrets)

**.planning/codebase/:**
- Purpose: GSD planning documents and architecture analysis
- Generated: Yes (created by GSD commands)
- Committed: Yes (for reference and hand-off)

## Import Patterns

**Module imports follow this order:**
1. Node.js built-ins (express, path, etc)
2. Third-party packages (dotenv, better-sqlite3, axios, @anthropic-ai/sdk)
3. Local modules (./handlers, ../db, etc) using relative paths

**Example from `src/index.js`:**
```javascript
require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const { getDb } = require('./db/database');
const { handleWhatsApp, verifyWhatsApp } = require('./handlers/whatsapp');
```

**Re-exports in reply modules:**
```javascript
// Single default export
module.exports = { getPricesReply };
module.exports = { getDealsReply };
```

**Destructured imports from modules:**
```javascript
const { routeMessage } = require('../core/router');
const { send } = require('../utils/metaSender');
const { getSession, setSession, clearSession } = require('../core/session');
```

---

*Structure analysis: 2026-03-12*
