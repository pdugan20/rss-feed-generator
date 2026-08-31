# RSS Feed Generator threat model

## Protected assets and boundaries

Protected assets are refresh credentials, provider credentials, cached feed data, Railway
storage, service availability, and the local/private network reachable by the server and
browser. Feed URLs, redirects, HTML, API responses, article metadata, and refresh requests
are untrusted.

## Required controls

- Fetch only explicitly configured sources and revalidate every redirect and resolved
  address so arbitrary or private-network destinations cannot be reached.
- Require refresh authorization and bound refresh, scraping, and enrichment work by
  timeout, response size, concurrency, and retry policy.
- Encode untrusted titles, descriptions, HTML, and URLs safely for RSS, Atom, JSON Feed,
  and rendered diagnostic output.
- Write persistent cache state atomically and tolerate interrupted or repeated refreshes.
- Keep API keys and raw upstream payloads out of logs, fixtures, errors, and generated feeds.

Update this model when a source type, endpoint, authentication method, browser capability,
cache, scheduler, or deployment boundary changes.
