import { extract } from '../../../lib/extractors/ap-photos';

describe('ap-photos extractor', () => {
  test('exports extract as a function', () => {
    expect(typeof extract).toBe('function');
  });

  test('returns empty array (API feeds bypass DOM extraction)', () => {
    expect(extract()).toEqual([]);
  });
});
