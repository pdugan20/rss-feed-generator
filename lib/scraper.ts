import fs from 'fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { Browser, BrowserContext, HTTPRequest } from 'puppeteer' with {
  'resolution-mode': 'import',
};
import * as cheerio from 'cheerio';
import { getExtractor } from './extract';
import { getFeedConfig } from './feeds';
import { checkedUrl, requestPublic, MAX_REDIRECTS } from './public-request';
import { BoundedGate } from './bounded-gate';
import articleStore from './article-store';
import type { Article } from './types';

interface ScrapeResult {
  articles: Article[];
  pageTitle: string;
}
const PAGE_TIMEOUT_MS = 30_000;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_PAGE_BYTES = 24 * 1024 * 1024;
const MAX_PAGE_REQUESTS = 128;
const PAGE_TYPES = new Set(['document', 'script', 'stylesheet', 'xhr', 'fetch', 'preflight']);
const CHROMIUM_PATHS = [
  '/root/.nix-profile/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
];
const pages = new BoundedGate(2, 16);

function checkedPageUrl(value: string, feedUrl: string): URL {
  const config = getFeedConfig(feedUrl);
  if (!config || config.type === 'api') throw new Error('Feed is not registered for scraping');
  const url = checkedUrl(value);
  const feed = new URL(feedUrl);
  // Canonical cross-origin migrations are explicit registry data, never inferred
  // from a common suffix or an upstream redirect.
  if (url.origin !== feed.origin && !config.pageOrigins?.includes(url.origin))
    throw new Error('Page destination is outside the registered feed origin');
  return url;
}

class Scraper {
  private browser: Browser | null = null;
  private starting: Promise<Browser> | null = null;
  private guard: Server | null = null;

