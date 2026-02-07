const rssGenerator = require('../../lib/rss-generator');

const MARINERS_URL = 'https://www.seattletimes.com/sports/mariners/';

const mockArticles = [
  {
    title: 'Mariners Win Big Game',
    link: 'https://www.seattletimes.com/sports/mariners/mariners-win-big/',
    description: 'The Seattle Mariners won a big game today.',
    pubDate: new Date('2025-06-15T10:00:00Z'),
    imageUrl: 'https://example.com/mariners.jpg',
    guid: 'https://www.seattletimes.com/sports/mariners/mariners-win-big/',
  },
  {
    title: 'Trade Deadline Approaches',
    link: 'https://www.seattletimes.com/sports/mariners/trade-deadline/',
    description: 'The trade deadline is fast approaching.',
    pubDate: new Date('2025-06-14T10:00:00Z'),
    imageUrl: null,
    guid: 'https://www.seattletimes.com/sports/mariners/trade-deadline/',
  },
];

describe('RSSGenerator', () => {
  describe('generateFeed', () => {
    test('produces valid XML with rss root element', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Mariners News');
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<rss');
      expect(xml).toContain('</rss>');
    });

    test('uses pageTitle as feed title', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Mariners News');
      expect(xml).toContain('<title>Mariners News</title>');
    });

    test('each article becomes an item element', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Test Feed');
      const itemCount = (xml.match(/<item>/g) || []).length;
      expect(itemCount).toBe(2);
    });

    test('article titles appear in feed items', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Test Feed');
      expect(xml).toContain('Mariners Win Big Game');
      expect(xml).toContain('Trade Deadline Approaches');
    });

    test('article with image gets enclosure element', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Test Feed');
      expect(xml).toContain('<enclosure');
      expect(xml).toContain('https://example.com/mariners.jpg');
    });

    test('article without image has no enclosure for that item', () => {
      const articlesNoImages = [
        {
          title: 'No Image Article',
          link: 'https://example.com/no-image',
          description: 'No image here',
          pubDate: new Date(),
          imageUrl: null,
          guid: 'https://example.com/no-image',
        },
      ];
      const xml = rssGenerator.generateFeed(MARINERS_URL, articlesNoImages, 'Test');
      expect(xml).not.toContain('<enclosure');
    });

    test('feed includes ttl of 1440 minutes', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Test Feed');
      expect(xml).toContain('<ttl>1440</ttl>');
    });

    test('feed includes language', () => {
      const xml = rssGenerator.generateFeed(MARINERS_URL, mockArticles, 'Test Feed');
      expect(xml).toContain('<language><![CDATA[en]]></language>');
    });
  });

  describe('extractSiteName', () => {
    test('extracts name from www subdomain', () => {
      const url = new URL('https://www.seattletimes.com/sports/');
      expect(rssGenerator.extractSiteName(url)).toBe('Seattletimes');
    });

    test('extracts name from bare domain', () => {
      const url = new URL('https://example.com/path');
      expect(rssGenerator.extractSiteName(url)).toBe('Example');
    });
  });

  describe('extractCategories', () => {
    test('splits URL path into capitalized words', () => {
      const categories = rssGenerator.extractCategories(MARINERS_URL);
      expect(categories).toContain('Sports');
      expect(categories).toContain('Mariners');
    });

    test('handles hyphenated path segments', () => {
      const categories = rssGenerator.extractCategories(
        'https://www.seattletimes.com/sports/washington-huskies-football/'
      );
      expect(categories).toContain('Washington Huskies Football');
    });
  });

  describe('findFavicon', () => {
    test('returns first article image', () => {
      expect(rssGenerator.findFavicon(mockArticles)).toBe('https://example.com/mariners.jpg');
    });

    test('returns null when no articles have images', () => {
      const noImages = [{ title: 'Test', imageUrl: null }];
      expect(rssGenerator.findFavicon(noImages)).toBeNull();
    });

    test('returns null for empty array', () => {
      expect(rssGenerator.findFavicon([])).toBeNull();
    });
  });
});
