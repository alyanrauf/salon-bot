# External Integrations

**Analysis Date:** 2026-03-12

## APIs & External Services

**Meta Messaging Platforms (WhatsApp, Instagram, Facebook):**
- WhatsApp Cloud API - Send/receive messages via WhatsApp Business Account
  - SDK/Client: `axios` HTTP client
  - Endpoint: `https://graph.facebook.com/v19.0/{phoneNumberId}/messages`
  - Auth: `WA_ACCESS_TOKEN` (Bearer token in Authorization header)
  - Implementation: `src/utils/metaSender.js` `sendWhatsApp()`
  - Handler: `src/handlers/whatsapp.js`

- Instagram Messaging - Send/receive messages via Instagram Business account
  - SDK/Client: `axios` HTTP client
  - Endpoint: `https://graph.facebook.com/v19.0/me/messages`
  - Auth: `IG_PAGE_ACCESS_TOKEN` (Bearer token in Authorization header)
  - Implementation: `src/utils/metaSender.js` `sendInstagramOrFacebook()`
  - Handler: `src/handlers/instagram.js`

- Facebook Messenger - Send/receive messages via Facebook Page
  - SDK/Client: `axios` HTTP client
  - Endpoint: `https://graph.facebook.com/v19.0/me/messages`
  - Auth: `FB_PAGE_ACCESS_TOKEN` (Bearer token in Authorization header)
  - Implementation: `src/utils/metaSender.js` `sendInstagramOrFacebook()`
  - Handler: `src/handlers/facebook.js`

**Anthropic Claude AI:**
- Claude Haiku Model - Intent classification for incoming messages
  - SDK/Client: `@anthropic-ai/sdk`
  - Model: `claude-haiku-4-5-20251001`
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Purpose: Classify user intents into PRICE, DEALS, BOOKING, BRANCH, or UNKNOWN
  - Implementation: `src/core/intent.js` `detectIntent()`
  - Max tokens: 10 (intent is single word response)

**Calendly:**
- Booking scheduling integration
  - URLs stored in environment: `CALENDLY_BRANCH1`, `CALENDLY_BRANCH2`
  - Purpose: Redirect users to calendar booking links based on selected branch
  - Implementation: `src/replies/booking.js` (builds response with Calendly links)
  - Auth: None (public links)

## Data Storage

**Databases:**
- SQLite (better-sqlite3 driver)
  - Connection: Local file at `salon.db` (project root) or custom path via `DB_PATH` env var
  - Client: `better-sqlite3` synchronous driver
  - WAL mode enabled for concurrent access
  - Tables:
    - `deals` - Promotions/offers (id, title, description, active, created_at, updated_at)
    - `services` - Service pricing (id, name, price, branch, created_at, updated_at)
  - Implementation: `src/db/database.js`
  - Admin panel manages data via POST `/admin/deals` and `/admin/services`

**File Storage:**
- None - uses local SQLite only

**Caching:**
- Session-based caching in-memory
  - Booking session store: `src/core/session.js`
  - TTL: 10 minutes per session
  - Purpose: Maintain booking state during multi-turn conversation

## Authentication & Identity

**Auth Provider:**
- Custom implementation (no external OAuth)

**Admin Panel Authentication:**
- Implementation: `src/admin/auth.js`
- Mechanism: Password-based login with HttpOnly cookie session
- Credentials:
  - `ADMIN_PASSWORD` - Plain text password checked against env var
  - `ADMIN_SESSION_SECRET` - Used as cookie value for authenticated sessions
  - Cookie: `adminToken` (HttpOnly, SameSite=Strict, Max-Age=86400)
- Protected endpoints:
  - GET `/admin` - Serve admin panel HTML
  - GET `/admin/api/deals` - Fetch all deals
  - GET `/admin/api/services` - Fetch all services
  - POST `/admin/deals` - Save/upsert deals
  - POST `/admin/services` - Save/upsert services

**Webhook Verification:**
- All three platforms use same verification mechanism
- Shared token: `META_VERIFY_TOKEN` (common for WhatsApp, Instagram, Facebook)
- Verification flow:
  - GET `/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
  - Return challenge string if token matches
  - Implemented in: `src/handlers/whatsapp.js`, `src/handlers/instagram.js`, `src/handlers/facebook.js`

## Monitoring & Observability

**Error Tracking:**
- None (no external service integration)

**Logs:**
- Console-based logging via custom logger
- Implementation: `src/utils/logger.js`
- Log levels used throughout: `.info()`, `.error()`
- No external log aggregation service

## CI/CD & Deployment

**Hosting:**
- Expected deployment: Railway or similar Node.js PaaS
- GitHub integration (Railway can auto-deploy from GitHub repo)
- Persistent volume needed for SQLite database file

**CI Pipeline:**
- None configured (no CI service configured in dependencies)
- Manual deployment via platform webhooks

## Environment Configuration

**Required env vars:**

Production-critical:
- `PORT` - Server listening port
- `META_VERIFY_TOKEN` - Webhook signature verification
- `WA_ACCESS_TOKEN` - WhatsApp Cloud API authentication
- `WA_PHONE_NUMBER_ID` - WhatsApp business phone number ID
- `IG_PAGE_ACCESS_TOKEN` - Instagram page authentication
- `FB_PAGE_ACCESS_TOKEN` - Facebook page authentication
- `ANTHROPIC_API_KEY` - Claude API authentication
- `ADMIN_PASSWORD` - Admin panel login password
- `ADMIN_SESSION_SECRET` - Session cookie value/secret

Optional/Branch-specific:
- `BRANCH1_NAME`, `BRANCH1_ADDRESS`, `BRANCH1_PHONE`, `BRANCH1_MAP_LINK` - Branch 1 details
- `BRANCH2_NAME`, `BRANCH2_ADDRESS`, `BRANCH2_PHONE`, `BRANCH2_MAP_LINK` - Branch 2 details
- `CALENDLY_BRANCH1`, `CALENDLY_BRANCH2` - Calendar booking links
- `DB_PATH` - Custom SQLite database path (defaults to `./salon.db`)

**Secrets location:**
- `.env` file (NOT committed to git, use `.env.example` as template)
- Environment variables on deployment platform (Railway, Heroku, etc.)

## Webhooks & Callbacks

**Incoming:**
- `POST /webhook` - Single endpoint handles all three platforms
  - WhatsApp: Identified by `body.object === 'whatsapp_business_account'`
  - Instagram: Identified by `body.object === 'instagram'`
  - Facebook: Identified by `body.object === 'page'`
  - Verification: `GET /webhook` with `hub.verify_token` and `hub.challenge`
  - Implementation: `src/index.js` routes to platform-specific handlers

**Outgoing:**
- WhatsApp Cloud API: POST to `https://graph.facebook.com/v19.0/{phoneNumberId}/messages`
- Instagram Messaging: POST to `https://graph.facebook.com/v19.0/me/messages`
- Facebook Messenger: POST to `https://graph.facebook.com/v19.0/me/messages`
- Calendly: GET redirect (user navigates to `CALENDLY_BRANCH1` or `CALENDLY_BRANCH2` URLs)

---

*Integration audit: 2026-03-12*
