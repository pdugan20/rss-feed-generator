jest.mock('../../lib/public-request', () => ({
  ...jest.requireActual('../../lib/public-request'),
  fetchPublicJson: jest.fn(),
}));
jest.mock('../../lib/article-store', () => ({
  getPubDate: jest.fn().mockReturnValue(null),
  getDescription: jest.fn().mockReturnValue(''),
  getReadingTime: jest.fn().mockReturnValue(undefined),
  setArticleData: jest.fn(),
  save: jest.fn(),
}));

import { fetchPublicJson } from '../../lib/public-request';
import scraper from '../../lib/scraper';

const MARINERS_URL = 'https://www.seattletimes.com/sports/mariners/';
const PAGE = `<html><head><title>Mariners | The Seattle Times</title></head><body>
  <article class="story-list-item"><h3><a href="/sports/mariners/trade-reactions/">National media reactions to the trade</a></h3>
  <time datetime="2026-11-18T20:17:30Z">Nov 18</time></article>
</body></html>`;

function respond(status: number, body = PAGE) {
  jest.mocked(fetchPublicJson).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    text: async () => body,
  });
}

afterAll(() => scraper.close());

describe('html render mode', () => {
  test('parses the server-rendered page without a browser', async () => {
    respond(200);
    const launch = jest.spyOn(
      scraper as unknown as { loadHtml: () => Promise<string> },
      'loadHtml'
    );

    const { pageTitle } = await scraper.scrapeArticles(MARINERS_URL);

    expect(pageTitle).toBe('Mariners | The Seattle Times');
    expect(launch).not.toHaveBeenCalled();
    const [url, options] = jest.mocked(fetchPublicJson).mock.calls[0];
    expect(url).toBe(MARINERS_URL);
    expect(options?.headers?.['User-Agent']).toMatch(/Mozilla/);
  });

  test('fails on an unsuccessful status', async () => {
    respond(503);
    await expect(scraper.scrapeArticles(MARINERS_URL)).rejects.toThrow('Feed page returned 503');
  });

  test('keeps the registry check for unregistered pages', async () => {
    await expect(scraper.loadStaticHtml('https://example.com/')).rejects.toThrow(/registered/);
  });
});
