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

let scheduler;

beforeEach(() => {
  jest.clearAllMocks();
  // Re-require to get a fresh instance
  jest.isolateModules(() => {
    scheduler = require('../../lib/scheduler');
  });
});

describe('Scheduler', () => {
  describe('getFeeds', () => {
    test('returns default feed URLs', () => {
      const feeds = scheduler.getFeeds();
      expect(feeds).toContain('https://www.seattletimes.com/sports/washington-huskies-football/');
      expect(feeds).toContain('https://www.seattletimes.com/sports/mariners/');
      expect(feeds).toHaveLength(2);
    });
  });

  describe('addFeed', () => {
    test('adds a new feed URL', () => {
      scheduler.addFeed('https://example.com/feed');
      expect(scheduler.getFeeds()).toContain('https://example.com/feed');
    });

    test('does not duplicate existing URLs', () => {
      const initialLength = scheduler.getFeeds().length;
      scheduler.addFeed('https://www.seattletimes.com/sports/mariners/');
      expect(scheduler.getFeeds()).toHaveLength(initialLength);
    });
  });

  describe('removeFeed', () => {
    test('removes a feed URL', () => {
      scheduler.removeFeed('https://www.seattletimes.com/sports/mariners/');
      expect(scheduler.getFeeds()).not.toContain('https://www.seattletimes.com/sports/mariners/');
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

      expect(scraper.scrapeArticles).toHaveBeenCalledTimes(2);
      expect(cache.del).toHaveBeenCalledTimes(2);
      expect(rssGenerator.generateFeed).toHaveBeenCalledTimes(2);
      expect(cache.set).toHaveBeenCalledTimes(2);
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
