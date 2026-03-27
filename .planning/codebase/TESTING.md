# Testing Patterns

**Analysis Date:** 2026-03-12

## Test Framework

**Runner:**
- No test framework configured (no Jest, Vitest, Mocha, etc.)
- No `package.json` test script present
- No test files found in codebase (zero `.test.js` or `.spec.js` files)

**Assertion Library:**
- None configured

**Run Commands:**
```bash
npm start                # Run application
npm run dev             # Run with nodemon (auto-reload on file changes)
npm run seed            # Seed database with sample data
```

**Status:** Testing infrastructure not implemented. Project is currently untested.

## Test File Organization

**Location:**
- Not applicable — no test files exist

**Naming:**
- Not applicable

**Structure:**
- Not applicable

## Manual Testing Approach

**Webhook Testing:**
Current testing relies on manual testing against Meta webhook endpoints:
- Webhook verification: Send GET with `hub.verify_token`, `hub.challenge`, `hub.mode` to `/webhook`
- Message handling: POST JSON to `/webhook` with platform-specific payload shape
- No automated assertions

**Database Testing:**
Manual execution of `npm run seed` to validate:
- Schema creation in `src/db/database.js` runs successfully
- Sample data inserts without errors in `src/db/seed.js`

**Admin Panel Testing:**
Manual browser testing:
- Login flow: POST `/admin/login` with password
- API endpoints: GET `/admin/api/deals`, `/admin/api/services` (with auth)
- Data persistence: POST `/admin/deals`, `/admin/services` with full array replacement

## Intent Classification Testing

**Manual approach in `src/core/intent.js`:**
- Function `detectIntent(message)` calls Claude API
- Validation: Response filtered through `validIntents` set — returns 'UNKNOWN' if Claude response doesn't match expected categories
- Error handling: API errors caught, returns 'UNKNOWN' as fallback

```javascript
const intent = response.content[0].text.trim().toUpperCase();
const validIntents = ['PRICE', 'DEALS', 'BOOKING', 'BRANCH', 'UNKNOWN'];
return validIntents.includes(intent) ? intent : 'UNKNOWN';
```

## Session Management Testing

**Manual approach in `src/core/session.js`:**
- In-memory session store with TTL validation
- Session expiry tested via `Date.now() - entry.updatedAt > SESSION_TTL_MS`
- Background cleanup every 5 minutes removes expired sessions
- No automated test coverage; relies on booking flow manual testing

```javascript
function getSession(userId) {
  const entry = sessions.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  return entry.data;
}
```

## Database Operations

**Synchronous Queries:**
- Better-sqlite3 used for synchronous operations
- All `db.prepare().all()` and `db.prepare().run()` are blocking
- No async/await needed for database operations

**Transaction Pattern in `src/index.js`:**
```javascript
const runAll = db.transaction(() => {
  for (const id of toDelete) {
    db.prepare('DELETE FROM deals WHERE id = ?').run(id);
  }
  for (const deal of deals) {
    if (deal.id) {
      upsert.run({ id: deal.id, ... });
    } else {
      insert.run({ ... });
    }
  }
});
runAll();
```

## Mocking

**Framework:** Not applicable — no test framework

**Platform Simulation:**
- Manual JSON payloads sent to `/webhook` endpoint to simulate WhatsApp, Instagram, Facebook messages
- Example WhatsApp payload structure:
  ```json
  {
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "type": "text",
            "text": { "body": "Hello" }
          }],
          "metadata": { "phone_number_id": "101" }
        }
      }]
    }]
  }
  ```

**Environmental Simulation:**
- `.env.example` documents all required variables
- `.env` file should be copied from `.env.example` for local development
- Docker/Railway environment uses injected env vars

## Error Scenarios

**Current Handling:**
- No test cases for error scenarios
- Error handling patterns exist in code:
  - Database errors in `src/replies/prices.js`: Catch and return fallback message
  - API errors in `src/core/intent.js`: Return 'UNKNOWN' intent
  - Handler errors in `src/handlers/whatsapp.js`: Log and continue

**Manual Testing Approach:**
- Simulate missing environment variables by not setting them in `.env`
- Simulate database connection failures by moving `salon.db` file
- Simulate API timeouts by blocking Meta API access at network level

## Coverage

**Requirements:** None enforced

**Current Status:** Zero test coverage. No metrics tracked.

**Critical Untested Areas:**
- Intent classification accuracy (relies entirely on Claude API)
- Booking flow state machine in `src/core/session.js`
- Admin authentication and authorization in `src/admin/auth.js`
- Database transaction rollback behavior
- Webhook payload parsing from all three platforms
- Message routing logic in `src/core/router.js`
- Meta API integration in `src/utils/metaSender.js`

## Test Plan (For Future Implementation)

**Recommended Stack:**
- Framework: Jest or Vitest
- Mocking: jest.mock() or vi.mock()
- Database: sqlite-in-memory or factory-in-memory for tests
- HTTP mocking: nock (for axios calls to Meta API)

**Priority Areas to Test:**
1. **Intent Classification** (`src/core/intent.js`): Mock Claude API response, test intent categories and fallback to 'UNKNOWN'
2. **Routing Logic** (`src/core/router.js`): Test all intents map to correct reply functions, booking flow transitions work
3. **Booking State Machine** (`src/replies/booking.js`): Test branch selection, invalid input handling, session cleanup
4. **Admin APIs** (`src/index.js` POST routes): Test UPSERT logic, deletion detection, transaction rollback
5. **Platform Handlers** (`src/handlers/*.js`): Test payload parsing, message extraction, error recovery

**Setup Pattern (if Jest implemented):**
```javascript
describe('Intent Detection', () => {
  it('should classify PRICE intent', async () => {
    jest.spyOn(Anthropic.prototype, 'messages').mockResolvedValueOnce({
      content: [{ text: 'PRICE' }]
    });
    const intent = await detectIntent('how much');
    expect(intent).toBe('PRICE');
  });

  it('should return UNKNOWN for invalid response', async () => {
    jest.spyOn(Anthropic.prototype, 'messages').mockResolvedValueOnce({
      content: [{ text: 'INVALID' }]
    });
    const intent = await detectIntent('test');
    expect(intent).toBe('UNKNOWN');
  });
});
```

---

*Testing analysis: 2026-03-12*
