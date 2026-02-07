const scraper = require('../../lib/scraper');

describe('Scraper module', () => {
  test('exports scrapeArticles method', () => {
    expect(typeof scraper.scrapeArticles).toBe('function');
  });

  test('exports close method', () => {
    expect(typeof scraper.close).toBe('function');
  });
});
