# Codebase Concerns

**Analysis Date:** 2026-03-12

## Tech Debt

**In-Memory Session Management:**
- Issue: Booking sessions are stored in a Map in RAM with no persistence layer. Sessions are lost on every server restart. Users mid-booking will lose their progress.
- Files: `src/core/session.js`, `src/replies/booking.js`
- Impact: Poor user experience during server deployments. Users cannot resume incomplete booking flows.
- Fix approach: Move session storage to SQLite or Redis. Add session recovery mechanism with unique session ID per user.

**Monolithic Index.js:**
- Issue: `src/index.js` contains 202 lines with both webhook routing logic and admin API handlers mixed together. No separation of concerns.
- Files: `src/index.js`
- Impact: Difficult to test, maintain, and extend. Adding new routes increases coupling.
- Fix approach: Extract webhook routes to `src/routes/webhook.js`, admin routes to `src/routes/admin.js`. Use Express Router.

**Inconsistent Error Logging:**
- Issue: Some files use `logger.error()` (intent.js, index.js, metaSender.js) while others use `console.error()` (prices.js, deals.js).
- Files: `src/core/intent.js`, `src/replies/prices.js`, `src/replies/deals.js`, `src/utils/metaSender.js`
- Impact: Inconsistent log formatting and makes debugging harder.
- Fix approach: Replace all `console.error()` with `logger.error()` for consistent timestamp and formatting.

**Cookie Parser Implementation:**
- Issue: Custom inline cookie parser in `src/index.js` lines 23-29 does no validation. Assumes cookies are always valid key=value pairs.
- Files: `src/index.js` (lines 23-29)
- Impact: Malformed cookies could cause runtime errors or bypass authentication.
- Fix approach: Use `cookie-parser` npm package or add validation to split/parse logic.

## Security Considerations

**Weak Admin Authentication:**
- Risk: Admin password is plain string comparison (`password === process.env.ADMIN_PASSWORD`). No rate limiting, no account lockout, no audit trail.
- Files: `src/index.js` (lines 58-73), `src/admin/auth.js`
- Current mitigation: HttpOnly cookie, SameSite=Strict set on Set-Cookie header
- Recommendations:
  - Add rate limiting on `/admin/login` (e.g., max 5 attempts per minute per IP)
  - Add login attempt logging to database
  - Implement exponential backoff after failed attempts
  - Consider bcrypt hashing of password instead of plaintext comparison

**Session Secret as HTTP Header:**
- Risk: Admin auth accepts token from both cookie AND `x-admin-token` header (`src/admin/auth.js` line 2). This means token can be sent in plain HTTP headers, which may be logged by proxies or middleware.
- Files: `src/admin/auth.js` (line 2)
- Current mitigation: HttpOnly cookie prevents XSS exfiltration
- Recommendations: Remove `x-admin-token` header check. Rely only on HttpOnly cookies.

**No CSRF Protection:**
- Risk: `/admin/login`, `/admin/deals`, `/admin/services` POST endpoints have no CSRF token validation. Attacker could forge requests from victim's browser.
- Files: `src/index.js` (lines 58-195)
- Current mitigation: None
- Recommendations:
  - Add CSRF token generation on login page
  - Validate token on all POST endpoints
  - Use `csurf` npm package

**Database File in Root:**
- Risk: SQLite database file `salon.db` is in project root and may be accidentally committed to git or exposed via web server.
- Files: `src/db/database.js` (line 4)
- Current mitigation: `.gitignore` should exclude it, but relying on user compliance
- Recommendations:
  - Set `DB_PATH` to a directory outside webroot (e.g., `/var/lib/salon-bot/` on production)
  - Add explicit database backup/persistence strategy for Railway deployments

**API Key Exposure in Logs:**
- Risk: If webhook payloads are logged with full message content, user phone numbers (WhatsApp) or social IDs could be logged.
- Files: `src/handlers/whatsapp.js` (line 27), `src/handlers/instagram.js` (line 21), `src/handlers/facebook.js` (line 21)
- Current mitigation: Logs include sanitized identifiers (`userId`, `text`)
- Recommendations: Mask or redact phone numbers and user IDs in logs. Never log full message bodies.

**Secrets in .env File:**
- Risk: `.env` file contains all secrets and must never be committed. But `.env` is in the repo (seen in file listing).
- Files: `.env` (exists in repo root)
- Current mitigation: `.gitignore` has `.env` rule
- Recommendations:
  - Verify `.env` is actually in `.gitignore`
  - Add pre-commit hook to prevent `.env` commits
  - Document that `.env` is never checked in

## Performance Bottlenecks

**Claude Haiku API Call on Every Message:**
- Problem: Every user message triggers an API call to Claude Haiku for intent detection (`src/core/intent.js` lines 16-32). This is synchronous blocking.
- Files: `src/core/intent.js`, `src/core/router.js` (line 23)
- Cause: No caching or fallback classification. API latency directly impacts response time.
- Improvement path:
  - Cache intent classification results for 24 hours (e.g., "book" always = BOOKING)
  - Add simple keyword matching as fallback (e.g., if text contains "book" or "appointment", return BOOKING without API call)
  - Implement circuit breaker: if Claude API fails, fall back to keyword matching instead of returning UNKNOWN
  - Add timeout (currently no timeout set on axios request in metaSender.js)

**No Connection Pooling for Database:**
- Problem: Each request calls `getDb()` which opens a new database connection (though SQLite reuses the singleton).
- Files: `src/db/database.js` (lines 8-15)
- Cause: Could be inefficient with concurrent requests, though SQLite serializes writes anyway
- Improvement path: Current singleton pattern is adequate for SQLite, but add connection pooling comments for future migration to PostgreSQL.

