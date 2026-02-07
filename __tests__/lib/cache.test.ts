import cache from '../../lib/cache';

afterEach(() => {
  cache.flushAll();
});

describe('cache', () => {
  test('get returns undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('set then get returns the value', () => {
    cache.set('feed:test', '<rss>data</rss>');
    expect(cache.get('feed:test')).toBe('<rss>data</rss>');
  });

  test('del removes the key', () => {
    cache.set('feed:test', 'value');
    cache.del('feed:test');
    expect(cache.get('feed:test')).toBeUndefined();
  });

  test('returns same object reference (useClones: false)', () => {
    const obj = { xml: '<rss/>' };
    cache.set('feed:ref', obj);
    const retrieved = cache.get('feed:ref');
    expect(retrieved).toBe(obj);
  });

  test('options are configured correctly', () => {
    expect(cache.options.stdTTL).toBe(86400);
    expect(cache.options.checkperiod).toBe(3600);
    expect(cache.options.useClones).toBe(false);
    expect(cache.options.maxKeys).toBe(100);
  });
});
