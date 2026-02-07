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
  const store: Record<string, string> = {};
  return {
    __esModule: false,
    getDescription: jest.fn((url: string) => store[url]),
    hasDescription: jest.fn((url: string) => url in store && store[url].length > 0),
    setDescription: jest.fn((url: string, desc: string) => {
      store[url] = desc;
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

  test('applies cached description from store', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn(),
    });

    // Pre-populate the store
    mockedArticleStore.setDescription('https://example.com/cached', 'Cached desc');

    const articles = [
      makeArticle({ link: 'https://example.com/cached', guid: 'https://example.com/cached' }),
    ];
    await enrichArticles('https://example.com', articles);

    expect(articles[0].description).toBe('Cached desc');
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
    expect(mockedArticleStore.setDescription).toHaveBeenCalledWith(
      'https://example.com/new',
      'From page'
    );
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

  test('does not save when no articles were enriched', async () => {
    mockedGetExtractor.mockReturnValue({
      extract: jest.fn().mockReturnValue([]),
      enrichArticle: jest.fn(),
    });

    // All articles already cached
    mockedArticleStore.setDescription('https://example.com/a', 'Cached A');

    const articles = [
      makeArticle({ link: 'https://example.com/a', guid: 'https://example.com/a' }),
    ];
    await enrichArticles('https://example.com', articles);

    // save() should have been called by setDescription in setup, but not by enrichArticles
    // Clear the mock calls from setup
    mockedArticleStore.save.mockClear();
    await enrichArticles('https://example.com', articles);

    expect(mockedArticleStore.save).not.toHaveBeenCalled();
  });
});
