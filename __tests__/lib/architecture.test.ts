import path from 'path';
import fs from 'fs';
import { feeds } from '../../lib/feeds';
import { getExtractor } from '../../lib/extract';

describe('architecture consistency', () => {
  const extractorNames = [...new Set(feeds.map((f) => f.extractor))];

  test.each(extractorNames)('extractor "%s" is registered and exports extract()', (name) => {
    const feed = feeds.find((f) => f.extractor === name);
    const extractor = getExtractor(feed!.url);
    expect(typeof extractor.extract).toBe('function');
  });

  test.each(extractorNames)('extractor "%s" has a test file', (name) => {
    const testPath = path.join(__dirname, 'extractors', `${name}.test.ts`);
    expect(fs.existsSync(testPath)).toBe(true);
  });

  test('every feed has a label', () => {
    for (const feed of feeds) {
      expect(typeof feed.label).toBe('string');
      expect(feed.label.length).toBeGreaterThan(0);
    }
  });

  test('no duplicate labels', () => {
    const labels = feeds.map((f) => f.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});
