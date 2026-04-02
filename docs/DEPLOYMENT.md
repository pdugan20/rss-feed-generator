# Deployment to Railway

## Web Service Setup

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

3. **Add Persistent Volume:**
   - In your Railway project, open the web service
   - Add a volume with mount path `/app/data`
   - This stores the disk-based feed cache and enriched article descriptions across deploys

## Cron Service Setup

The cron service triggers cache refresh by calling the web service's `/refresh` endpoint. It does not scrape directly — the web service handles scraping and populates both its in-memory and disk-based caches.

1. **Add Cron Service to Same Project:**
   - In your Railway project, click **+ Create**
   - Choose **GitHub Repo** and select the same repository
   - This creates a second service in your project

2. **Configure the Cron Service:**
   - Go to **Settings** tab
   - **Service Name:** `rss-update-cron` (or similar)
   - **Start Command:** `node dist/scripts/refresh-feeds.js`
   - **Cron Schedule:** `0 13 * * *` (6 AM PST in UTC)

3. **Set Environment Variables:**
   - Go to **Variables** tab
   - `BASE_URL` - The web service's public URL (e.g., `https://your-app.up.railway.app`)
   - `API_KEY` - Same API key as the web service

4. **Deploy:**
   - Railway will run the cron service on schedule
   - No volume needed — the cron service only makes an HTTP call

## Railway CLI (Optional)

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
- **Default Cache Duration:** 24 hours (in-memory) + persistent disk cache that survives restarts
- **Per-feed TTL:** API-based feeds (e.g., AP Photos) can configure shorter cache durations via `cacheTtlMs` in `lib/feeds.ts`

## Deploy Verification

After pushing to Railway, verify the deployment:

```bash
# Requires BASE_URL and API_KEY environment variables
scripts/verify-deploy.sh
```

The script checks `/status`, triggers `/refresh`, and validates each feed endpoint.
