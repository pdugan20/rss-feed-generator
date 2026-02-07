const { feeds, feedUrls, getExtractorName } = require('../../lib/feeds');

describe('feeds config', () => {
  test('feeds array is not empty', () => {
    expect(feeds.length).toBeGreaterThan(0);
  });

  test('every feed has url, extractor, and label', () => {
    for (const feed of feeds) {
      expect(feed.url).toBeDefined();
      expect(feed.url).toMatch(/^https?:\/\//);
      expect(feed.extractor).toBeDefined();
      expect(typeof feed.extractor).toBe('string');
      expect(feed.label).toBeDefined();
      expect(typeof feed.label).toBe('string');
      expect(feed.label.length).toBeGreaterThan(0);
    }
  });

  test('feedUrls matches feeds', () => {
    expect(feedUrls).toEqual(feeds.map((f) => f.url));
  });

  test('no duplicate URLs', () => {
    const unique = new Set(feedUrls);
    expect(unique.size).toBe(feedUrls.length);
  });
});

describe('getExtractorName', () => {
  test('returns correct name for known URL', () => {
    expect(getExtractorName(feeds[0].url)).toBe(feeds[0].extractor);
  });

  test('returns null for unknown URL', () => {
    expect(getExtractorName('https://unknown.com/')).toBeNull();
  });
});
