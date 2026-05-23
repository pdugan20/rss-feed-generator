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

  test('emits article + discussion items for a story with external URL', async () => {
    global.fetch = mockFetchResponse([STORY_HIT]);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(2);

    const [articleItem, discussionItem] = articles;

    // Article item
    expect(articleItem.title).toBe('A great story');
    expect(articleItem.link).toBe('https://example.com/great-story');
    expect(articleItem.guid).toBe('hn-12345');
    expect(articleItem.pubDate).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(articleItem.description).toContain('500 points');
    expect(articleItem.description).toContain('120 comments');
    expect(articleItem.description).toContain('by dang');
    expect(articleItem.imageUrl).toBeNull();

    // Discussion item
    expect(discussionItem.title).toBe('HN: A great story (120 comments)');
    expect(discussionItem.link).toBe('https://news.ycombinator.com/item?id=12345');
    expect(discussionItem.guid).toBe('hn-12345-discuss');
    expect(discussionItem.pubDate).toEqual(new Date('2026-05-22T12:00:00.000Z'));
    expect(discussionItem.imageUrl).toBeNull();
  });

  test('emits only one discussion item for Ask HN (no external URL)', async () => {
    global.fetch = mockFetchResponse([ASK_HN_HIT]);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('HN: Ask HN: What are you working on? (250 comments)');
    expect(articles[0].link).toBe('https://news.ycombinator.com/item?id=67890');
    expect(articles[0].guid).toBe('hn-67890-discuss');
  });

  test('sorts by points descending (paired items per story)', async () => {
    const hits = [
      { ...STORY_HIT, objectID: 'a', title: 'Low', points: 50 },
      { ...STORY_HIT, objectID: 'b', title: 'High', points: 900 },
      { ...STORY_HIT, objectID: 'c', title: 'Mid', points: 200 },
    ];
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles.map((a) => a.title)).toEqual([
      'High',
      'HN: High (120 comments)',
      'Mid',
      'HN: Mid (120 comments)',
      'Low',
      'HN: Low (120 comments)',
    ]);
  });

  test('caps story count at top 10 (yields up to 20 items)', async () => {
    const hits = Array.from({ length: 25 }, (_, i) => ({
      ...STORY_HIT,
      objectID: `id-${i}`,
      points: 1000 - i,
    }));
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(20); // 10 stories x 2 items
  });

  test('skips hits without a title', async () => {
    const hits = [{ ...STORY_HIT, objectID: 'no-title', title: undefined }, STORY_HIT];
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(2);
    expect(articles[0].guid).toBe('hn-12345');
    expect(articles[1].guid).toBe('hn-12345-discuss');
  });

  test('handles missing points / num_comments gracefully', async () => {
    const hits = [{ ...STORY_HIT, objectID: 'nopoints', points: null, num_comments: null }];
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles[0].description).toContain('0 points');
    expect(articles[0].description).toContain('0 comments');
    expect(articles[1].title).toBe('HN: A great story (0 comments)');
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
