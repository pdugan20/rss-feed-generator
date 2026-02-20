import 'dotenv/config';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import scraper from './lib/scraper';
import feedGenerator from './lib/feed-generator';
import cache from './lib/cache';
import feedStore from './lib/feed-store';
import { feedUrls, feeds } from './lib/feeds';
import { enrichArticles } from './lib/enricher';
import articleStore from './lib/article-store';
import type { FeedFormat, GeneratedFeeds } from './lib/types';

const ALLOWED_FEEDS: string[] = feedUrls;
const VALID_FORMATS: FeedFormat[] = ['rss', 'atom', 'json'];

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

      return {
        label: feed.label,
        url: feed.url,
        extractor: feed.extractor,
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
      feeds: feedStatus,
    };
  });

  // Manual refresh endpoint (protected with API key)
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = (request.headers as Record<string, string>)['api_key'];
    const { url, force } = (request.body as { url?: string; force?: boolean }) || {};

    // Check API key
    const validApiKey = process.env.API_KEY || 'your-secret-api-key';
    if (apiKey !== validApiKey) {
      return reply.code(401).send({
        error: 'Invalid or missing API key',
        hint: 'Include api_key in headers',
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
        const cacheKey = `feed:${url}`;
        cache.del(cacheKey);

        const { articles, pageTitle } = await scraper.scrapeArticles(url);
        if (articles && articles.length > 0) {
          await enrichArticles(url, articles);
          const generatedFeeds = await feedGenerator.generateFeeds(url, articles, pageTitle);
          cache.set(cacheKey, generatedFeeds);
          feedStore.set(url, generatedFeeds, articles.length);

          return {
            status: 'success',
            message: `Feed refreshed: ${url}`,
            articles_count: articles.length,
            cached_until: new Date(Date.now() + 86400000).toISOString(),
          };
        } else {
          return reply.code(404).send({
            error: 'No articles found',
            url,
          });
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
            const cacheKey = `feed:${feedUrl}`;
            cache.del(cacheKey);

            const { articles, pageTitle } = await scraper.scrapeArticles(feedUrl);

            if (articles && articles.length > 0) {
              await enrichArticles(feedUrl, articles);
              const generatedFeeds = await feedGenerator.generateFeeds(
                feedUrl,
                articles,
                pageTitle
              );
              cache.set(cacheKey, generatedFeeds);
              feedStore.set(feedUrl, generatedFeeds, articles.length);

              results.push({
                url: feedUrl,
                status: 'success',
                articles_count: articles.length,
              });
            } else {
              results.push({
                url: feedUrl,
                status: 'error',
                message: 'No articles found',
              });
            }
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
        const cacheKey = `feed:${url}`;
        const cached = cache.get<GeneratedFeeds>(cacheKey);

        if (cached) {
          fastify.log.info(`Serving memory-cached feed for ${url} (${format})`);
          reply.header('Content-Type', feedGenerator.getContentType(format));
          reply.header('X-Cache', 'HIT');
          return reply.send(cached[format]);
        }

        // Check disk cache
        const diskEntry = feedStore.get(url);
        if (diskEntry && !feedStore.isStale(url)) {
          fastify.log.info(`Serving disk-cached feed for ${url} (${format})`);
          cache.set(cacheKey, diskEntry.feeds);
          reply.header('Content-Type', feedGenerator.getContentType(format));
          reply.header('X-Cache', 'DISK');
          return reply.send(diskEntry.feeds[format]);
        }

        fastify.log.info(`Scraping ${url}`);
        const { articles, pageTitle } = await scraper.scrapeArticles(url);

        if (!articles || articles.length === 0) {
          return reply.code(404).send({
            error: 'No articles found at the specified URL',
            url,
          });
        }

        await enrichArticles(url, articles);
        const generatedFeeds = await feedGenerator.generateFeeds(url, articles, pageTitle);

        cache.set(cacheKey, generatedFeeds);
        feedStore.set(url, generatedFeeds, articles.length);

        reply.header('Content-Type', feedGenerator.getContentType(format));
        reply.header('X-Cache', 'MISS');
        return reply.send(generatedFeeds[format]);
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

export { buildApp, ALLOWED_FEEDS };
