import scraper from '../../lib/scraper';

describe('Scraper module', () => {
  test('exports scrapeArticles method', () => {
    expect(typeof scraper.scrapeArticles).toBe('function');
  });

  test('exports close method', () => {
    expect(typeof scraper.close).toBe('function');
  });
});

test('rejects an unregistered source before browser creation', async () => {
  await expect(scraper.loadHtml('http://127.0.0.1/')).rejects.toThrow(/registered/);
});

test('rejects enrichment outside its registered source origin', async () => {
  await expect(
    scraper.loadHtml('https://example.com/article', 'https://claude.com/blog')
  ).rejects.toThrow(/origin/);
});
