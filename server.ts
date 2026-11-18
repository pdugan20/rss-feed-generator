import 'dotenv/config';
import { createHash } from 'crypto';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import feedGenerator from './lib/feed-generator';
import cache from './lib/cache';
import feedStore from './lib/feed-store';
import { feedUrls, feeds, getFeedConfig } from './lib/feeds';
import articleStore from './lib/article-store';
import { feedHealth, isHealthy } from './lib/feed-health';
import { NoArticlesError, refreshFeed } from './lib/feed-refresh';
import type { FeedFormat, GeneratedFeeds } from './lib/types';

function generateETag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

const ALLOWED_FEEDS: string[] = feedUrls;
const VALID_FORMATS: FeedFormat[] = ['rss', 'atom', 'json'];
const REFRESH_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
// After a failed on-demand refresh, serve the last good copy for this long
// before scraping again, so feed reader polling does not hammer a broken source.
const FAILED_REFRESH_BACKOFF_MS = 15 * 60 * 1000;

function latest(...dates: (string | null | undefined)[]): string | null {
  const times = dates.filter((d): d is string => !!d && !isNaN(new Date(d).getTime()));
  return times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

interface RefreshLock {
  active: boolean;
  startedAt: number;
}

const refreshLock: RefreshLock = { active: false, startedAt: 0 };

function isRefreshLocked(): boolean {
  if (!refreshLock.active) return false;
  // Auto-expire stale locks (e.g. process survived but handler crashed)
  if (Date.now() - refreshLock.startedAt > REFRESH_LOCK_TIMEOUT_MS) {
    refreshLock.active = false;
    return false;
  }
  return true;
}

function acquireRefreshLock(): boolean {
  if (isRefreshLocked()) return false;
  refreshLock.active = true;
  refreshLock.startedAt = Date.now();
  return true;
}

function releaseRefreshLock(): void {
  refreshLock.active = false;
  refreshLock.startedAt = 0;
}

function parseFormat(value: string | undefined): FeedFormat {
  if (value && VALID_FORMATS.includes(value as FeedFormat)) {
    return value as FeedFormat;
  }
  return 'rss';
}

interface BuildAppOptions {
  logger?: boolean;
}

function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const fastify = Fastify({
    logger: opts.logger !== undefined ? opts.logger : true,
    trustProxy: true,
  });

  fastify.register(cors, {
    origin: true,
  });

  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const examples: Record<string, string> = {};
    for (const feed of feeds) {
      examples[feed.label] = `/feed?url=${encodeURIComponent(feed.url)}`;
    }

    return {
      service: 'RSS Feed Generator',
      endpoints: {
        '/feed': 'Get feed (query params: url, format=rss|atom|json)',
        '/health': 'Health check',
        '/status': 'Per-feed cache status',
        '/refresh': 'Manual refresh (POST, requires API key)',
      },
      allowed_feeds: ALLOWED_FEEDS,
      formats: {
        rss: 'RSS 2.0 (default)',
        atom: 'Atom 1.0',
        json: 'JSON Feed 1.0',
      },
      examples,
      refresh_schedule: 'Daily at 6 AM PST',
    };
  });

  fastify.get('/health', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      has_api_key: !!process.env.API_KEY,
      api_key_length: process.env.API_KEY ? process.env.API_KEY.length : 0,
    };
  });

  fastify.get('/status', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const feedStatus = feeds.map((feed) => {
      const cacheKey = `feed:${feed.url}`;
      const memoryCached = !!cache.get(cacheKey);
      const diskMeta = feedStore.getMetadata(feed.url);
      const diskCached = diskMeta !== null;
      const diskStale = diskCached ? feedStore.isStale(feed.url) : null;
      const health = feedHealth.get(feed.url);
      const lastSuccessAt = latest(health?.lastSuccessAt, diskMeta?.cachedAt);

      return {
        label: feed.label,
        url: feed.url,
        extractor: feed.extractor,
        healthy: isHealthy(lastSuccessAt),
        lastSuccessAt,
        lastAttemptAt: health?.lastAttemptAt ?? null,
        lastError: health?.lastError ?? null,
        cached: memoryCached || (diskCached && !diskStale),
        memory: memoryCached,
        disk: diskCached,
        diskStale,
        diskCachedAt: diskMeta?.cachedAt ?? null,
        diskArticleCount: diskMeta?.articleCount ?? null,
      };
    });

    const allCached = feedStatus.every((f) => f.cached);

    return {
      status: allCached ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      failing: feedStatus.filter((f) => !f.healthy).map((f) => f.label),
      feeds: feedStatus,
    };
  });

  // Manual refresh endpoint (protected with API key)
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = (request.headers as Record<string, string>)['api_key'];
    const { url, force } = (request.body as { url?: string; force?: boolean }) || {};

    // Check API key
    const validApiKey = process.env.API_KEY;
    if (!validApiKey || apiKey !== validApiKey) {
      return reply.code(401).send({
        error: 'Invalid or missing API key',
        hint: 'Include api_key in headers',
      });
    }

    // Prevent concurrent refreshes from overloading the server
    if (!acquireRefreshLock()) {
      const elapsed = Math.round((Date.now() - refreshLock.startedAt) / 1000);
      return reply.code(409).send({
        error: 'A refresh is already in progress',
        started_seconds_ago: elapsed,
        hint: 'Wait for the current refresh to complete before starting another',
      });
    }

    try {
      // Clear cached reading times to force re-enrichment
      if (force) {
        const cleared = articleStore.clearReadingTimes();
        articleStore.save();
        console.log(`Force refresh: cleared ${cleared} cached reading times`);
      }

      if (url) {
        // Refresh specific feed if URL provided
        if (!ALLOWED_FEEDS.includes(url)) {
          return reply.code(403).send({
            error: 'This feed URL is not allowed',
            allowed_feeds: ALLOWED_FEEDS,
          });
        }

        // Clear cache and refresh specific feed
        cache.del(`feed:${url}`);

        try {
          const { articleCount } = await refreshFeed(url);
          return {
            status: 'success',
            message: `Feed refreshed: ${url}`,
            articles_count: articleCount,
            cached_until: new Date(Date.now() + 86400000).toISOString(),
          };
        } catch (error) {
          if (!(error instanceof NoArticlesError)) throw error;
          return reply.code(404).send({ error: 'No articles found', url });
        }
      } else {
        // Refresh all allowed feeds
        const results: {
          url: string;
          status: string;
          articles_count?: number;
          message?: string;
        }[] = [];

        for (const feedUrl of ALLOWED_FEEDS) {
          try {
            cache.del(`feed:${feedUrl}`);
            const { articleCount } = await refreshFeed(feedUrl);
            results.push({ url: feedUrl, status: 'success', articles_count: articleCount });
          } catch (error) {
            results.push({
              url: feedUrl,
              status: 'error',
              message: (error as Error).message,
            });
          }
        }

        return {
          status: 'success',
          message: 'All feeds refreshed',
          results,
          cached_until: new Date(Date.now() + 86400000).toISOString(),
        };
      }
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to refresh feed',
        message: (error as Error).message,
      });
    } finally {
      releaseRefreshLock();
    }
  });

  fastify.get(
    '/feed',
    async (
      request: FastifyRequest<{ Querystring: { url?: string; format?: string } }>,
      reply: FastifyReply
    ) => {
      const { url, format: formatParam } = request.query;
      const format = parseFormat(formatParam);

      if (!url) {
        return reply.code(400).send({
          error: 'URL parameter is required',
          example: '/feed?url=https://www.seattletimes.com/sports/mariners/',
          formats: 'rss (default), atom, json',
        });
      }

      // Check if URL is in whitelist
      if (!ALLOWED_FEEDS.includes(url)) {
        return reply.code(403).send({
          error: 'This feed URL is not allowed',
          allowed_feeds: ALLOWED_FEEDS,
        });
      }

      try {
        const config = getFeedConfig(url);
        const cacheTtlMs = config?.cacheTtlMs;
        const cacheMaxAgeSec = cacheTtlMs ? Math.round(cacheTtlMs / 1000) : 86400;
        const cacheKey = `feed:${url}`;

        // Helper: set caching headers and handle conditional requests
        const sendFeed = (content: string, cacheSource: string) => {
          const etag = generateETag(content);
          const clientETag = request.headers['if-none-match'];
          if (clientETag === etag) {
            return reply.code(304).send();
          }

          reply.header('Content-Type', feedGenerator.getContentType(format));
          reply.header('X-Cache', cacheSource);
          reply.header('ETag', etag);
          reply.header('Last-Modified', new Date().toUTCString());
          reply.header('Cache-Control', `public, max-age=${Math.min(cacheMaxAgeSec, 300)}`);
          return reply.send(content);
        };

        const cached = cache.get<GeneratedFeeds>(cacheKey);
        if (cached) {
          fastify.log.info(`Serving memory-cached feed for ${url} (${format})`);
          return sendFeed(cached[format], 'HIT');
        }

        // Check disk cache with per-feed TTL
        const diskEntry = feedStore.get(url);
        if (diskEntry && !feedStore.isStale(url, cacheTtlMs)) {
          fastify.log.info(`Serving disk-cached feed for ${url} (${format})`);
          cache.set(cacheKey, diskEntry.feeds);
          return sendFeed(diskEntry.feeds[format], 'DISK');
        }

        // A recent refresh already failed: keep serving the last good copy.
        const health = feedHealth.get(url);
        if (
          diskEntry &&
          health?.lastError &&
          Date.now() - new Date(health.lastAttemptAt).getTime() < FAILED_REFRESH_BACKOFF_MS
        ) {
          return sendFeed(diskEntry.feeds[format], 'STALE');
        }

        fastify.log.info(`Fetching ${url}`);
        try {
          const { feeds: generatedFeeds } = await refreshFeed(url);
          return sendFeed(generatedFeeds[format], 'MISS');
        } catch (error) {
          if (diskEntry) {
            fastify.log.warn(`Refresh failed for ${url}; serving last good copy`);
            return sendFeed(diskEntry.feeds[format], 'STALE');
          }
          if (error instanceof NoArticlesError) {
            return reply.code(404).send({
              error: 'No articles found at the specified URL',
              url,
            });
          }
          throw error;
        }
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to generate feed',
          message: (error as Error).message,
        });
      }
    }
  );

  return fastify;
}

if (require.main === module) {
  const start = async (): Promise<void> => {
    try {
      const port = Number(process.env.PORT) || 3000;
      const host = process.env.HOST || '0.0.0.0';
      const fastify = buildApp();

      await fastify.listen({ port, host });
      console.log(`Server running at http://${host}:${port}`);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  };
  start();
}

export { buildApp, ALLOWED_FEEDS, releaseRefreshLock };
