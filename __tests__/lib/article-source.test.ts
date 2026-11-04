jest.mock('../../lib/scraper', () => ({ scrapeArticles: jest.fn() }));
jest.mock('../../lib/api-fetchers', () => ({ getApiFetcher: jest.fn() }));
import { fetchArticles } from '../../lib/article-source';
import scraper from '../../lib/scraper';
import { getApiFetcher } from '../../lib/api-fetchers';
it('rejects unknown feeds at the internal dispatch boundary', async () => {
  await expect(fetchArticles('https://example.com/')).rejects.toThrow(/registered/);
  expect(scraper.scrapeArticles).not.toHaveBeenCalled();
  expect(getApiFetcher).not.toHaveBeenCalled();
});
