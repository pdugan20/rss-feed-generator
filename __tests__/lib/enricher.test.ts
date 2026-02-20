import { enrichArticles } from '../../lib/enricher';
import type { Article } from '../../lib/types';

jest.mock('../../lib/scraper', () => {
  const mockPage = {
    setUserAgent: jest.fn(),
    goto: jest.fn(),
    content: jest
      .fn()
      .mockResolvedValue(
        '<html><head><meta name="description" content="Enriched description"></head><body></body></html>'
      ),
    close: jest.fn(),
  };
  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
  };
  return {
    __esModule: false,
    initBrowser: jest.fn().mockResolvedValue(mockBrowser),
    close: jest.fn(),
  };
});

jest.mock('../../lib/article-store', () => {
  const store: Record<string, { description: string; readingTime?: number }> = {};
  return {
    __esModule: false,
    getDescription: jest.fn((url: string) => store[url]?.description),
    getReadingTime: jest.fn((url: string) => store[url]?.readingTime),
    hasDescription: jest.fn((url: string) => url in store && store[url].description.length > 0),
    setDescription: jest.fn((url: string, desc: string) => {
      store[url] = { ...store[url], description: desc };
    }),
    setArticleData: jest.fn((url: string, data: { description: string; readingTime?: number }) => {
      store[url] = { description: data.description, readingTime: data.readingTime };
    }),
    save: jest.fn(),
    reset: jest.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    }),
  };
});

jest.mock('../../lib/extract', () => ({
  getExtractor: jest.fn(),
}));

import scraper from '../../lib/scraper';
import articleStore from '../../lib/article-store';
import { getExtractor } from '../../lib/extract';

const mockedGetExtractor = jest.mocked(getExtractor);
const mockedArticleStore = jest.mocked(articleStore);

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    link: 'https://example.com/test',
    description: '',
    pubDate: new Date(),
    imageUrl: null,
    guid: 'https://example.com/test',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedArticleStore.reset();
});

describe('enricher', () => {
  test('skips enrichment when extractor has no enrichArticle', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
    });

    const articles = [makeArticle()];
    await enrichArticles('https://example.com', articles);

    expect(scraper.initBrowser).not.toHaveBeenCalled();
    expect(articles[0].description).toBe('');
  });

  test('applies cached description and readingTime from store', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn(),
    });

    // Pre-populate the store with both description and readingTime
    mockedArticleStore.setArticleData('https://example.com/cached', {
      description: 'Cached desc',
      readingTime: 4,
    });

    const articles = [
      makeArticle({ link: 'https://example.com/cached', guid: 'https://example.com/cached' }),
    ];
    await enrichArticles('https://example.com', articles);

    expect(articles[0].description).toBe('Cached desc');
    expect(articles[0].readingTime).toBe(4);
    expect(scraper.initBrowser).not.toHaveBeenCalled();
  });

  test('enriches articles without cached descriptions', async () => {
    const enrichArticle = jest.fn().mockReturnValue({ description: 'From page' });
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle,
    });

    const articles = [
      makeArticle({ link: 'https://example.com/new', guid: 'https://example.com/new' }),
    ];
    await enrichArticles('https://example.com', articles);

    expect(scraper.initBrowser).toHaveBeenCalled();
    expect(enrichArticle).toHaveBeenCalled();
    expect(articles[0].description).toBe('From page');
    expect(mockedArticleStore.setArticleData).toHaveBeenCalledWith('https://example.com/new', {
      description: 'From page',
      readingTime: undefined,
    });
    expect(mockedArticleStore.save).toHaveBeenCalled();
  });

  test('does not overwrite existing description', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn().mockReturnValue({ description: 'New desc' }),
    });

    const articles = [
      makeArticle({ link: 'https://example.com/has-desc', description: 'Already has one' }),
    ];
    await enrichArticles('https://example.com', articles);

    // Description from enrichment is stored but article keeps its existing one
    expect(articles[0].description).toBe('Already has one');
  });

  test('handles scraping errors gracefully per-article', async () => {
    const mockBrowser = {
      newPage: jest.fn().mockRejectedValue(new Error('Page creation failed')),
    };
    jest.mocked(scraper.initBrowser).mockResolvedValue(mockBrowser as never);

    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn(),
    });

    const articles = [makeArticle({ link: 'https://example.com/fail' })];

    // Should not throw
    await expect(enrichArticles('https://example.com', articles)).resolves.not.toThrow();
    expect(articles[0].description).toBe('');
  });

  test('applies readingTime from enrichment to article', async () => {
    // Re-establish scraper mock (previous test may have overridden it)
    const mockPage = {
      setUserAgent: jest.fn(),
      goto: jest.fn(),
      content: jest
        .fn()
        .mockResolvedValue(
          '<html><head><meta name="description" content="Enriched description"></head><body></body></html>'
        ),
      close: jest.fn(),
    };
    const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage) };
    jest.mocked(scraper.initBrowser).mockResolvedValue(mockBrowser as never);

    const enrichArticle = jest.fn().mockReturnValue({ description: 'From page', readingTime: 5 });
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle,
    });

    const articles = [
      makeArticle({ link: 'https://example.com/reading', guid: 'https://example.com/reading' }),
    ];
    await enrichArticles('https://example.com', articles);

    expect(articles[0].readingTime).toBe(5);
    expect(mockedArticleStore.setArticleData).toHaveBeenCalledWith('https://example.com/reading', {
      description: 'From page',
      readingTime: 5,
    });
  });

  test('applies cached readingTime from store', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn(),
    });

    // Pre-populate the store with description and readingTime
    mockedArticleStore.setArticleData('https://example.com/cached-rt', {
      description: 'Cached desc',
      readingTime: 3,
    });

    const articles = [
      makeArticle({
        link: 'https://example.com/cached-rt',
        guid: 'https://example.com/cached-rt',
      }),
    ];
    await enrichArticles('https://example.com', articles);

    expect(articles[0].description).toBe('Cached desc');
    expect(articles[0].readingTime).toBe(3);
    expect(scraper.initBrowser).not.toHaveBeenCalled();
  });

  test('does not save when no articles were enriched', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn(),
    });

    // All articles already fully cached (description + readingTime)
    mockedArticleStore.setArticleData('https://example.com/a', {
      description: 'Cached A',
      readingTime: 3,
    });

    const articles = [
      makeArticle({ link: 'https://example.com/a', guid: 'https://example.com/a' }),
    ];
    await enrichArticles('https://example.com', articles);

    // save() should have been called by setArticleData in setup, but not by enrichArticles
    // Clear the mock calls from setup
    mockedArticleStore.save.mockClear();
    await enrichArticles('https://example.com', articles);

    expect(mockedArticleStore.save).not.toHaveBeenCalled();
  });
});
