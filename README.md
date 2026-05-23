# RSS Feed Generator

[![CI](https://github.com/pdugan20/rss-feed-generator/workflows/CI/badge.svg)](https://github.com/pdugan20/rss-feed-generator/actions)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?logo=opensourceinitiative&logoColor=white)](https://opensource.org/licenses/MIT)

A secure, whitelisted feed generator with pluggable per-site extractors and automatic daily updates. Outputs RSS 2.0, Atom 1.0, and JSON Feed 1.0 — including Media RSS extensions for photo feeds — with 3-tier caching and ETag/304 support for efficient polling.

## Supported Feeds

| Feed                  | Source                                                                                                                    | RSS                                                                                                                                                                                                       | Category | Type   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| UW Huskies Football   | [seattletimes.com](https://www.seattletimes.com/sports/washington-huskies-football/)                                      | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.seattletimes.com%2Fsports%2Fwashington-huskies-football%2F)                                                   | Sports   | Scrape |
| Mariners              | [seattletimes.com](https://www.seattletimes.com/sports/mariners/)                                                         | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.seattletimes.com%2Fsports%2Fmariners%2F)                                                                      | Sports   | Scrape |
| Anthropic Engineering | [anthropic.com](https://www.anthropic.com/engineering)                                                                    | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.anthropic.com%2Fengineering)                                                                                  | Tech     | Scrape |
| Claude Blog           | [claude.com](https://claude.com/blog)                                                                                     | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fclaude.com%2Fblog)                                                                                                | Tech     | Scrape |
| AP Mariners Photos    | [newsroom.ap.org](https://newsroom.ap.org/editorial-photos-videos/search?query=Lindsey+Wasson&mediaType=photo&st=keyword) | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fnewsroom.ap.org%2Feditorial-photos-videos%2Fsearch%3Fquery%3DLindsey%2BWasson%26mediaType%3Dphoto%26st%3Dkeyword) | Sports   | API    |
| Anthropic Red Team    | [red.anthropic.com](https://red.anthropic.com)                                                                            | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fred.anthropic.com)                                                                                                | Tech     | Scrape |
| Anthropic News        | [anthropic.com/news](https://www.anthropic.com/news)                                                                      | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fwww.anthropic.com%2Fnews)                                                                                         | Tech     | Scrape |
| Hacker News Top       | [news.ycombinator.com/front](https://news.ycombinator.com/front)                                                          | [Subscribe](https://rss-feed-generator-production.up.railway.app/feed?url=https%3A%2F%2Fnews.ycombinator.com%2Ffront)                                                                                     | Tech     | API    |

All feeds support `?format=atom` and `?format=json` in addition to the default RSS 2.0. The AP Mariners Photos feed includes Media RSS extensions with image dimensions. The Hacker News Top feed returns the top 10 stories by points from the previous UTC day, sourced from the Algolia HN Search API.

## Quick Start

```bash
cp .env.example .env   # Configure API key and settings
npm install
npm run dev            # Start dev server with hot reloading
```

The server runs at `http://localhost:3000`. See [docs/API.md](docs/API.md) for endpoint details.

## Adding a New Feed

### Scrape-based feeds

Each feed requires exactly 4 files (enforced by architecture tests):

| File                                      | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `lib/extractors/<name>.ts`                | Extractor with `extract($, url)` returning `Article[]` |
| `lib/feeds.ts`                            | Add `FeedConfig` entry (url, extractor, label)         |
| `lib/extract.ts`                          | Register extractor in the registry                     |
| `__tests__/lib/extractors/<name>.test.ts` | Tests against sample HTML fixtures                     |

For article enrichment, also export `enrichArticle($, url)` from the extractor.

### API-based feeds

Same 4 files above (extractor can be a no-op stub), plus:

| File                                        | Purpose                                      |
| ------------------------------------------- | -------------------------------------------- |
| `lib/api-fetchers/<name>.ts`                | Fetcher implementing `ApiFetcher` interface  |
| `lib/api-fetchers/index.ts`                 | Register fetcher in the API fetcher registry |
| `__tests__/lib/api-fetchers/<name>.test.ts` | Tests with mocked API responses              |

Set `type: 'api'` in the `lib/feeds.ts` entry. Optional `cacheTtlMs` and `maxItems` can be configured per feed.

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
