# API Reference

## `GET /`

Service information, allowed feeds, available formats, and auto-generated examples.

## `GET /health`

Health check endpoint.

## `GET /status`

Per-feed cache status. Returns `"healthy"` when all feeds are cached, `"degraded"` when any are missing.

```bash
curl http://localhost:3000/status
```

## `GET /feed?url={allowed_url}&format={rss|atom|json}`

Get feed in the specified format (only works with whitelisted URLs).

| Parameter | Required | Default | Description                          |
| --------- | -------- | ------- | ------------------------------------ |
| `url`     | Yes      | -       | Whitelisted source URL               |
| `format`  | No       | `rss`   | Output format: `rss`, `atom`, `json` |

**Response headers:**

| Header          | Description                                                      |
| --------------- | ---------------------------------------------------------------- |
| `ETag`          | Content hash for conditional requests                            |
| `Last-Modified` | Timestamp of last feed generation                                |
| `Cache-Control` | `public, max-age=300` (5 min HTTP cache)                         |
| `X-Cache`       | `HIT` (memory), `DISK` (disk cache), or `MISS` (freshly fetched) |

Supports conditional requests via `If-None-Match` — returns `304 Not Modified` when content hasn't changed.

```bash
# RSS 2.0 (default)
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/"

# Atom 1.0
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/&format=atom"

# JSON Feed 1.0
curl "http://localhost:3000/feed?url=https://www.seattletimes.com/sports/mariners/&format=json"

# Conditional request (returns 304 if unchanged)
curl -H 'If-None-Match: "abc123"' "http://localhost:3000/feed?url=..."
```

## `POST /refresh`

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
