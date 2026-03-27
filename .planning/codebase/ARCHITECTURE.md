# Architecture

**Analysis Date:** 2026-03-12

## Pattern Overview

**Overall:** Webhook-driven chatbot router with modular intent classification and platform-specific handlers

**Key Characteristics:**
- Single unified webhook endpoint dispatches to platform-specific handlers (WhatsApp, Instagram, Facebook)
- Intent-based message routing using Claude Haiku classification
- Stateful booking flow managed via in-memory sessions with TTL
- Synchronous SQLite database for configuration (services, deals)
- Service-oriented reply generation (prices, deals, branches, bookings)

## Layers

**Express HTTP Layer:**
- Purpose: Handle incoming requests and send responses
- Location: `src/index.js`
- Contains: Route handlers for webhook, admin auth, health check
- Depends on: Platform handlers, admin auth, database
- Used by: Meta webhook (all platforms), browser (admin panel)

**Platform Handlers Layer:**
- Purpose: Parse platform-specific webhook payloads and extract message data
- Location: `src/handlers/whatsapp.js`, `src/handlers/instagram.js`, `src/handlers/facebook.js`
- Contains: Platform payload parsing, null-check validation, logger calls
- Depends on: Router (core logic), metaSender (message sending)
- Used by: Express routes at `/webhook`

**Core Logic Layer:**
- Purpose: Determine user intent, manage session state, route to reply generation
- Location: `src/core/router.js`, `src/core/intent.js`, `src/core/session.js`
- Contains: Intent detection via Claude API, stateful conversation tracking, message routing logic
- Depends on: Reply functions (prices, deals, branches, booking), session store
- Used by: All platform handlers

**Reply Generation Layer:**
- Purpose: Construct formatted responses based on intent and database state
- Location: `src/replies/prices.js`, `src/replies/deals.js`, `src/replies/branches.js`, `src/replies/booking.js`
- Contains: Database queries, response formatting with emojis, booking state machine
- Depends on: Database (reads services/deals), session (booking state)
- Used by: Router for response content

**Data Layer:**
- Purpose: Persistent storage for configurable content (services, deals)
- Location: `src/db/database.js`
- Contains: SQLite schema initialization, database singleton instance
- Depends on: better-sqlite3 driver
- Used by: Reply generators and admin panel API

**Admin Panel Layer:**
- Purpose: Manage salon configuration (deals, services, branches)
- Location: `src/index.js` (routes), `src/admin/auth.js` (middleware), `src/admin/views/panel.html` (UI)
- Contains: Authentication, CRUD API endpoints, HTML admin interface with vanilla JS
- Depends on: Database (read/write), Express auth middleware
- Used by: Administrators via browser

**Utilities Layer:**
- Purpose: Cross-cutting concerns (logging, sending messages)
- Location: `src/utils/logger.js`, `src/utils/metaSender.js`
- Contains: Timestamp formatting, message delivery via Meta Graph API
- Depends on: axios (HTTP), environment variables (auth tokens)
- Used by: All layers for communication

## Data Flow

**Message Reception → Processing → Response:**

1. Meta webhook sends JSON to POST `/webhook` with platform identifier (`object` field)
2. Express middleware parses JSON body
3. Router determines platform type and calls appropriate handler (`handleWhatsApp`, `handleInstagram`, or `handleFacebook`)
4. Handler extracts message text and user ID from platform-specific payload structure
5. Handler calls `routeMessage(userId, messageText, platform)` with extracted data
6. Router checks if user has active session (booking state machine); if yes, continues booking flow
7. If no session or non-booking state, calls `detectIntent(messageText)` to classify message via Claude Haiku API
8. Based on intent result, calls appropriate reply function:
   - PRICE → `getPricesReply()` (queries services table, groups by branch)
   - DEALS → `getDealsReply()` (queries deals table, filters active=1)
   - BRANCH → `getBranchesReply()` (static branch data from env vars)
   - BOOKING → `handleBookingStep()` (manages 2-state session: awaiting_branch → confirm)
   - UNKNOWN → FALLBACK_MESSAGE (generic help text)
9. Reply string returned to handler
10. Handler calls `send(platform, recipientId, replyText, options)` to dispatch via Meta Graph API
11. Platform handler immediately acknowledges webhook with 200 status (within 5 second timeout)
12. Message delivery happens asynchronously

**Booking State Machine:**

1. User sends "book" → `handleBookingStep(userId, messageText, null)` initializes session with state=AWAITING_BRANCH, returns branch selection prompt
2. Session stored in-memory Map with 10-minute TTL
3. User's next message triggers `routeMessage()` → checks session → finds session with state=AWAITING_BRANCH
4. `handleBookingStep()` parses branch number (1 or 2) from user text
5. If valid: fetches Calendly link from env var, clears session, returns booking link
6. If invalid: returns re-prompt (session persists)
7. Session auto-expires after 10 minutes inactivity (background pruning every 5 minutes)

