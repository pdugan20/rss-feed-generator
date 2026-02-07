# RSS Feed Generator

A secure, whitelisted RSS feed generator with pluggable per-site extractors and automatic daily updates. Generates RSS 2.0 feeds from websites that don't provide their own.

## Features

- **Whitelisted feeds only** - Restricted to pre-configured URLs
- **Per-site extractors** - Dedicated scraping logic per website for accurate extraction
- **Railway Cron scheduling** - Reliable scheduled updates via Railway's cron service
- **API key protected** - Manual refresh requires authentication
- **24-hour caching** - Balances freshness with server load
- **Health monitoring** - `/status` endpoint reports per-feed cache health

## Supported Feeds

| Label                 | URL                                                                | Extractor     |
| --------------------- | ------------------------------------------------------------------ | ------------- |
| huskies               | `https://www.seattletimes.com/sports/washington-huskies-football/` | seattle-times |
| mariners              | `https://www.seattletimes.com/sports/mariners/`                    | seattle-times |
| anthropic-engineering | `https://www.anthropic.com/engineering`                            | anthropic     |
| claude-blog           | `https://claude.com/blog`                                          | claude-blog   |

## Adding a New Site

Adding a new feed requires exactly 4 file changes (enforced by architecture tests):

1. Create `lib/extractors/<name>.js` -- export `{ extract }` where `extract($, url)` takes a Cheerio object and returns an array of articles
2. Add entry to `lib/feeds.js` -- `{ url, extractor, label }`
3. Register in `lib/extract.js` -- add `'<name>': require('./extractors/<name>')` to the registry
4. Create `__tests__/lib/extractors/<name>.test.js` -- test against sample HTML fixtures

The architecture consistency test (`__tests__/lib/architecture.test.js`) validates this contract on every test run.

## Setup

### 1. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Then edit `.env` with your values:

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0

# Your deployed app URL (update after deploying)
BASE_URL=https://your-app.up.railway.app

# Environment
NODE_ENV=production

# API Key for manual refresh endpoint
# Generate a secure key with: openssl rand -base64 32
API_KEY=your-secure-api-key-here
```

**IMPORTANT:**

- Generate a secure API key for production: `openssl rand -base64 32`
- Set these as environment variables in Railway

### 2. Local Development

```bash
npm install
npm run dev
```

## API Endpoints

### `GET /`

Service information, allowed feeds, and auto-generated examples.

### `GET /health`

Health check endpoint.

### `GET /status`

Per-feed cache status. Returns `"healthy"` when all feeds are cached, `"degraded"` when any are missing.

```bash
curl http://localhost:3000/status
```

### `GET /feed?url={allowed_url}`

Get RSS feed (only works with whitelisted URLs).

```bash
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/"
```

### `POST /refresh`

Manually refresh feeds (requires API key).

**Refresh all feeds:**

```bash
curl -X POST http://localhost:3000/refresh \
  -H "api_key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Refresh specific feed:**

```bash
curl -X POST http://localhost:3000/refresh \
  -H "api_key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.seattletimes.com/sports/mariners/"}'
```

## Deploy Verification

After pushing to Railway, verify the deployment:

```bash
# Requires BASE_URL and API_KEY environment variables
scripts/verify-deploy.sh
```

The script checks `/status`, triggers `/refresh`, and validates each feed endpoint. See `scripts/verify-deploy.sh` for details.

## Deployment to Railway

### Web Service Setup

1. **Configure Railway Web Service:**
   - Create new project on Railway
   - Connect your GitHub repository
   - Railway will auto-detect Node.js
   - Start command: `npm start` (default)

2. **Set Environment Variables:**
   - `BASE_URL` - Your Railway app URL (e.g., `https://your-app.up.railway.app`)
   - `API_KEY` - Your secure API key (generate with `openssl rand -base64 32`)
   - `PORT` - Leave empty (Railway sets this automatically)

### Cron Service Setup (For Scheduled Updates)

1. **Add Cron Service to Same Project:**
   - In your Railway project, click **+ Create**
   - Choose **GitHub Repo** and select the same repository
   - This creates a second service in your project

2. **Configure the Cron Service:**
   - Go to **Settings** tab
   - **Service Name:** `rss-feed-cron` (or similar)
   - **Start Command:** `node refresh-feeds.js`
   - **Cron Schedule:** `0 13 * * *` (6 AM PST in UTC)

3. **Copy Environment Variables:**
   - Go to **Variables** tab
   - Add the same `API_KEY` and any other variables from your web service

4. **Deploy:**
   - Railway will run the cron service on schedule

### Railway CLI (Optional)

```bash
brew install railway
railway login
railway link
railway logs        # View live logs
railway status      # Check deployment status
```

## Update Schedule

- **Automatic:** Configured via Railway Cron (recommended: daily at 6 AM PST using `0 13 * * *`)
- **Manual:** Use the `/refresh` endpoint with your API key
- **Cache Duration:** 24 hours

## Development

```bash
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix lint issues
npm run format        # Format code with Prettier
npm run format:check  # Check formatting without changes
npm test              # Run test suite
```

Pre-commit hooks automatically lint and format staged files. Pre-push hooks run the test suite.

## Architecture

```text
lib/
  feeds.js              Single source of truth for feed URLs + extractor mappings
  extract.js            Extractor registry + shared helpers (resolveUrl, parseDate)
  extractors/
    seattle-times.js    Seattle Times extraction
    anthropic.js        Anthropic engineering blog extraction
    claude-blog.js      Claude blog extraction
    generic.js          Generic fallback extraction
  scraper.js            Browser management only (Puppeteer)
  scheduler.js          Scheduled feed refresh
  rss-generator.js      RSS 2.0 XML generation
  cache.js              In-memory cache (24h TTL)
```

## Tech Stack

- **Fastify** - High-performance web framework
- **Puppeteer** - Headless Chrome for JavaScript-rendered pages
- **Cheerio** - Server-side DOM manipulation
- **Railway Cron** - Scheduled tasks
- **RSS** - RSS 2.0 feed generation
- **Node-Cache** - In-memory caching
- **Jest** - Testing framework
- **Husky + lint-staged** - Pre-commit/pre-push hooks
- **ESLint + Prettier** - Linting and formatting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
