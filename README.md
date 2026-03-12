# Salon Bot

Automated messaging and booking bot for a ladies beauty salon.
Handles WhatsApp, Instagram DM, and Facebook Messenger with intent detection via Claude Haiku,
SQLite for deals/prices, and Calendly for booking.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your actual API keys and settings
```

### 3. Seed the database
```bash
npm run seed
```

### 4. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

The server runs on `http://localhost:3000` by default.

---

## Environment Variables

See `.env.example` for all required variables with descriptions.

| Variable | Description |
|---|---|
| `META_VERIFY_TOKEN` | Random string you set — entered in Meta webhook config |
| `WA_ACCESS_TOKEN` | WhatsApp Cloud API token |
| `IG_PAGE_ACCESS_TOKEN` | Instagram/Facebook page token |
| `FB_PAGE_ACCESS_TOKEN` | Facebook Messenger page token |
| `ANTHROPIC_API_KEY` | Claude API key (for intent detection) |
| `ADMIN_PASSWORD` | Password for the `/admin` panel |
| `ADMIN_SESSION_SECRET` | Random 32-char secret for session cookie |
| `CALENDLY_BRANCH1` | Calendly scheduling link for Branch 1 |
| `CALENDLY_BRANCH2` | Calendly scheduling link for Branch 2 |

---

## Admin Panel

Access at `https://your-domain.railway.app/admin`

- Log in with `ADMIN_PASSWORD`
- Update deals (activate/deactivate, edit text)
- Update service prices
- Changes take effect immediately — no restart needed

---

## Webhook Setup (Meta Developer Console)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new App → Add products: **WhatsApp**, **Messenger**, **Instagram**
3. Webhooks → Configure callback URL: `https://your-railway-domain.up.railway.app/webhook`
4. Verify token: use the value from `META_VERIFY_TOKEN` in your `.env`
5. Subscribe to these fields:
   - WhatsApp: `messages`
   - Instagram: `messages`
   - Messenger: `messages`, `messaging_postbacks`

---

## Deploy to Railway

1. Push code to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add all environment variables from `.env.example` in Railway's Variables tab
4. Railway auto-deploys on every push

> **Note**: SQLite is stored on Railway's ephemeral filesystem. For production longevity, consider using Railway's persistent volume or migrating to Turso/PlanetScale.

---

## File Structure

```
salon-bot/
├── src/
│   ├── index.js              # Express server + all routes
│   ├── handlers/
│   │   ├── whatsapp.js       # WhatsApp webhook handler
│   │   ├── instagram.js      # Instagram webhook handler
│   │   └── facebook.js       # Facebook Messenger handler
│   ├── core/
│   │   ├── intent.js         # Claude Haiku intent classifier
│   │   ├── router.js         # Intent → reply router
│   │   └── session.js        # In-memory booking session store
│   ├── replies/
│   │   ├── prices.js         # Reads prices from SQLite
│   │   ├── deals.js          # Reads deals from SQLite
│   │   ├── branches.js       # Static branch info + Calendly links
│   │   └── booking.js        # Stateful booking flow
│   ├── db/
│   │   ├── database.js       # SQLite connection + schema init
│   │   └── seed.js           # Initial data seeder
│   ├── admin/
│   │   ├── auth.js           # Session-based auth middleware
│   │   └── views/panel.html  # Admin UI
│   └── utils/
│       ├── metaSender.js     # Unified send() for all 3 platforms
│       └── logger.js         # Timestamped console logger
├── .env.example
├── .gitignore
└── package.json
```

---

## Bot Intents

| Customer says | Detected intent | Bot response |
|---|---|---|
| "how much is a haircut?" | PRICE | Full price list from DB |
| "any offers today?" | DEALS | Active deals from DB |
| "I want to book" | BOOKING | Asks branch → sends Calendly link |
| "where are you located?" | BRANCH | Both branch addresses + maps |
| "hello", anything else | UNKNOWN | Friendly menu of options |

---

## Monthly Cost Estimate

| Item | Cost |
|---|---|
| Railway hosting | $5–7 |
| Claude Haiku API (~1,500 msgs/mo) | ~$0.25 |
| Meta APIs | $0 (free tier) |
| Calendly (2 free accounts) | $0 |
| **Total** | **~$5–8/month** |
