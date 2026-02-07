import scraper from '../lib/scraper';
import cache from '../lib/cache';
import feedGenerator from '../lib/feed-generator';
import { buildApp, ALLOWED_FEEDS } from '../server';
import { feedUrls, feeds } from '../lib/feeds';
import type { FastifyInstance } from 'fastify';
import type { GeneratedFeeds } from '../lib/types';

jest.mock('../lib/scraper');
jest.mock('../lib/cache');
jest.mock('../lib/feed-generator');

const mockedScraper = jest.mocked(scraper);
const mockedCache = jest.mocked(cache);
const mockedFeedGenerator = jest.mocked(feedGenerator);

const TEST_API_KEY = 'test-api-key-12345';
const MARINERS_URL = 'https://www.seattletimes.com/sports/mariners/';

const MOCK_FEEDS: GeneratedFeeds = {
  rss: '<rss>test rss</rss>',
  atom: '<feed>test atom</feed>',
  json: '{"version":"https://jsonfeed.org/version/1","items":[]}',
};

let app: FastifyInstance;

beforeAll(() => {
  process.env.API_KEY = TEST_API_KEY;
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockedCache.get.mockReturnValue(undefined);
  mockedFeedGenerator.getContentType.mockImplementation((format) => {
    if (format === 'atom') return 'application/atom+xml; charset=utf-8';
    if (format === 'json') return 'application/feed+json; charset=utf-8';
    return 'application/rss+xml; charset=utf-8';
  });
  app = buildApp({ logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('ALLOWED_FEEDS', () => {
  test('matches feed config', () => {
    expect(ALLOWED_FEEDS).toEqual(feedUrls);
  });
});

describe('GET /', () => {
  test('returns service info', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.service).toBe('RSS Feed Generator');
    expect(body.allowed_feeds).toBeDefined();
    expect(body.endpoints).toBeDefined();
    expect(body.endpoints['/status']).toBeDefined();
  });

  test('lists available formats', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    const body = JSON.parse(response.body);
    expect(body.formats).toBeDefined();
    expect(body.formats.rss).toContain('default');
    expect(body.formats.atom).toBeDefined();
    expect(body.formats.json).toBeDefined();
  });

  test('auto-generates examples from feeds config', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    const body = JSON.parse(response.body);
    const labels = feeds.map((f) => f.label);
    expect(Object.keys(body.examples)).toEqual(labels);
    for (const feed of feeds) {
      expect(body.examples[feed.label]).toContain(encodeURIComponent(feed.url));
    }
  });
});