**Synchronous API Calls in Handlers:**
- Problem: `send()` function is async but handlers don't wait for response before acknowledging webhook.
- Files: `src/handlers/whatsapp.js` (line 30), `src/handlers/instagram.js` (line 24), `src/handlers/facebook.js` (line 24)
- Cause: Fire-and-forget pattern. If send fails, user never knows.
- Improvement path: Add promise tracking. Log send failures. Implement retry mechanism with exponential backoff.

**No Message Queue:**
- Problem: If multiple messages arrive simultaneously, they're processed serially. No queue means potential message loss if handler crashes.
- Files: `src/index.js` (line 47-52)
- Cause: In-memory async handling with no persistence
- Improvement path: Add message queue (Redis Queue or Bull) for reliable message processing.

## Fragile Areas

**Booking Flow State Machine:**
- Files: `src/replies/booking.js`, `src/core/session.js`, `src/core/router.js` (line 19-20)
- Why fragile: Only 2 states (no session or AWAITING_BRANCH). No way to track multi-step flows if requirements change. Branch number validation is hardcoded to 1 or 2.
- Safe modification: Extract state machine to separate file with explicit state transitions. Add tests for state changes.
- Test coverage: No tests exist for booking flow. If branch logic changes, could silently break booking for users.

**Intent Detection Fallback:**
- Files: `src/core/intent.js` (line 30)
- Why fragile: If Claude API is down, ALL messages return UNKNOWN. No fallback classification.
- Safe modification: Add keyword-based fallback classifier before relying on API.
- Test coverage: No tests for API failure scenario.

**Platform Handler Differences:**
- Files: `src/handlers/whatsapp.js`, `src/handlers/instagram.js`, `src/handlers/facebook.js`
- Why fragile: Similar code but not refactored. If webhook format changes, must update 3 places.
- Safe modification: Create unified webhook parser that handles format differences. Share extraction logic.
- Test coverage: No webhook parsing tests.

**Hard-Coded Branch Numbers:**
- Files: `src/replies/booking.js` (lines 20-20), `src/replies/branches.js` (lines 2-17)
- Why fragile: Branch logic is scattered. BRANCHES array is hardcoded with env vars but booking.js only checks 1 or 2.
- Safe modification: Add branch validation against BRANCHES array instead of hardcoding numbers.
- Test coverage: No tests validate branch configuration consistency.

## Missing Critical Features

**No Message Persistence:**
- Problem: Messages are processed but never stored in database. No conversation history or analytics.
- Blocks: Cannot provide conversation replay, analytics dashboards, or audit trail.

**No Webhook Retry Logic:**
- Problem: If send fails, webhook handler doesn't retry. Message is silently lost.
- Blocks: Users miss critical booking confirmations or information.

**No Rate Limiting:**
- Problem: No protection against spam or DDoS on webhook or admin endpoints.
- Blocks: Bad actors could flood webhook with messages or brute-force admin login.

**No Analytics:**
- Problem: No tracking of intent distribution, user engagement, or funnel metrics.
- Blocks: Cannot measure bot effectiveness or identify improvement areas.

**No Admin Logging/Audit Trail:**
- Problem: When admin modifies deals/services, no record of who changed what or when.
- Blocks: Cannot track changes or identify malicious modifications.

## Test Coverage Gaps

**Webhook Parsing:**
- What's not tested: Extraction of message text, user ID, and metadata from each platform's webhook format.
- Files: `src/handlers/whatsapp.js`, `src/handlers/instagram.js`, `src/handlers/facebook.js`
- Risk: If Meta changes webhook schema, parsing breaks silently. Users see no error.
- Priority: High

**Intent Classification:**
- What's not tested: Intent detection accuracy, fallback on API failure, intent validation.
- Files: `src/core/intent.js`
- Risk: Invalid intents could be returned or API failures cause cascading failures.
- Priority: High

**Booking Flow State Transitions:**
- What's not tested: Session creation, state transitions, timeout handling, invalid input handling.
- Files: `src/replies/booking.js`, `src/core/session.js`
- Risk: Users can get stuck in booking flow or lose sessions on restart.
- Priority: High

**Database Operations:**
- What's not tested: Upsert logic, deletion cascades, transaction handling, error recovery.
- Files: `src/index.js` (lines 101-148, 151-195), `src/db/database.js`
- Risk: Partial updates or corrupted data if transaction fails mid-way.
- Priority: Medium

**API Integration:**
- What's not tested: Meta API calls, token validation, error responses, retry logic.
- Files: `src/utils/metaSender.js`
- Risk: Invalid API responses or network errors could cause crashes.
- Priority: Medium

## Scaling Limits

**Single Server Instance:**
- Current capacity: Can handle ~100s of concurrent messages before in-memory session Map grows unbounded.
- Limit: In-memory storage will consume memory proportionally to active users. If 10K concurrent users, each with 1 session object (~200 bytes), that's 2MB. But on shared hosting this adds up.
- Scaling path: Move sessions to Redis. Add horizontal scaling with load balancer.

**SQLite Write Scalability:**
- Current capacity: SQLite can handle ~1000 writes/sec on local filesystem.
- Limit: If salon scales to high message volume (e.g., 100+ messages/minute during peak), SQLite becomes bottleneck.
- Scaling path: Migrate to PostgreSQL for production. Keep SQLite for development.

**Webhook Processing:**
- Current capacity: Express server processes webhooks serially in event loop. If handler is slow (waiting for Claude API), other webhooks queue up.
- Limit: If multiple messages arrive during API latency spike (e.g., Claude API slow), messages could timeout or be dropped.
- Scaling path: Add message queue (Bull/Redis) to decouple webhook receipt from processing.

---

*Concerns audit: 2026-03-12*