**Admin Configuration Update:**

1. Admin opens `/admin` → middleware checks `adminToken` cookie
2. If authenticated, serves `panel.html` with embedded vanilla JS
3. JS fetches `/admin/api/deals` and `/admin/api/services` via GET
4. User edits fields in UI, clicks "Save Deals" or "Save Services"
5. JS POSTs to `/admin/deals` or `/admin/services` with full array
6. Route handler receives array, compares IDs with database to detect deletions
7. Runs transaction: delete old records, upsert modified/new records
8. Returns updated data to UI, UI re-renders with new IDs
9. Next chatbot message uses updated data from database

**State Management:**

- **Session State:** Transient, in-memory Map with automatic TTL expiration (10 min)
- **Configuration State:** Persistent SQLite tables (deals, services) via better-sqlite3
- **Branch State:** Static, environment variables (BRANCH1_NAME, BRANCH2_NAME, CALENDLY_BRANCH1, CALENDLY_BRANCH2)

## Key Abstractions

**Intent:**
- Purpose: Classify user message into one of 5 categories
- Examples: `src/core/intent.js`
- Pattern: Synchronous API call to Claude Haiku with system prompt, returns one-word category

**PlatformHandler:**
- Purpose: Normalize platform-specific webhook payloads
- Examples: `src/handlers/whatsapp.js`, `src/handlers/instagram.js`, `src/handlers/facebook.js`
- Pattern: Extract nested values from payload, validate presence, delegate to router, send reply via unified sender

**ReplyFunction:**
- Purpose: Generate formatted response based on database state and context
- Examples: `src/replies/prices.js`, `src/replies/deals.js`, `src/replies/booking.js`
- Pattern: Query database or lookup env var, format with emojis and markdown, return plain string

**MessageSender:**
- Purpose: Unify message delivery across 3 platforms with one interface
- Examples: `src/utils/metaSender.js`
- Pattern: Switch on platform, call appropriate Graph API endpoint with platform-specific auth token

**SessionStore:**
- Purpose: Manage per-user temporary state for multi-step flows
- Examples: `src/core/session.js`
- Pattern: Map<userId, {data, updatedAt}>, TTL-based expiration with background pruning

## Entry Points

**Webhook Handler (Public API):**
- Location: `src/index.js` POST `/webhook`
- Triggers: Meta sends webhook for WhatsApp, Instagram, or Facebook message event
- Responsibilities: Dispatch to correct platform handler based on object type, acknowledge with 200 immediately

**Admin Login (Public Web):**
- Location: `src/index.js` POST `/admin/login`
- Triggers: User submits password form from login page
- Responsibilities: Validate password, set HttpOnly cookie, redirect to panel

**Admin Panel (Protected Web):**
- Location: `src/index.js` GET `/admin` + `src/admin/views/panel.html`
- Triggers: Authenticated admin user navigates to /admin
- Responsibilities: Render HTML UI, serve API endpoints for data fetch/save

**Health Check (Public HTTP):**
- Location: `src/index.js` GET `/`
- Triggers: Health monitoring, uptime checking
- Responsibilities: Return 200 status with text "Salon Bot is running"

**Server Startup:**
- Location: `src/index.js` listen() call at line 198
- Triggers: Node process starts
- Responsibilities: Initialize database schema, start listening on PORT env var (default 3000)

## Error Handling

**Strategy:** Graceful degradation with fallback messages; async errors logged and suppressed

**Patterns:**
- Platform handlers wrap in try-catch, log error, allow webhook to return 200 anyway
- Intent classification errors return 'UNKNOWN' and fallback message
- Database query errors return user-friendly message ("could not load prices right now")
- Admin API errors return JSON with ok=false and error message
- Missing environment variables use sensible defaults (e.g., branch names default to "Branch 1")

## Cross-Cutting Concerns

**Logging:**
- Framework: Custom logger at `src/utils/logger.js` (wraps console.log/error)
- Pattern: `logger.info()`, `logger.error()`, `logger.warn()` with ISO timestamp prefix
- Used in: All handlers, intent classification, admin operations

**Validation:**
- User message text: Non-null check before routing
- Admin input: Type check (Array.isArray) before save, transaction ensures atomicity
- Webhook payload: Null-coalescing on nested structures (value?.messages?.[0])
- Intent response: Validate against whitelist of valid intents

**Authentication:**
- Webhook: Meta verify token in query params or header
- Admin: Cookie-based session with env-var secret comparison
- API calls: Bearer token in Authorization header for Meta Graph API

**Data Sanitization:**
- HTML escaping in admin panel JS (esc function for XSS prevention)
- User message text passed as-is to Claude (no escaping needed, API safe)
- Database queries use parameterized statements (better-sqlite3 handles escaping)

---

*Architecture analysis: 2026-03-12*
