jest.mock('../../lib/scraper', () => ({
  scrapeArticles: jest.fn(),
}));

jest.mock('../../lib/cache', () => ({
  del: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../../lib/rss-generator', () => ({
  generateFeed: jest.fn(),
}));

const scraper = require('../../lib/scraper');
const cache = require('../../lib/cache');
const rssGenerator = require('../../lib/rss-generator');
const { feedUrls } = require('../../lib/feeds');

let scheduler;

beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    scheduler = require('../../lib/scheduler');
  });
});

describe('Scheduler', () => {
  describe('getFeeds', () => {
    test('returns feed URLs from config', () => {
      const feeds = scheduler.getFeeds();
      expect(feeds).toEqual(feedUrls);
    });
  });

  describe('addFeed', () => {
    test('adds a new feed URL', () => {
      scheduler.addFeed('https://example.com/feed');
      expect(scheduler.getFeeds()).toContain('https://example.com/feed');
    });

    test('does not duplicate existing URLs', () => {
      const initialLength = scheduler.getFeeds().length;
      scheduler.addFeed(feedUrls[0]);
      expect(scheduler.getFeeds()).toHaveLength(initialLength);
    });
  });

  describe('removeFeed', () => {
    test('removes a feed URL', () => {
      const urlToRemove = feedUrls[feedUrls.length - 1];
      scheduler.removeFeed(urlToRemove);
      expect(scheduler.getFeeds()).not.toContain(urlToRemove);
    });

    test('handles non-existent URL gracefully', () => {
      const initialLength = scheduler.getFeeds().length;
      scheduler.removeFeed('https://nonexistent.com/feed');
      expect(scheduler.getFeeds()).toHaveLength(initialLength);
    });
  });

  describe('refreshFeeds', () => {
    test('scrapes and caches each feed', async () => {
      const mockArticles = [{ title: 'Test', link: 'https://example.com/1', description: 'desc' }];
      scraper.scrapeArticles.mockResolvedValue({
        articles: mockArticles,
        pageTitle: 'Test Page',
      });
      rssGenerator.generateFeed.mockReturnValue('<rss>mock</rss>');

      await scheduler.refreshFeeds();

      expect(scraper.scrapeArticles).toHaveBeenCalledTimes(feedUrls.length);
      expect(cache.del).toHaveBeenCalledTimes(feedUrls.length);
      expect(rssGenerator.generateFeed).toHaveBeenCalledTimes(feedUrls.length);
      expect(cache.set).toHaveBeenCalledTimes(feedUrls.length);
    });

    test('handles scraper errors gracefully', async () => {
      scraper.scrapeArticles.mockRejectedValue(new Error('Network error'));

      await expect(scheduler.refreshFeeds()).resolves.toBeUndefined();
      expect(cache.set).not.toHaveBeenCalled();
    });

    test('skips caching when no articles found', async () => {
      scraper.scrapeArticles.mockResolvedValue({
        articles: [],
        pageTitle: 'Empty Page',
      });

      await scheduler.refreshFeeds();

      expect(rssGenerator.generateFeed).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
