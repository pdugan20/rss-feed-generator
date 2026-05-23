import { extract } from '../../../lib/extractors/hackernews-top';

describe('hackernews-top extractor', () => {
  test('exports extract as a function', () => {
    expect(typeof extract).toBe('function');
  });

  test('returns empty array (API feeds bypass DOM extraction)', () => {
    expect(extract()).toEqual([]);
  });
});
