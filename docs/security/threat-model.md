# RSS Feed Generator threat model

## Protected assets and boundaries

Protected assets are refresh credentials, provider credentials, cached feed data, Railway
storage, service availability, and the local/private network reachable by the server and
browser. Feed URLs, redirects, HTML, API responses, article metadata, and refresh requests
are untrusted.

## Current controls and known gaps

`server.ts` checks configured feed URLs and the refresh API key, with an in-process
refresh lock. `lib/feed-store.ts` and `lib/article-store.ts` save via temporary
files and rename. `article-source.ts` and `scraper.ts` also enforce the registry
at their own entry points; enrichment and main-frame redirects stay on the exact
registered HTTPS origin or explicit canonical `pageOrigins` registry entries
(currently the Red Team source moving to `www.anthropic.com`). Subresources can use public HTTPS hosts but cannot reach
private/special addresses, use credentials, or use nonstandard ports.

`public-request.ts` validates all OS DNS answers and pins them into the actual
HTTP/TLS lookup while preserving Host, SNI and certificate identity. Every hop is
checked. Requests have a 15-second deadline, 16 KiB headers, 64 KiB outbound bodies,
and 4 MiB raw/decoded response bounds, including gzip, deflate and Brotli. APIs
retain their fixed endpoints/methods and reject redirects to another origin.

Chromium requests are fulfilled through this transport. A live, owned deny-only
proxy blocks traffic that is not intercepted, removes Chromium's implicit
loopback bypass, and is paired with disabled browser DNS/QUIC and non-proxied
WebRTC UDP through the owned profile preference (the launch flag alone does not
enforce this in full Chrome). Fresh contexts bypass service workers and cache. JavaScript hydration
is preserved, but frames, images, media, fonts and pings are blocked. Web-security
and site isolation remain enabled; a browser-enforced CSP sandbox prevents popups,
frames, workers and plugins. DOM snapshots use an isolated DevTools world and a
defensive Node byte check. Root-run Railway still needs `--no-sandbox`.

Page limits are two active/sixteen queued, four concurrent requests each/eight
globally, 128 requests, five redirect hops, 24 MiB combined raw/decoded bytes,
a 4 MiB serialized DOM and a 30-second deadline. Cancellation closes the context;
a two-second close watchdog kills the owned browser if necessary. At most two
uncancellable OS lookups remain active, and late answers cannot connect.

These controls do not replace an OS sandbox, a maintained Chromium image or
container memory/CPU limits. The 128 MiB JS-isolate heap cap does not bound native
renderer memory, and DOM sizing occurs after script execution. There is no new
global enrichment-job deadline or refresh rate limiter. A compromised upstream
can still supply false content within the allowed public-network and size bounds.

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
