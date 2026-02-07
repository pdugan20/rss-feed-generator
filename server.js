require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const scraper = require('./lib/scraper');
const rssGenerator = require('./lib/rss-generator');
const cache = require('./lib/cache');

const ALLOWED_FEEDS = [
  'https://www.seattletimes.com/sports/washington-huskies-football/',
  'https://www.seattletimes.com/sports/mariners/',
];

function buildApp(opts = {}) {
  const fastify = Fastify({
    logger: opts.logger !== undefined ? opts.logger : true,
    trustProxy: true,
  });

  fastify.register(cors, {
    origin: true,
  });

  fastify.get('/', async (_request, _reply) => {
    return {
      service: 'RSS Feed Generator',
      endpoints: {
        '/feed': 'Get RSS feed (query param: url)',
        '/health': 'Health check',
        '/refresh': 'Manual refresh (POST, requires API key)',
      },
      allowed_feeds: ALLOWED_FEEDS,
      examples: {
        huskies: '/feed?url=https://www.seattletimes.com/sports/washington-huskies-football/',
        mariners: '/feed?url=https://www.seattletimes.com/sports/mariners/',
      },
      refresh_schedule: 'Daily at 6 AM PST',
    };
  });

  fastify.get('/health', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      has_api_key: !!process.env.API_KEY,
      api_key_length: process.env.API_KEY ? process.env.API_KEY.length : 0,
    };
  });

  // Debug endpoint to test date extraction
  fastify.get('/debug-dates', async (request, reply) => {
    const { url } = request.query;

    if (!url) {
      return reply.code(400).send({ error: 'URL parameter required' });
    }

    try {
      const { articles } = await scraper.scrapeArticles(url);
      const dateInfo = articles.slice(0, 5).map((article) => ({
        title: article.title.substring(0, 50),
        pubDate: article.pubDate,
        dateString: article.pubDate ? article.pubDate.toISOString() : 'null',
      }));

      return {
        url,
        articlesFound: articles.length,
        dateExtractionResults: dateInfo,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to scrape dates', message: error.message });
    }
  });

  // Manual refresh endpoint (protected with API key)
  fastify.post('/refresh', async (request, reply) => {
    const { api_key } = request.headers;
    const { url } = request.body || {};

    // Check API key
    const validApiKey = process.env.API_KEY || 'your-secret-api-key';
    if (api_key !== validApiKey) {
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
        const results = [];

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
              message: error.message,
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
        message: error.message,
      });
    }
  });

  fastify.get('/feed', async (request, reply) => {
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
        message: error.message,
      });
    }
  });

  return fastify;
}

if (require.main === module) {
  const start = async () => {
    try {
      const port = process.env.PORT || 3000;
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

module.exports = { buildApp, ALLOWED_FEEDS };
