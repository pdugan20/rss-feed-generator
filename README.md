# RSS Feed Generator

[![CI](https://github.com/pdugan20/rss-feed-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/pdugan20/rss-feed-generator/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)

A secure, whitelisted feed generator with pluggable per-site extractors and automatic daily updates. Generates RSS 2.0, Atom 1.0, and JSON Feed 1.0 from websites that don't provide their own.

## Features

- **Multi-format output** - RSS 2.0, Atom 1.0, and JSON Feed 1.0 from a single source
- **TypeScript with strict mode** - Full type safety enforced in CI and pre-push hooks
- **Whitelisted feeds only** - Restricted to pre-configured URLs
- **Per-site extractors** - Dedicated scraping logic per website for accurate extraction
- **Article enrichment** - Optional per-article scraping for descriptions from individual pages
- **Persistent article store** - Enriched descriptions cached to disk, surviving deploys
- **Railway Cron scheduling** - Reliable scheduled updates via Railway's cron service
- **API key protected** - Manual refresh requires authentication
- **24-hour caching** - Balances freshness with server load
- **Health monitoring** - `/status` endpoint reports per-feed cache health

## Supported Feeds

| Feed                  | Source                                                                               | RSS                                                                                                                                                     | Category | Enriched |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| UW Huskies Football   | [seattletimes.com](https://www.seattletimes.com/sports/washington-huskies-football/) | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.seattletimes.com%2Fsports%2Fwashington-huskies-football%2F) | Sports   | No       |
| Mariners              | [seattletimes.com](https://www.seattletimes.com/sports/mariners/)                    | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.seattletimes.com%2Fsports%2Fmariners%2F)                    | Sports   | No       |
| Anthropic Engineering | [anthropic.com](https://www.anthropic.com/engineering)                               | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.anthropic.com%2Fengineering)                                | Tech     | No       |
| Claude Blog           | [claude.com](https://claude.com/blog)                                                | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fclaude.com%2Fblog)                                              | Tech     | Yes      |

All feeds support `?format=atom` and `?format=json` in addition to the default RSS 2.0.

## Adding a New Site

Adding a new feed requires exactly 4 file changes (enforced by architecture tests):

1. Create `lib/extractors/<name>.ts` -- export `{ extract }` where `extract($: CheerioAPI, url: string)` returns `Article[]`
2. Add entry to `lib/feeds.ts` -- `{ url, extractor, label }` typed as `FeedConfig`
3. Register in `lib/extract.ts` -- add `'<name>': require('./extractors/<name>')` to the registry
4. Create `__tests__/lib/extractors/<name>.test.ts` -- test against sample HTML fixtures

The architecture consistency test (`__tests__/lib/architecture.test.ts`) validates this contract on every test run.

Optionally, export an `enrichArticle($: CheerioAPI, url: string)` function from the extractor to enable per-article description enrichment.

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

# Article store data directory (default: ./data, Railway: /app/data)
# DATA_DIR=/app/data
```

**IMPORTANT:**

- Generate a secure API key for production: `openssl rand -base64 32`
- Set these as environment variables in Railway

### 2. Local Development

```bash
npm install
npm run dev
```

`npm run dev` uses `tsx watch` to run TypeScript directly with hot reloading. For production, the project compiles to JavaScript via `npm run build` and runs from `dist/`.

## API Endpoints

### `GET /`

Service information, allowed feeds, available formats, and auto-generated examples.

### `GET /health`

Health check endpoint.

### `GET /status`

Per-feed cache status. Returns `"healthy"` when all feeds are cached, `"degraded"` when any are missing.

```bash
curl http://localhost:3000/status
```

### `GET /feed?url={allowed_url}&format={rss|atom|json}`

Get feed in the specified format (only works with whitelisted URLs).

| Parameter | Required | Default | Description                          |
| --------- | -------- | ------- | ------------------------------------ |
| `url`     | Yes      | -       | Whitelisted source URL               |
| `format`  | No       | `rss`   | Output format: `rss`, `atom`, `json` |

```bash
# RSS 2.0 (default)
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/"

# Atom 1.0
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/&format=atom"

# JSON Feed 1.0
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/&format=json"
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
   - Railway will auto-detect Node.js and run `npm run build` via nixpacks
   - Start command: `npm start` (runs compiled `dist/server.js`)

2. **Set Environment Variables:**
   - `BASE_URL` - Your Railway app URL (e.g., `https://your-app.up.railway.app`)
   - `API_KEY` - Your secure API key (generate with `openssl rand -base64 32`)
   - `DATA_DIR` - Set to `/app/data` for persistent article store
   - `PORT` - Leave empty (Railway sets this automatically)

3. **Add Persistent Volume (for article enrichment):**
   - In your Railway project, open the web service
   - Add a volume with mount path `/app/data`
   - This stores enriched article descriptions across deploys

### Cron Service Setup (For Scheduled Updates)

1. **Add Cron Service to Same Project:**
   - In your Railway project, click **+ Create**
   - Choose **GitHub Repo** and select the same repository
   - This creates a second service in your project

2. **Configure the Cron Service:**
   - Go to **Settings** tab
   - **Service Name:** `rss-feed-cron` (or similar)
   - **Start Command:** `node dist/scripts/refresh-feeds.js`
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
npm run dev           # Start dev server with tsx watch
npm run build         # Compile TypeScript to dist/
npm run typecheck     # Type check without emitting (tsc --noEmit)
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix lint issues
npm run format        # Format code with Prettier
npm run format:check  # Check formatting without changes
npm test              # Run test suite
```

Pre-commit hooks automatically lint and format staged files. Pre-push hooks run type checking and the test suite.

## Architecture

```text
lib/
  types.ts              Shared interfaces (Article, FeedConfig, Extractor, FeedFormat)
  feeds.ts              Single source of truth for feed URLs + extractor mappings
  extract.ts            Extractor registry + shared helpers (resolveUrl, parseDate)
  extractors/
    seattle-times.ts    Seattle Times extraction
    anthropic.ts        Anthropic engineering blog extraction
    claude-blog.ts      Claude blog extraction (with enrichment)
    generic.ts          Generic fallback extraction
  scraper.ts            Browser management only (Puppeteer)
  scheduler.ts          Scheduled feed refresh
  feed-generator.ts     Multi-format feed generation (RSS, Atom, JSON)
  enricher.ts           Article enrichment pipeline
  article-store.ts      Persistent article metadata (descriptions)
  cache.ts              In-memory cache (24h TTL)
```

## Tech Stack

- **TypeScript** - Strict mode, compiled to `dist/` for production
- **Fastify** - High-performance web framework
- **Puppeteer** - Headless Chrome for JavaScript-rendered pages
- **Cheerio** - Server-side DOM manipulation
- **Railway Cron** - Scheduled tasks
- **Feed** - Multi-format feed generation (RSS 2.0, Atom 1.0, JSON Feed 1.0)
- **Node-Cache** - In-memory caching
- **Jest + ts-jest** - Testing framework with TypeScript support
- **Husky + lint-staged** - Pre-commit/pre-push hooks
- **ESLint + Prettier** - Linting and formatting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
