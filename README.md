# RSS Feed Generator

[![CI](https://github.com/pdugan20/rss-feed-generator/workflows/CI/badge.svg)](https://github.com/pdugan20/rss-feed-generator/actions)
[![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?logo=opensourceinitiative&logoColor=white)](https://opensource.org/licenses/MIT)

A secure, whitelisted feed generator with pluggable per-site extractors and automatic daily updates. Generates RSS 2.0, Atom 1.0, and JSON Feed 1.0 from websites that don't provide their own.

## Features

- **Multi-format output** - RSS 2.0, Atom 1.0, and JSON Feed 1.0 from a single source
- **Whitelisted feeds only** - Restricted to pre-configured URLs
- **Per-site extractors** - Dedicated scraping logic per website for accurate extraction
- **Article enrichment** - Optional per-article scraping for descriptions from individual pages
- **3-tier caching** - In-memory + disk + on-demand scraping; disk cache survives deploys
- **Health monitoring** - `/status` endpoint reports per-feed cache health

## Supported Feeds

| Feed                  | Source                                                                               | RSS                                                                                                                                                     | Category | Enriched |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| UW Huskies Football   | [seattletimes.com](https://www.seattletimes.com/sports/washington-huskies-football/) | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.seattletimes.com%2Fsports%2Fwashington-huskies-football%2F) | Sports   | No       |
| Mariners              | [seattletimes.com](https://www.seattletimes.com/sports/mariners/)                    | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.seattletimes.com%2Fsports%2Fmariners%2F)                    | Sports   | No       |
| Anthropic Engineering | [anthropic.com](https://www.anthropic.com/engineering)                               | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.anthropic.com%2Fengineering)                                | Tech     | No       |
| Claude Blog           | [claude.com](https://claude.com/blog)                                                | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fclaude.com%2Fblog)                                              | Tech     | Yes      |

All feeds support `?format=atom` and `?format=json` in addition to the default RSS 2.0.

## Quick Start

```bash
cp .env.example .env   # Configure API key and settings
npm install
npm run dev            # Start dev server with hot reloading
```

The server runs at `http://localhost:3000`. See [docs/API.md](docs/API.md) for endpoint details.

## Adding a New Feed

Each feed requires exactly 4 files (enforced by architecture tests):

| File                                      | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `lib/extractors/<name>.ts`                | Extractor with `extract($, url)` returning `Article[]` |
| `lib/feeds.ts`                            | Add `FeedConfig` entry (url, extractor, label)         |
| `lib/extract.ts`                          | Register extractor in the registry                     |
| `__tests__/lib/extractors/<name>.test.ts` | Tests against sample HTML fixtures                     |

For article enrichment, also export `enrichArticle($, url)` from the extractor.

## Development

```bash
npm run dev           # Start dev server with tsx watch
npm test              # Run test suite
npm run lint          # Run ESLint
npm run typecheck     # Type check without emitting
```

Pre-commit hooks lint and format staged files. Pre-push hooks run typecheck and tests.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Railway setup, cron configuration, and deploy verification.
