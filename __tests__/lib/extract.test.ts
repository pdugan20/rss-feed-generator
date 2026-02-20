import { getExtractor, resolveUrl, parseDate, estimateReadingTime } from '../../lib/extract';

describe('resolveUrl', () => {
  const base = 'https://www.seattletimes.com/sports/mariners/';

  test('absolute URL passes through unchanged', () => {
    const url = 'https://example.com/article';
    expect(resolveUrl(url, base)).toBe(url);
  });

  test('http URL passes through unchanged', () => {
    const url = 'http://example.com/page';
    expect(resolveUrl(url, base)).toBe(url);
  });

  test('relative URL resolved against base', () => {
    expect(resolveUrl('/sports/nfl/', base)).toBe('https://www.seattletimes.com/sports/nfl/');
  });

  test('relative path without leading slash', () => {
    const result = resolveUrl('article-slug/', base);
    expect(result).toContain('https://www.seattletimes.com/');
    expect(result).toContain('article-slug');
  });

  test('null input returns null', () => {
    expect(resolveUrl(null, base)).toBeNull();
  });

  test('undefined input returns null', () => {
    expect(resolveUrl(undefined, base)).toBeNull();
  });

  test('empty string returns null', () => {
    expect(resolveUrl('', base)).toBeNull();
  });
});

describe('parseDate', () => {
  test('ISO date string parses correctly', () => {
    const result = parseDate('2025-06-15T10:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2025-06-15T10:00:00.000Z');
  });

  test('date-only string parses', () => {
    const result = parseDate('2025-06-15');
    expect(result).toBeInstanceOf(Date);
  });

  test('human-readable date parses', () => {
    const result = parseDate('June 15, 2025');
    expect(result).toBeInstanceOf(Date);
  });

  test('null input returns null', () => {
    expect(parseDate(null)).toBeNull();
  });

  test('empty string returns null', () => {
    expect(parseDate('')).toBeNull();
  });

  test('invalid date string returns null', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });
});

describe('estimateReadingTime', () => {
  test('returns 1 for very short text', () => {
    expect(estimateReadingTime('hello world')).toBe(1);
  });

  test('returns 1 for empty text', () => {
    expect(estimateReadingTime('')).toBe(1);
  });

  test('estimates 1 minute for 238 words', () => {
    const text = Array(238).fill('word').join(' ');
    expect(estimateReadingTime(text)).toBe(1);
  });

  test('estimates 2 minutes for ~476 words', () => {
    const text = Array(476).fill('word').join(' ');
    expect(estimateReadingTime(text)).toBe(2);
  });

  test('estimates 4 minutes for 1000 words', () => {
    const text = Array(1000).fill('word').join(' ');
    expect(estimateReadingTime(text)).toBe(4); // 1000/238 = 4.2, rounds to 4
  });

  test('handles whitespace-only text', () => {
    expect(estimateReadingTime('   \n\t  ')).toBe(1);
  });
});

describe('getExtractor', () => {
  test('returns seattle-times extractor for known Seattle Times URL', () => {
    const extractor = getExtractor('https://www.seattletimes.com/sports/mariners/');
    expect(extractor).toBeDefined();
    expect(typeof extractor.extract).toBe('function');
  });

  test('returns generic extractor for unknown URL', () => {
    const extractor = getExtractor('https://unknown-site.org/');
    expect(extractor).toBeDefined();
    expect(typeof extractor.extract).toBe('function');
  });

  test('different URLs can map to different extractors', () => {
    const st = getExtractor('https://www.seattletimes.com/sports/mariners/');
    const generic = getExtractor('https://unknown.com/');
    expect(st).not.toBe(generic);
  });
});
