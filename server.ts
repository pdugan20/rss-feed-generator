import 'dotenv/config';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import scraper from './lib/scraper';
import rssGenerator from './lib/rss-generator';
import cache from './lib/cache';
import { feedUrls, feeds } from './lib/feeds';

const ALLOWED_FEEDS: string[] = feedUrls;

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
        '/feed': 'Get RSS feed (query param: url)',
        '/health': 'Health check',
        '/status': 'Per-feed cache status',
        '/refresh': 'Manual refresh (POST, requires API key)',
      },
      allowed_feeds: ALLOWED_FEEDS,
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
      const cached = cache.get(cacheKey);
      return {
        label: feed.label,
        url: feed.url,
        extractor: feed.extractor,
        cached: !!cached,
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
    const { url } = (request.body as { url?: string }) || {};

    // Check API key
    const validApiKey = process.env.API_KEY || 'your-secret-api-key';
    if (apiKey !== validApiKey) {
      return reply.code(401).send({
        error: 'Invalid or missing API key',
        hint: 'Include api_key in headers',
      });
    }

    try {
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
          const rssFeed = rssGenerator.generateFeed(url, articles, pageTitle);
          cache.set(cacheKey, rssFeed);

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
              const rssFeed = rssGenerator.generateFeed(feedUrl, articles, pageTitle);
              cache.set(cacheKey, rssFeed);

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
    async (request: FastifyRequest<{ Querystring: { url?: string } }>, reply: FastifyReply) => {
      const { url } = request.query;

      if (!url) {
        return reply.code(400).send({
          error: 'URL parameter is required',
          example: '/feed?url=https://www.seattletimes.com/sports/mariners/',
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
        const cachedFeed = cache.get(cacheKey);

        if (cachedFeed) {
          fastify.log.info(`Serving cached feed for ${url}`);
          reply.header('Content-Type', 'application/rss+xml; charset=utf-8');
          reply.header('X-Cache', 'HIT');
          return reply.send(cachedFeed);
        }

        fastify.log.info(`Scraping ${url}`);
        const { articles, pageTitle } = await scraper.scrapeArticles(url);

        if (!articles || articles.length === 0) {
          return reply.code(404).send({
            error: 'No articles found at the specified URL',
            url,
          });
        }

        const rssFeed = rssGenerator.generateFeed(url, articles, pageTitle);

        cache.set(cacheKey, rssFeed);

        reply.header('Content-Type', 'application/rss+xml; charset=utf-8');
        reply.header('X-Cache', 'MISS');
        return reply.send(rssFeed);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to generate RSS feed',
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
