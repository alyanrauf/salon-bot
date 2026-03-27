# Technology Stack

**Analysis Date:** 2026-03-12

## Languages

**Primary:**
- JavaScript (Node.js) - All server-side code

## Runtime

**Environment:**
- Node.js 18.x (specified in `.nvmrc`)
- Required: `node >= 18.0.0` (per `package.json` engines field)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Express 4.19.2 - HTTP server and routing (`src/index.js`)

**Testing:**
- Not currently configured in dependencies

**Build/Dev:**
- nodemon 3.1.0 - Development auto-reload (`npm run dev`)

## Key Dependencies

**Critical:**
- @anthropic-ai/sdk 0.39.0 - Claude Haiku API for intent classification (`src/core/intent.js`)
- better-sqlite3 9.4.3 - Synchronous SQLite database (`src/db/database.js`)
- axios 1.7.2 - HTTP client for Meta Graph API calls (`src/utils/metaSender.js`)
- dotenv 16.4.5 - Environment variable loading (`.env` file support)

**Infrastructure:**
- All dependencies are production-critical for messaging, AI, and data operations

## Configuration

**Environment:**
- Configuration via `.env` file (dotenv)
- Required environment variables documented in `.env.example`:
  - `PORT` - Server port (default: 3000)
  - `META_VERIFY_TOKEN` - Webhook verification token
  - `WA_ACCESS_TOKEN` - WhatsApp Cloud API token
  - `WA_PHONE_NUMBER_ID` - WhatsApp phone number ID
  - `IG_PAGE_ACCESS_TOKEN` - Instagram page access token
  - `FB_PAGE_ACCESS_TOKEN` - Facebook page access token
  - `ANTHROPIC_API_KEY` - Claude API key
  - `ADMIN_PASSWORD` - Admin panel password
  - `ADMIN_SESSION_SECRET` - Session cookie secret (should be generated with `openssl rand -hex 32`)
  - `DB_PATH` - Optional SQLite database path override
  - `BRANCH1_NAME`, `BRANCH1_ADDRESS`, `BRANCH1_PHONE`, `BRANCH1_MAP_LINK` - Branch 1 details
  - `BRANCH2_NAME`, `BRANCH2_ADDRESS`, `BRANCH2_PHONE`, `BRANCH2_MAP_LINK` - Branch 2 details
  - `CALENDLY_BRANCH1`, `CALENDLY_BRANCH2` - Calendly booking URLs

**Build:**
- No build step needed (vanilla JavaScript)
- Entry point: `src/index.js`
- Start command: `npm start` or `npm run dev`

## Platform Requirements

**Development:**
- Node.js 18.x (use `nvm use 18` with nvm sourced, or prefix commands with `export PATH="/Users/salmanaslam/.nvm/versions/node/v18.15.0/bin:$PATH"`)
- npm (included with Node.js)
- `.env` file with all credentials populated

**Production:**
- Node.js 18.x runtime
- SQLite database file persisted (e.g., via Railway persistent volume at `/salon.db`)
- All environment variables configured at deployment platform
- Webhooks must be publicly accessible at `https://your-domain/webhook`

---

*Stack analysis: 2026-03-12*
