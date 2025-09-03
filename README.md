# RSS Feed Generator

A secure, whitelisted RSS feed generator for Seattle Times sports sections with automatic daily updates.

## Features

- 🔒 **Whitelisted feeds only** - Restricted to pre-configured URLs
- 📅 **Railway Cron scheduling** - Reliable scheduled updates via Railway's cron service
- 🔑 **API key protected** - Manual refresh requires authentication
- ⚡ **1-hour caching** - Balances freshness with server load
- 📰 **Seattle Times optimized** - Custom selectors for accurate scraping

## Supported Feeds

This service is configured to work ONLY with these feeds:

- `https://www.seattletimes.com/sports/washington-huskies-football/`
- `https://www.seattletimes.com/sports/mariners/`

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

Service information and allowed feeds

### `GET /health`

Health check endpoint

### `GET /feed?url={allowed_url}`

Get RSS feed (only works with whitelisted URLs)

**Example:**

```bash
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/"
```

### `POST /refresh`

Manually refresh feeds (requires API key)

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

## Deployment to Railway

### Web Service Setup

1. **Push to GitHub:**

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. **Configure Railway Web Service:**
   - Create new project on Railway
   - Connect your GitHub repository
   - Railway will auto-detect Node.js
   - Start command: `npm start` (default)

3. **Set Environment Variables:**
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

## Update Schedule

- **Automatic:** Configured via Railway Cron (recommended: daily at 6 AM PST using `0 13 * * *`)
- **Manual:** Use the `/refresh` endpoint with your API key
- **Cache Duration:** 1 hour

## Tech Stack

- **Fastify** - High-performance web framework
- **Puppeteer** - Headless Chrome for JavaScript-rendered pages
- **Cheerio** - Server-side DOM manipulation
- **Railway Cron** - Scheduled tasks
- **RSS** - RSS 2.0 feed generation
- **Node-Cache** - In-memory caching

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
