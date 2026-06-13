import type { ApiFetcher } from '../../../lib/types';

const STORY_HIT = {
  objectID: '12345',
  title: 'A great story',
  url: 'https://example.com/great-story',
  author: 'dang',
  points: 500,
  num_comments: 120,
  created_at: '2026-05-22T12:00:00.000Z',
  created_at_i: 1779796800,
  _tags: ['story', 'author_dang', 'story_12345'],
};

const ASK_HN_HIT = {
  objectID: '67890',
  title: 'Ask HN: What are you working on?',
  url: null,
  author: 'pg',
  points: 300,
  num_comments: 250,
  story_text: '<p>Share your projects.</p>',
  created_at: '2026-05-22T08:00:00.000Z',
  created_at_i: 1779782400,
  _tags: ['story', 'ask_hn', 'author_pg', 'story_67890'],
};

function mockFetchResponse(hits: unknown[], status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    json: async () => ({ hits }),
  });
}

describe('hackernews-top API fetcher', () => {
  const originalFetch = global.fetch;
  let fetcher: ApiFetcher;

  beforeEach(() => {
    jest.resetModules();
    fetcher = require('../../../lib/api-fetchers/hackernews-top');
    // Fix "now" to 2026-05-23T15:00:00Z so previous UTC day is 2026-05-22
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T15:00:00.000Z'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('queries Algolia with previous UTC day bounds', async () => {
    const mock = mockFetchResponse([STORY_HIT]);
    global.fetch = mock;
    await fetcher.fetch();

    const calledUrl = mock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('hn.algolia.com/api/v1/search');
    expect(calledUrl).toContain('tags=story');
    // 2026-05-22 00:00:00 UTC = 1779408000; 2026-05-23 00:00:00 UTC = 1779494400
    expect(calledUrl).toContain('created_at_i%3E%3D1779408000');
    expect(calledUrl).toContain('created_at_i%3C1779494400');
  });

  test('links to the HN discussion and embeds a clickable article anchor', async () => {
    global.fetch = mockFetchResponse([STORY_HIT]);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);

    const [item] = articles;
    expect(item.title).toBe('A great story');
    // Item link points at the HN thread so readers open the comments page.
    expect(item.link).toBe('https://news.ycombinator.com/item?id=12345');
    expect(item.guid).toBe('hn-12345');
    expect(item.pubDate).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(item.description).toContain('500 points');
    expect(item.description).toContain('120 comments');
    expect(item.description).toContain('by dang');
    // Article reachable via a real anchor embedded in the description.
    expect(item.description).toContain('<a href="https://example.com/great-story">');
    expect(item.imageUrl).toBeNull();
  });

  test('escapes ampersands in the article URL within the anchor', async () => {
    global.fetch = mockFetchResponse([{ ...STORY_HIT, url: 'https://example.com/a?x=1&y=2' }]);
    const articles = await fetcher.fetch();
    expect(articles[0].description).toContain('href="https://example.com/a?x=1&amp;y=2"');
  });

  test('emits one item for Ask HN linking directly to the discussion', async () => {
    global.fetch = mockFetchResponse([ASK_HN_HIT]);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Ask HN: What are you working on?');
    expect(articles[0].link).toBe('https://news.ycombinator.com/item?id=67890');
    expect(articles[0].guid).toBe('hn-67890');
    // No article anchor since the item link already IS the discussion thread.
    expect(articles[0].description).not.toContain('<a');
  });

  test('sorts by points descending', async () => {
    const hits = [
      { ...STORY_HIT, objectID: 'a', title: 'Low', points: 50 },
      { ...STORY_HIT, objectID: 'b', title: 'High', points: 900 },
      { ...STORY_HIT, objectID: 'c', title: 'Mid', points: 200 },
    ];
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles.map((a) => a.title)).toEqual(['High', 'Mid', 'Low']);
  });

  test('caps story count at top 5', async () => {
    const hits = Array.from({ length: 25 }, (_, i) => ({
      ...STORY_HIT,
      objectID: `id-${i}`,
      points: 1000 - i,
    }));
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(5);
  });

  test('skips hits without a title', async () => {
    const hits = [{ ...STORY_HIT, objectID: 'no-title', title: undefined }, STORY_HIT];
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);
    expect(articles[0].guid).toBe('hn-12345');
  });

  test('handles missing points / num_comments gracefully', async () => {
    const hits = [{ ...STORY_HIT, objectID: 'nopoints', points: null, num_comments: null }];
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);
    expect(articles[0].description).toContain('0 points');
    expect(articles[0].description).toContain('0 comments');
  });

  test('returns empty array on API error', async () => {
    global.fetch = mockFetchResponse([], 500);
    const articles = await fetcher.fetch();
    expect(articles).toEqual([]);
  });

  test('returns empty array when no hits', async () => {
    global.fetch = mockFetchResponse([]);
    const articles = await fetcher.fetch();
    expect(articles).toEqual([]);
  });

  test('has correct page title', () => {
    expect(fetcher.pageTitle).toBe('Hacker News — Top Stories of Yesterday');
  });
});
