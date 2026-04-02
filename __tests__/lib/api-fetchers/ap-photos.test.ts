import type { ApiFetcher } from '../../../lib/types';

const MARINERS_HIT = {
  _source: {
    itemid: 'abc123',
    headline: 'Yankees Mariners Baseball',
    caption: {
      nitf: '<p>Seattle Mariners relief pitcher Luis Castillo throws during the first inning of a baseball game, Wednesday, April 1, 2026, in Seattle. (AP Photo/Lindsey Wasson)</p>',
    },
    firstcreated: '2026-04-01T22:30:24Z',
    photographer: { name: 'Lindsey Wasson' },
    subjects: [{ name: 'MLB baseball' }, { name: 'Sports' }, { name: 'Baseball' }],
    persons: [{ name: 'Luis Castillo' }],
    renditions: [
      { rel: 'Main', width: 6686, height: 4458, mimetype: 'image/jpeg' },
      { rel: 'Preview', width: 512, height: 341, mimetype: 'image/jpeg' },
      { rel: 'Thumbnail', width: 125, height: 83, mimetype: 'image/jpeg' },
    ],
  },
};

const OPPOSING_TEAM_HIT = {
  _source: {
    itemid: 'def456',
    headline: 'Yankees Mariners Baseball',
    caption: {
      nitf: '<p>New York Yankees starting pitcher Ryan Weathers throws during the first inning of a baseball game, Wednesday, April 1, 2026, in Seattle. (AP Photo/Lindsey Wasson)</p>',
    },
    firstcreated: '2026-04-01T22:30:00Z',
    photographer: { name: 'Lindsey Wasson' },
    subjects: [{ name: 'MLB baseball' }],
  },
};

function mockFetchResponse(hits: unknown[], status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    json: async () => ({ Items: hits }),
  });
}

describe('ap-photos API fetcher', () => {
  const originalFetch = global.fetch;
  let fetcher: ApiFetcher;

  beforeEach(() => {
    jest.resetModules();
    fetcher = require('../../../lib/api-fetchers/ap-photos');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('filters to only Mariners photos', async () => {
    global.fetch = mockFetchResponse([MARINERS_HIT, OPPOSING_TEAM_HIT]);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);
    expect(articles[0].guid).toBe('ap-photo-abc123');
  });

  test('maps fields correctly', async () => {
    global.fetch = mockFetchResponse([MARINERS_HIT]);
    const articles = await fetcher.fetch();
    const article = articles[0];

    expect(article.title).toBe('Apr 1 vs Yankees — Luis Castillo');
    expect(article.link).toBe(
      'https://newsroom.ap.org/editorial-photos-videos/detail?itemid=abc123&mediatype=photo'
    );
    expect(article.description).toContain('Seattle Mariners relief pitcher Luis Castillo');
    expect(article.pubDate).toEqual(new Date('2026-04-01T22:30:24Z'));
    expect(article.imageUrl).toBe(
      'https://mapi.associatedpress.com/v2/items/abc123/preview/AP.jpg'
    );
    expect(article.guid).toBe('ap-photo-abc123');
    expect(article.categories).toEqual(['MLB baseball', 'Sports', 'Baseball']);
    expect(article.imageWidth).toBe(512);
    expect(article.imageHeight).toBe(341);
    expect(article.imageMimeType).toBe('image/jpeg');
  });

  test('handles missing renditions gracefully', async () => {
    const noRenditionsHit = {
      _source: { ...MARINERS_HIT._source, itemid: 'norend', renditions: undefined },
    };
    global.fetch = mockFetchResponse([noRenditionsHit]);
    const articles = await fetcher.fetch();
    expect(articles[0].imageWidth).toBeUndefined();
    expect(articles[0].imageHeight).toBeUndefined();
    expect(articles[0].imageMimeType).toBe('image/jpeg');
  });

  test('strips HTML from captions', async () => {
    global.fetch = mockFetchResponse([MARINERS_HIT]);
    const articles = await fetcher.fetch();
    expect(articles[0].description).not.toContain('<p>');
    expect(articles[0].description).not.toContain('</p>');
  });

  test('truncates long descriptions to 500 chars', async () => {
    const longCaptionHit = {
      _source: {
        ...MARINERS_HIT._source,
        itemid: 'long123',
        caption: {
          nitf: `<p>Seattle Mariners ${'word '.repeat(200)}end of caption. (AP Photo/Lindsey Wasson)</p>`,
        },
      },
    };
    global.fetch = mockFetchResponse([longCaptionHit]);
    const articles = await fetcher.fetch();
    expect(articles[0].description.length).toBeLessThanOrEqual(500);
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
    expect(fetcher.pageTitle).toBe('AP Photos - Lindsey Wasson - Seattle Mariners');
  });

  test('handles missing optional fields gracefully', async () => {
    const minimalHit = {
      _source: {
        itemid: 'min789',
        caption: { nitf: '<p>Seattle Mariners photo.</p>' },
      },
    };
    global.fetch = mockFetchResponse([minimalHit]);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('AP Photo'); // no date, no opponent — raw fallback
    expect(articles[0].pubDate).toBeNull();
    expect(articles[0].categories).toEqual([]);
    expect(articles[0].imageWidth).toBeUndefined();
    expect(articles[0].imageHeight).toBeUndefined();
  });

  test('builds title with date + opponent + person for game photos', async () => {
    global.fetch = mockFetchResponse([MARINERS_HIT]);
    const articles = await fetcher.fetch();
    expect(articles[0].title).toBe('Apr 1 vs Yankees — Luis Castillo');
  });

  test('builds title with date + opponent when no persons', async () => {
    const noPersonsHit = {
      _source: {
        ...MARINERS_HIT._source,
        itemid: 'noperson',
        persons: [],
      },
    };
    global.fetch = mockFetchResponse([noPersonsHit]);
    const articles = await fetcher.fetch();
    expect(articles[0].title).toBe('Apr 1 vs Yankees');
  });

  test('builds title with date + raw headline for non-game photos', async () => {
    const nonGameHit = {
      _source: {
        ...MARINERS_HIT._source,
        itemid: 'nongame',
        headline: 'Mariners Spring Training',
        persons: [],
      },
    };
    global.fetch = mockFetchResponse([nonGameHit]);
    const articles = await fetcher.fetch();
    expect(articles[0].title).toBe('Apr 1: Mariners Spring Training');
  });

  test('builds title with away game pattern', async () => {
    const awayHit = {
      _source: {
        ...MARINERS_HIT._source,
        itemid: 'away',
        headline: 'Mariners Angels Baseball',
        persons: [{ name: 'Julio Rodriguez' }],
      },
    };
    global.fetch = mockFetchResponse([awayHit]);
    const articles = await fetcher.fetch();
    expect(articles[0].title).toBe('Apr 1 vs Angels — Julio Rodriguez');
  });

  test('caps at 30 articles', async () => {
    const hits = Array.from({ length: 40 }, (_, i) => ({
      _source: {
        ...MARINERS_HIT._source,
        itemid: `item-${i}`,
      },
    }));
    global.fetch = mockFetchResponse(hits);
    const articles = await fetcher.fetch();
    expect(articles).toHaveLength(30);
  });
});
