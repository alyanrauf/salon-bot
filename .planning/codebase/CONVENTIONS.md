# Coding Conventions

**Analysis Date:** 2026-03-12

## Naming Patterns

**Files:**
- Kebab-case with descriptive names: `metaSender.js`, `whatsapp.js`, `branches.js`
- Handler files use platform names: `whatsapp.js`, `instagram.js`, `facebook.js` in `src/handlers/`
- Module files describe their purpose: `intent.js`, `session.js`, `router.js`, `auth.js`
- Utility files describe the utility: `logger.js`, `metaSender.js`

**Functions:**
- camelCase throughout: `detectIntent()`, `getPricesReply()`, `handleWhatsApp()`, `handleBookingStep()`
- Handler functions prefixed with `handle` (action) or `get` (data): `handleWhatsApp()`, `getPricesReply()`, `getSession()`
- Getter functions prefixed with `get`: `getDb()`, `getSession()`, `getBranchCalendlyLink()`, `getBranchesReply()`
- Setter functions prefixed with `set`: `setSession()`
- Verification functions prefixed with `verify`: `verifyWhatsApp()`, `verifyInstagram()`, `verifyFacebook()`
- Middleware and internal functions named descriptively: `requireAdminAuth()`, `routeMessage()`

**Variables:**
- camelCase: `userId`, `messageText`, `phoneNumberId`, `recipientId`, `accessToken`
- Constants in UPPER_SNAKE_CASE: `SESSION_TTL_MS`, `GRAPH_API_VERSION`, `BASE_URL`, `FALLBACK_MESSAGE`, `ASK_BRANCH_MESSAGE`
- Descriptive names for collections: `branches`, `deals`, `services`, `sessions` (Map used for sessions)
- Single letter variables avoided except in tight loops: `for (const [branch, items] of Object.entries(branches))`

**Types & Objects:**
- No TypeScript. Objects use inline shape documentation in JSDoc comments (see section below).
- Constants exported at module level: `BRANCHES` array in `src/replies/branches.js`, `SESSION_TTL_MS` in `src/core/session.js`

## Code Style

**Formatting:**
- No explicit formatter configured (no .prettierrc or eslint files in repo)
- 2-space indentation used consistently
- Lines kept readable length (no strict column limit observed, but pragmatic breaks used)
- Function declarations use standard form: `function name() {}` and `async function name() {}`
- Arrow functions used in callbacks and map/filter operations

**Linting:**
- No formal linting configured (no .eslintrc file)
- Code follows basic Node.js conventions implicitly
- No strict enforcement visible; style is consistent but informal

**Semicolons:**
- Semicolons used consistently at statement endings
- No semicolon-free style observed

## Import Organization

**Order:**
1. Core Node.js modules (`require('path')`, `require('dotenv')`)
2. Third-party packages (`require('express')`, `require('axios')`, `require('@anthropic-ai/sdk')`)
3. Local project modules (`require('./utils/logger')`, `require('../db/database')`)

**Path Aliases:**
- Relative paths used exclusively: `../`, `./`
- No import aliases or path mappings configured

**Example from `src/index.js`:**
```javascript
require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const { getDb } = require('./db/database');
const { handleWhatsApp, verifyWhatsApp } = require('./handlers/whatsapp');
const { handleInstagram, verifyInstagram } = require('./handlers/instagram');
const { handleFacebook, verifyFacebook } = require('./handlers/facebook');
const { requireAdminAuth } = require('./admin/auth');
```

## Error Handling

**Patterns:**
- Try-catch blocks used for async/sync operations that may throw: `src/index.js` admin routes, `src/handlers/whatsapp.js`, `src/replies/prices.js`
- Graceful fallbacks when errors occur:
  - Database errors return user-friendly message: `"Sorry, I could not load prices right now. Please try again shortly."`
  - Handler errors logged but don't crash server: `logger.error()` + silent fail
  - Webhook handlers immediately respond with 200, then process async
- No error types or custom error classes defined
- Logger errors include context: `logger.error('[WhatsApp] Handler error:', err.message)`

**Pattern:**
```javascript
try {
  const db = getDb();
  const services = db.prepare('SELECT...').all();
  // Process and return
} catch (err) {
  console.error('[module] Operation error:', err.message);
  return 'User-friendly fallback message';
}
```

## Logging

**Framework:** `src/utils/logger.js` — Custom simple logger using `console.log/error/warn`

