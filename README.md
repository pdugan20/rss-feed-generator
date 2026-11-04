# rss-feed-generator

[![CI](https://github.com/pdugan20/rss-feed-generator/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/pdugan20/rss-feed-generator/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/pdugan20/rss-feed-generator)](LICENSE)

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
npm run test:browser  # Compile and exercise owned, offline Chromium fixtures
```

Pre-commit hooks lint and format staged files. Pre-push hooks run typecheck and tests.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Railway setup, cron configuration, and deploy verification.

## Fetch and browser boundaries

Only registry feeds can start a scrape. Enrichment pages and main-frame redirects
must stay on that feed's exact HTTPS origin or an explicit `pageOrigins` entry
in the registry. The Red Team source's canonical redirect to `www.anthropic.com`
is listed there; no hostname-suffix wildcard is used. Public HTTPS CDN scripts, styles and fetch/XHR
requests can still hydrate the page. Images, fonts, media, embedded frames and
background pings are unnecessary for extraction and are blocked.

All allowed browser requests are fulfilled by `lib/public-request.ts`, which
checks every DNS answer and pins the vetted addresses into the actual Node socket.
Chromium has a local deny-only proxy (including loopback), DNS disabled, QUIC
disabled, and an owned-profile WebRTC preference blocking non-proxied UDP to block
traffic outside interception. The launch flag alone is insufficient in full Chrome.
Each page uses a fresh browser context with service workers bypassed and cache
disabled. Browser-enforced CSP denies popups, frames, workers and plugins; the DOM
snapshot runs in an isolated DevTools world with a defensive Node byte check. Same-origin checks and Chromium site isolation remain enabled. The
root-run Railway image still requires `--no-sandbox`; these network controls are
not an operating-system sandbox or protection against a Chromium exploit.

Limits: two active pages, sixteen queued pages, a 30-second page deadline,
128 requests per page, four concurrent requests per page (eight globally),
16 KiB request/response headers, 64 KiB request bodies, 4 MiB raw and decoded
response bodies, 24 MiB combined raw/decoded bytes per page, and a 4 MiB serialized
rendered document. Individual requests have a 15-second deadline covering queued
work, DNS, headers and body. Redirects allow at most five hops. API fetchers use
the same transport and keep redirects on their original HTTPS origin, retaining
AP's POST body and Hacker News's GET query.

Abort closes the page context immediately; a stuck close kills the owned browser
after two seconds. OS DNS calls cannot be cancelled: at most two remain active
until they settle, and an expired caller cannot connect later. Chromium's JS heap
is capped at 128 MiB per isolate; this is not a total process or native-memory cap.
Rendered-DOM sizing happens after scripts run, so hostile renderer allocations
still need the platform's container limits. This change does not add a refresh
rate limiter or a global enrichment-job deadline.

`npm run test:browser` requires the Chrome revision pinned by the locked Puppeteer
package. Install it with `./node_modules/.bin/puppeteer browsers install chrome`
(add `--install-deps` on Linux). CI runs this check, including live headless
JavaScript hydration, private HTTP/WebSocket and direct STUN fixtures, the proxy
backstop without interception, redirect/fanout/DOM limits and context cleanup.
Wire tests also require `openssl` and generate temporary test certificates.
No fixture contacts a real feed or calls `/refresh`.
