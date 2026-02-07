import scraper from '../../lib/scraper';
import cache from '../../lib/cache';
import rssGenerator from '../../lib/rss-generator';
import { feedUrls } from '../../lib/feeds';
import type schedulerType from '../../lib/scheduler';

jest.mock('../../lib/scraper');
jest.mock('../../lib/cache');
jest.mock('../../lib/rss-generator');

const mockedScraper = jest.mocked(scraper);
const mockedCache = jest.mocked(cache);
const mockedRssGenerator = jest.mocked(rssGenerator);

let scheduler: typeof schedulerType;

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
      const mockArticles = [
        {
          title: 'Test',
          link: 'https://example.com/1',
          description: 'desc',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/1',
        },
      ];
      mockedScraper.scrapeArticles.mockResolvedValue({
        articles: mockArticles,
        pageTitle: 'Test Page',
      });
      mockedRssGenerator.generateFeed.mockReturnValue('<rss>mock</rss>');

      await scheduler.refreshFeeds();

      expect(mockedScraper.scrapeArticles).toHaveBeenCalledTimes(feedUrls.length);
      expect(mockedCache.del).toHaveBeenCalledTimes(feedUrls.length);
      expect(mockedRssGenerator.generateFeed).toHaveBeenCalledTimes(feedUrls.length);
      expect(mockedCache.set).toHaveBeenCalledTimes(feedUrls.length);
    });

    test('handles scraper errors gracefully', async () => {
      mockedScraper.scrapeArticles.mockRejectedValue(new Error('Network error'));

      await expect(scheduler.refreshFeeds()).resolves.toBeUndefined();
      expect(mockedCache.set).not.toHaveBeenCalled();
    });

    test('skips caching when no articles found', async () => {
      mockedScraper.scrapeArticles.mockResolvedValue({
        articles: [],
        pageTitle: 'Empty Page',
      });

      await scheduler.refreshFeeds();

      expect(mockedRssGenerator.generateFeed).not.toHaveBeenCalled();
      expect(mockedCache.set).not.toHaveBeenCalled();
    });
  });
});
