# RSS Feed Generator

A secure, whitelisted RSS feed generator for Seattle Times sports sections with automatic daily updates.

## Features

- 🔒 **Whitelisted feeds only** - Restricted to pre-configured URLs
- 📅 **Daily auto-refresh** - Updates at 6 AM PST
- 🔑 **API key protected** - Manual refresh requires authentication
- ⚡ **24-hour caching** - Reduces server load
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

**⚠️ IMPORTANT:** 
- Generate a secure API key for production: `openssl rand -base64 32`
- Never commit your `.env` file to version control
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

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. **Configure Railway:**
   - Create new project on Railway
   - Connect your GitHub repository
   - Railway will auto-detect Node.js

3. **Set Environment Variables in Railway:**
   - `BASE_URL` - Your Railway app URL (e.g., `https://your-app.up.railway.app`)
   - `API_KEY` - Your secure API key (generate with `openssl rand -base64 32`)
   - `PORT` - Leave empty (Railway sets this automatically)

4. **Deploy:**
   - Railway will automatically deploy on push

## Update Schedule

- **Automatic:** Daily at 6 AM PST
- **Manual:** Use the `/refresh` endpoint with your API key
- **Cache Duration:** 24 hours

## Security Features

- ✅ URL whitelist enforcement
- ✅ API key authentication for manual refresh
- ✅ No arbitrary URL scraping
- ✅ Environment-based configuration

## Tech Stack

- **Fastify** - High-performance web framework
- **Puppeteer** - Headless Chrome for JavaScript-rendered pages
- **Cheerio** - Server-side DOM manipulation
- **Node-Cron** - Scheduled tasks
- **RSS** - RSS 2.0 feed generation
- **Node-Cache** - In-memory caching