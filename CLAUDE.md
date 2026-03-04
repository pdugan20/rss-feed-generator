# RSS Feed Generator

Secure, whitelisted RSS feed generator with pluggable per-site extractors and
automatic daily updates. TypeScript/Fastify backend deployed on Railway.

## Common Commands

```bash
# Development
npm run dev              # Start dev server with tsx watch
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled server (dist/server.js)

# Testing
npm test                 # Run test suite
npm run test:ci          # Run tests with coverage (CI mode)

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without changes
npm run typecheck        # Type check without emitting (tsc --noEmit)
```

## Project Structure

```text
lib/
├── types.ts              # Shared interfaces (Article, FeedConfig, Extractor)
├── feeds.ts              # Feed URL + extractor mappings (source of truth)
├── extract.ts            # Extractor registry + shared helpers
├── extractors/           # Per-site extraction logic
│   ├── seattle-times.ts  # Seattle Times extraction
│   ├── anthropic.ts      # Anthropic engineering blog
│   ├── claude-blog.ts    # Claude blog (with enrichment)
│   └── generic.ts        # Generic fallback
├── scraper.ts            # Browser management (Puppeteer)
├── feed-generator.ts     # Multi-format feed generation (RSS, Atom, JSON)
├── feed-store.ts         # Disk-based feed cache
├── enricher.ts           # Article enrichment pipeline
├── article-store.ts      # Persistent article metadata
├── cache.ts              # In-memory cache (24h TTL)
└── scheduler.ts          # Scheduled feed refresh

server.ts                 # Fastify server entry point
__tests__/                # Jest test suite
scripts/                  # Deploy verification scripts
```

## Architecture

- **Server**: Fastify web framework with CORS support
- **Scraping**: Puppeteer for JS-rendered pages, Cheerio for DOM parsing
- **Caching**: 3-tier (in-memory + disk + on-demand scraping)
- **Feeds**: RSS 2.0, Atom 1.0, JSON Feed 1.0 via `feed` library
- **Deployment**: Railway with cron service for scheduled refreshes

## Adding a New Feed

Requires exactly 4 file changes (enforced by architecture tests):

1. Create `lib/extractors/<name>.ts` with `extract` function
2. Add entry to `lib/feeds.ts`
3. Register in `lib/extract.ts`
4. Create `__tests__/lib/extractors/<name>.test.ts`

## Key Patterns

- Whitelisted feeds only — restricted to pre-configured URLs in `lib/feeds.ts`
- API key required for `/refresh` endpoint
- Disk cache at `DATA_DIR` survives deploys (Railway volume at `/app/data`)
- Pre-commit hooks lint and format staged files; pre-push hooks run typecheck + tests