**Patterns:**
- Timestamps added to every log: `[${timestamp()}]` where timestamp is ISO 8601
- Log levels prefixed: `INFO`, `ERROR`, `WARN`
- Contextual brackets for source: `[WhatsApp]`, `[Instagram]`, `[admin]`, `[intent]`, `[prices]`, `[Webhook]`
- Usage: `logger.info()`, `logger.error()`, `logger.warn()`

**Example:**
```javascript
logger.info('[WhatsApp] From: ${userId} | Message: ${text}');
logger.error('[WhatsApp] Handler error:', err.message);
```

**Implementation in `src/utils/logger.js`:**
```javascript
const logger = {
  info(...args) {
    console.log(`[${timestamp()}] INFO`, ...args);
  },
  error(...args) {
    console.error(`[${timestamp()}] ERROR`, ...args);
  },
};
```

## Comments

**When to Comment:**
- Rarely used; code is generally self-documenting
- Used for section breaks in files: `// ─── Middleware ───`, `// ─── Webhook routes ───`
- Used for clarification on non-obvious behavior: `// Meta requires 200 within 5 seconds`, `// Ignore status updates`, `// Keyed by userId`
- Configuration documentation in comments: `// Static branch information — update addresses and map links here`

**JSDoc/TSDoc:**
- Minimal JSDoc used; example in `src/utils/metaSender.js`:
  ```javascript
  /**
   * Unified send function for all three platforms.
   * @param {'whatsapp'|'instagram'|'facebook'} platform
   * @param {string} recipientId
   * @param {string} text
   * @param {object} [opts] - Extra options (e.g., phoneNumberId for WhatsApp)
   */
  async function send(platform, recipientId, text, opts = {}) {
  ```
- Not required; only used for module public APIs
- Inline comments preferred for complex logic: `// Prune expired sessions every 5 minutes`

## Function Design

**Size:**
- Functions are kept small and focused
- Single responsibility: `detectIntent()` classifies messages, `routeMessage()` dispatches to handlers, `getPricesReply()` fetches and formats prices
- Largest functions are in `src/index.js` (admin POST routes) due to transaction logic, but even these are contained to ~40 lines

**Parameters:**
- Explicit parameters preferred: `handleBookingStep(userId, messageText, session)`
- Optional parameters use default values: `send(platform, recipientId, text, opts = {})`
- Destructuring used for nested objects: `const { password } = req.body`, `const { object } = req.body`

**Return Values:**
- Async functions return promises
- Handler functions return early with `res.sendStatus()` or `res.redirect()` to prevent double-sends
- Reply functions return strings (message text): `getPricesReply()` returns formatted message string
- Session functions return data or null: `getSession()` returns session object or null if expired

## Module Design

**Exports:**
- Named exports used exclusively: `module.exports = { detectIntent }`, `module.exports = { handleWhatsApp, verifyWhatsApp }`
- One default export pattern not used; module.exports always used instead
- Each module exports related functionality: Platform handlers export both handler and verify functions

**Example from `src/core/intent.js`:**
```javascript
module.exports = { detectIntent };
```

**Example from `src/handlers/whatsapp.js`:**
```javascript
module.exports = { handleWhatsApp, verifyWhatsApp };
```

**Barrel Files:**
- Not used; imports reference specific files
- Import pattern: `const { detectIntent } = require('./core/intent')` (not from index)

## Request/Response Handling

**Express Middleware:**
- Custom cookie parser implemented inline in `src/index.js` instead of using a package
- Middleware registration: `app.use(express.json())` then platform-specific handlers
- Response patterns:
  - Acknowledge webhooks immediately: `res.sendStatus(200)` at start of handler
  - Process async after acknowledgment (don't await before sending)
  - Admin routes check auth via middleware: `app.get('/admin', requireAdminAuth, (req, res) => ...)`

**Database Operations:**
- Synchronous SQLite via better-sqlite3: `db.prepare(...).all()`, `db.prepare(...).run()`
- Transactions for complex operations: `db.transaction(() => { ... })()`
- Prepared statements with named and positional parameters: `VALUES (@id, @title)` and `VALUES (?, ?, ?)`

## Testing & Assertions

- No test files present; testing framework not configured
- Assertions are implicit: database schema validation during init, intent validation in `detectIntent()` (returns 'UNKNOWN' if invalid)
- Validation patterns: Check array type `Array.isArray(deals)`, null/undefined checks with optional chaining

---

*Convention analysis: 2026-03-12*
