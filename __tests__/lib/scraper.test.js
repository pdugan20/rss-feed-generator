const scraper = require('../../lib/scraper');

describe('Scraper helper methods', () => {
  describe('resolveUrl', () => {
    const base = 'https://www.seattletimes.com/sports/mariners/';

    test('absolute URL passes through unchanged', () => {
      const url = 'https://example.com/article';
      expect(scraper.resolveUrl(url, base)).toBe(url);
    });

    test('http URL passes through unchanged', () => {
      const url = 'http://example.com/page';
      expect(scraper.resolveUrl(url, base)).toBe(url);
    });

    test('relative URL resolved against base', () => {
      expect(scraper.resolveUrl('/sports/nfl/', base)).toBe(
        'https://www.seattletimes.com/sports/nfl/'
      );
    });

    test('relative path without leading slash', () => {
      const result = scraper.resolveUrl('article-slug/', base);
      expect(result).toContain('https://www.seattletimes.com/');
      expect(result).toContain('article-slug');
    });

    test('null input returns null', () => {
      expect(scraper.resolveUrl(null, base)).toBeNull();
    });

    test('undefined input returns null', () => {
      expect(scraper.resolveUrl(undefined, base)).toBeNull();
    });

    test('empty string returns null', () => {
      expect(scraper.resolveUrl('', base)).toBeNull();
    });
  });

  describe('parseDate', () => {
    test('ISO date string parses correctly', () => {
      const result = scraper.parseDate('2025-06-15T10:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2025-06-15T10:00:00.000Z');
    });

    test('date-only string parses', () => {
      const result = scraper.parseDate('2025-06-15');
      expect(result).toBeInstanceOf(Date);
    });

    test('human-readable date parses', () => {
      const result = scraper.parseDate('June 15, 2025');
      expect(result).toBeInstanceOf(Date);
    });

    test('null input returns null', () => {
      expect(scraper.parseDate(null)).toBeNull();
    });

    test('empty string returns null', () => {
      expect(scraper.parseDate('')).toBeNull();
    });

    test('invalid date string returns null', () => {
      expect(scraper.parseDate('not-a-date')).toBeNull();
    });
  });

  describe('getSelectorsForDomain', () => {
    test('seattletimes.com returns specific selectors', () => {
      const selectors = scraper.getSelectorsForDomain('seattletimes.com');
      expect(selectors.article).toBeDefined();
      expect(selectors.article).toContain('StoryCard');
    });

    test('www.seattletimes.com returns specific selectors', () => {
      const selectors = scraper.getSelectorsForDomain('www.seattletimes.com');
      expect(selectors.article).toBeDefined();
      expect(selectors.article).toContain('StoryCard');
    });

    test('unknown domain returns default selectors', () => {
      const selectors = scraper.getSelectorsForDomain('unknown-site.org');
      expect(selectors.article).toContain('article');
    });

    test('selector objects have all required keys', () => {
      const requiredKeys = ['article', 'title', 'link', 'description', 'date', 'image'];
      const selectors = scraper.getSelectorsForDomain('seattletimes.com');
      for (const key of requiredKeys) {
        expect(selectors).toHaveProperty(key);
      }
    });

    test('default selectors have all required keys', () => {
      const requiredKeys = ['article', 'title', 'link', 'description', 'date', 'image'];
      const selectors = scraper.getSelectorsForDomain('anything.com');
      for (const key of requiredKeys) {
        expect(selectors).toHaveProperty(key);
      }
    });
  });
});