  private async initBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      // All browser network not fulfilled by interception goes to this deny-only
      // proxy. Own a live socket instead of assuming some unused port is closed.
      const guard = createServer((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) => {
        guard.once('error', reject);
        guard.listen(0, '127.0.0.1', resolve);
      });
      this.guard = guard;
      const profile = fs.mkdtempSync(join(tmpdir(), 'rss-browser-'));
      try {
        fs.mkdirSync(join(profile, 'Default'));
        // Full Chrome reads this profile preference; the similarly named headless
        // shell flag alone does not enforce it in normal Chrome.
        fs.writeFileSync(
          join(profile, 'Default', 'Preferences'),
          JSON.stringify({
            webrtc: { ip_handling_policy: 'disable_non_proxied_udp' },
            profile: { default_content_setting_values: { popups: 2 } },
          })
        );
        const { default: puppeteer } = await import('puppeteer');
        const executablePath =
          process.env.PUPPETEER_EXECUTABLE_PATH || CHROMIUM_PATHS.find((p) => fs.existsSync(p));
        const port = (guard.address() as { port: number }).port;
        const browser = await puppeteer.launch({
          headless: true,
          userDataDir: profile,
          ignoreDefaultArgs: ['--disable-popup-blocking'],
          executablePath,
          timeout: 15_000,
          protocolTimeout: 10_000,
          args: [
            // Railway's Nixpacks image runs as root. Keep only its required sandbox
            // exception; normal Chromium same-origin and site isolation stay enabled.
            ...(process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-quic',
            `--proxy-server=http://127.0.0.1:${port}`,
            '--proxy-bypass-list=<-loopback>',
            '--host-resolver-rules=MAP * ~NOTFOUND',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            '--js-flags=--max-old-space-size=128',
          ],
        });
        browser.process()?.once('exit', () => fs.rmSync(profile, { recursive: true, force: true }));
        this.browser = browser;
        browser.once('disconnected', () => {
          if (this.browser === browser) this.browser = null;
          guard.close();
        });
        return browser;
      } catch (error) {
        guard.close();
        fs.rmSync(profile, { recursive: true, force: true });
        throw error;
      }
    })();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async loadHtml(value: string, feedUrl = value): Promise<string> {
    const url = checkedPageUrl(value, feedUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(new Error('Page deadline exceeded')),
      PAGE_TIMEOUT_MS
    );
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(ctrl.signal.reason);
      ctrl.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    try {
      return await Promise.race([
        pages.run(ctrl.signal, async () => {
          const browser = await this.initBrowser();
          ctrl.signal.throwIfAborted();
          let context: BrowserContext | undefined;
          let closing: Promise<void> | undefined;
          const closeContext = (): Promise<void> => {
            if (!context) return Promise.resolve();
            if (!closing)
              closing = (async () => {
                let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
                try {
                  await Promise.race([
                    context!.close(),
                    new Promise<void>((resolve) => {
                      cleanupTimer = setTimeout(() => {
                        browser.process()?.kill('SIGKILL');
                        resolve();
                      }, 2000);
                    }),
                  ]);
                } finally {
                  clearTimeout(cleanupTimer);
                }
              })();
            return closing;
          };
          const stop = () => {
            void closeContext().catch(() => {
              browser.process()?.kill('SIGKILL');
            });
          };
          try {
            context = await browser.createBrowserContext();
            ctrl.signal.addEventListener('abort', stop, { once: true });
            ctrl.signal.throwIfAborted();
            const page = await context.newPage();
            await page.setBypassServiceWorker(true);
            await page.setCacheEnabled(false);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await page.setRequestInterception(true);
            const network = new BoundedGate(4, MAX_PAGE_REQUESTS);
            let requests = 0;
            let bytes = 0;
            let fatal: Error | undefined;
            const fail = (message: string) => {
              fatal = new Error(message);
              ctrl.abort(fatal);
            };
            const handle = async (request: HTTPRequest) => {
              if (request.isInterceptResolutionHandled()) return;
              if (++requests > MAX_PAGE_REQUESTS) {
                fail('Page request limit exceeded');
                return;
              }
              try {
                ctrl.signal.throwIfAborted();
                const target = checkedUrl(request.url());
                if (!PAGE_TYPES.has(request.resourceType()) || request.frame() !== page.mainFrame())
                  throw new Error('Resource type is not needed for extraction');
                if (request.isNavigationRequest()) checkedPageUrl(target.href, feedUrl);
                if (request.redirectChain().length > MAX_REDIRECTS)
                  throw new Error('Page redirect limit exceeded');
                if (target.protocol !== 'https:') throw new Error('Page requests require HTTPS');
                await network.run(ctrl.signal, async () => {
                  const body = request.hasPostData() ? await request.fetchPostData() : undefined;
                  const response = await requestPublic(target.href, {
                    method: request.method(),
                    headers: request.headers(),
                    body,
                    signal: ctrl.signal,
                    onBytes: (count) => {
                      bytes += count;
                      if (bytes > MAX_PAGE_BYTES) {
                        fail('Page byte limit exceeded');
                        throw fatal;
                      }
                    },
                  });
                  if (response.headers.location) {
                    const next = checkedUrl(new URL(response.headers.location, target).href);
                    if (next.protocol !== 'https:') throw new Error('HTTPS downgrade rejected');
                    if (request.isNavigationRequest()) checkedPageUrl(next.href, feedUrl);
                  }
                  ctrl.signal.throwIfAborted();
                  if (request.isNavigationRequest()) {
                    const upstream = response.headers['content-security-policy'];
                    response.headers['content-security-policy'] = [
                      ...(Array.isArray(upstream) ? upstream : upstream ? [upstream] : []),
                      "sandbox allow-scripts allow-same-origin; frame-src 'none'; worker-src 'none'; object-src 'none'",
                    ];
                  }
                  await request.respond({
                    status: response.status,
                    headers: response.headers,
                    contentType: String(response.headers['content-type'] ?? ''),
                    body: response.body,
                  });
                });
              } catch {
                // Failing a subresource is normal (images/analytics/third-party hosts).
                // A failed main navigation must not yield a plausible empty feed.
                if (request.isNavigationRequest() && request.frame() === page.mainFrame())
                  fail('Feed navigation was rejected or failed');
                if (!request.isInterceptResolutionHandled())
                  await request.abort('blockedbyclient').catch(() => {});
              }
            };
            page.on('request', (request) => {
              void handle(request).catch(() => fail('Page request failed'));
            });
            const response = await page.goto(url.href, {
              waitUntil: 'networkidle2',
              timeout: PAGE_TIMEOUT_MS,
            });
            if (!response?.ok()) throw new Error('Feed page returned an unsuccessful status');
            await delay(1000, undefined, { signal: ctrl.signal });
            if (fatal) throw fatal;
            // Check inside Chromium before transferring a potentially huge serialized DOM.
            const client = await page.createCDPSession();
            let html: string;
            try {
              const { frameTree } = await client.send('Page.getFrameTree');
              const { executionContextId } = await client.send('Page.createIsolatedWorld', {
                frameId: frameTree.frame.id,
                worldName: 'rss-extraction',
              });
              const snapshot = await client.send('Runtime.evaluate', {
                contextId: executionContextId,
                returnByValue: true,
                timeout: 2000,
                expression: `(() => {
                  const html = document.documentElement.outerHTML;
                  if (new TextEncoder().encode(html).byteLength > ${MAX_DOCUMENT_BYTES}) throw new Error('Rendered document exceeds byte limit');
                  return html;
                })()`,
              });
              if (snapshot.exceptionDetails || typeof snapshot.result.value !== 'string')
                throw new Error('Rendered document exceeds byte limit or could not be read');
              html = snapshot.result.value;
              if (Buffer.byteLength(html) > MAX_DOCUMENT_BYTES)
                throw new Error('Rendered document exceeds byte limit');
            } finally {
              await client.detach().catch(() => {});
            }
            ctrl.signal.throwIfAborted();
            return html;
          } finally {
            ctrl.signal.removeEventListener('abort', rejectAbort);
            ctrl.abort(new Error('Page finished'));
            ctrl.signal.removeEventListener('abort', stop);
            await closeContext();
          }
        }),
        aborted,
      ]);
    } finally {
      clearTimeout(timer);
      ctrl.signal.removeEventListener('abort', rejectAbort);
    }
  }

  async scrapeArticles(url: string): Promise<ScrapeResult> {
    const html = await this.loadHtml(url);
    const $ = cheerio.load(html);

    const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || 'RSS Feed';

    const extractor = getExtractor(url);
    const articles = extractor.extract($, url);

    // Resolve pubDates: DOM date > stored date > first-seen (now)
    let needsSave = false;
    for (const article of articles) {
      if (article.pubDate) {
        // DOM provided a date — persist it
        const existing = articleStore.getPubDate(article.link);
        if (!existing || existing.getTime() !== article.pubDate.getTime()) {
          articleStore.setArticleData(article.link, {
            description: articleStore.getDescription(article.link) || '',
            readingTime: articleStore.getReadingTime(article.link),
            pubDate: article.pubDate,
          });
          needsSave = true;
        }
      } else {
        // No DOM date — fall back to stored date only.
        // If no stored date exists either, leave pubDate null so the
        // feed emits date_modified (not date_published). This prevents
        // undated articles from appearing "new" on every scrape.
        const stored = articleStore.getPubDate(article.link);
        if (stored) {
          article.pubDate = stored;
        }
        // else: leave article.pubDate as null — no reliable date exists
      }
    }
    if (needsSave) {
      articleStore.save();
    }

    return { articles, pageTitle };
  }

  async close(): Promise<void> {
    const browser = this.browser ?? (await this.starting);
    this.browser = null;
    if (browser) await browser.close();
    this.guard?.close();
    this.guard = null;
  }
}

export = new Scraper();