describe('GET /health', () => {
  test('returns status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

describe('GET /feed', () => {
  test('returns 400 without url parameter', async () => {
    const response = await app.inject({ method: 'GET', url: '/feed' });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('required');
  });

  test('returns 403 for non-whitelisted URL', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/feed?url=https://evil.com/',
    });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('not allowed');
  });

  test('returns cached RSS feed with X-Cache HIT', async () => {
    mockedCache.get.mockReturnValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'GET',
      url: `/feed?url=${encodeURIComponent(MARINERS_URL)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('HIT');
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.body).toBe(MOCK_FEEDS.rss);
    expect(mockedScraper.scrapeArticles).not.toHaveBeenCalled();
  });

  test('returns cached Atom feed when format=atom', async () => {
    mockedCache.get.mockReturnValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'GET',
      url: `/feed?url=${encodeURIComponent(MARINERS_URL)}&format=atom`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/atom+xml');
    expect(response.body).toBe(MOCK_FEEDS.atom);
  });

  test('returns cached JSON feed when format=json', async () => {
    mockedCache.get.mockReturnValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'GET',
      url: `/feed?url=${encodeURIComponent(MARINERS_URL)}&format=json`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/feed+json');
    expect(response.body).toBe(MOCK_FEEDS.json);
  });

  test('defaults to RSS for unknown format parameter', async () => {
    mockedCache.get.mockReturnValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'GET',
      url: `/feed?url=${encodeURIComponent(MARINERS_URL)}&format=invalid`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.body).toBe(MOCK_FEEDS.rss);
  });

  test('scrapes and returns feed with X-Cache MISS on cache miss', async () => {
    mockedCache.get.mockReturnValue(undefined);
    mockedScraper.scrapeArticles.mockResolvedValue({
      articles: [
        {
          title: 'Test Article',
          link: 'https://example.com/1',
          description: 'desc',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/1',
        },
      ],
      pageTitle: 'Test Page',
    });
    mockedFeedGenerator.generateFeeds.mockResolvedValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'GET',
      url: `/feed?url=${encodeURIComponent(MARINERS_URL)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('MISS');
    expect(response.body).toBe(MOCK_FEEDS.rss);
    expect(mockedScraper.scrapeArticles).toHaveBeenCalledWith(MARINERS_URL);
    expect(mockedCache.set).toHaveBeenCalled();
  });

  test('returns 404 when scraper finds no articles', async () => {
    mockedCache.get.mockReturnValue(undefined);
    mockedScraper.scrapeArticles.mockResolvedValue({ articles: [], pageTitle: 'Empty' });

    const response = await app.inject({
      method: 'GET',
      url: `/feed?url=${encodeURIComponent(MARINERS_URL)}`,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /refresh', () => {
  test('returns 401 without API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(response.statusCode).toBe(401);
  });

  test('returns 401 with wrong API key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      headers: {
        'content-type': 'application/json',
        api_key: 'wrong-key',
      },
      payload: '{}',
    });
    expect(response.statusCode).toBe(401);
  });

  test('refreshes all feeds with valid API key', async () => {
    mockedScraper.scrapeArticles.mockResolvedValue({
      articles: [
        {
          title: 'Test',
          link: 'https://example.com/1',
          description: 'desc',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/1',
        },
      ],
      pageTitle: 'Test',
    });
    mockedFeedGenerator.generateFeeds.mockResolvedValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      headers: {
        'content-type': 'application/json',
        api_key: TEST_API_KEY,
      },
      payload: '{}',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('success');
    expect(body.results).toHaveLength(feedUrls.length);
    expect(mockedScraper.scrapeArticles).toHaveBeenCalledTimes(feedUrls.length);
  });

  test('refreshes specific feed with valid API key and URL', async () => {
    mockedScraper.scrapeArticles.mockResolvedValue({
      articles: [
        {
          title: 'Test',
          link: 'https://example.com/1',
          description: 'desc',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/1',
        },
      ],
      pageTitle: 'Test',
    });
    mockedFeedGenerator.generateFeeds.mockResolvedValue(MOCK_FEEDS);

    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      headers: {
        'content-type': 'application/json',
        api_key: TEST_API_KEY,
      },
      payload: JSON.stringify({ url: MARINERS_URL }),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('success');
    expect(body.articles_count).toBe(1);
    expect(mockedScraper.scrapeArticles).toHaveBeenCalledWith(MARINERS_URL);
  });

  test('returns 403 for non-whitelisted URL in refresh', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/refresh',
      headers: {
        'content-type': 'application/json',
        api_key: TEST_API_KEY,
      },
      payload: JSON.stringify({ url: 'https://evil.com/' }),
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('GET /status', () => {
  test('returns degraded when no feeds are cached', async () => {
    mockedCache.get.mockReturnValue(undefined);
    const response = await app.inject({ method: 'GET', url: '/status' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.timestamp).toBeDefined();
    expect(body.feeds).toHaveLength(feeds.length);
    for (const feed of body.feeds) {
      expect(feed.cached).toBe(false);
      expect(feed.label).toBeDefined();
      expect(feed.url).toBeDefined();
      expect(feed.extractor).toBeDefined();
    }
  });

  test('returns healthy when all feeds are cached', async () => {
    mockedCache.get.mockReturnValue(MOCK_FEEDS);
    const response = await app.inject({ method: 'GET', url: '/status' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    for (const feed of body.feeds) {
      expect(feed.cached).toBe(true);
    }
  });

  test('returns degraded when some feeds are cached', async () => {
    mockedCache.get.mockImplementation((key: string | number) => {
      if (key === `feed:${feeds[0].url}`) return MOCK_FEEDS;
      return undefined;
    });
    const response = await app.inject({ method: 'GET', url: '/status' });
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.feeds[0].cached).toBe(true);
    expect(body.feeds[1].cached).toBe(false);
  });
});

describe('GET /debug-dates', () => {
  test('returns 404 (endpoint removed)', async () => {
    const response = await app.inject({ method: 'GET', url: '/debug-dates' });
    expect(response.statusCode).toBe(404);
  });
});
