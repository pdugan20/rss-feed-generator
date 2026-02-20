import fs from 'fs';
import path from 'path';

// Set DATA_DIR before importing feed-store so it uses our test directory
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'data-test-feed-store');
process.env.DATA_DIR = TEST_DATA_DIR;

import feedStore from '../../lib/feed-store';
import type { GeneratedFeeds } from '../../lib/types';

const FEEDS_DIR = path.join(TEST_DATA_DIR, 'feeds');

const MOCK_FEEDS: GeneratedFeeds = {
  rss: '<rss>test rss</rss>',
  atom: '<feed>test atom</feed>',
  json: '{"version":"https://jsonfeed.org/version/1","items":[]}',
};

// Use a URL from the feeds config so getLabel() works
const TEST_URL = 'https://www.seattletimes.com/sports/mariners/';
const TEST_LABEL = 'mariners';

function cleanup(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
  feedStore.reset();
}

beforeEach(() => {
  cleanup();
});

afterAll(() => {
  cleanup();
  delete process.env.DATA_DIR;
});

describe('feed-store', () => {
  test('returns null for uncached feed', () => {
    expect(feedStore.get(TEST_URL)).toBeNull();
  });

  test('has() returns false for uncached feed', () => {
    expect(feedStore.has(TEST_URL)).toBe(false);
  });

  test('stores and retrieves feeds', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 5);
    const entry = feedStore.get(TEST_URL);

    expect(entry).not.toBeNull();
    expect(entry!.feeds.rss).toBe(MOCK_FEEDS.rss);
    expect(entry!.feeds.atom).toBe(MOCK_FEEDS.atom);
    expect(entry!.feeds.json).toBe(MOCK_FEEDS.json);
    expect(entry!.articleCount).toBe(5);
    expect(entry!.sourceUrl).toBe(TEST_URL);
  });

  test('has() returns true after set()', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 5);
    expect(feedStore.has(TEST_URL)).toBe(true);
  });

  test('creates feeds directory if it does not exist', () => {
    expect(fs.existsSync(FEEDS_DIR)).toBe(false);
    feedStore.set(TEST_URL, MOCK_FEEDS, 3);
    expect(fs.existsSync(FEEDS_DIR)).toBe(true);
  });

  test('writes file with correct label-based name', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 3);
    const filePath = path.join(FEEDS_DIR, `${TEST_LABEL}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('persists cachedAt timestamp', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 3);
    const entry = feedStore.get(TEST_URL);
    expect(entry!.cachedAt).toBeDefined();
    expect(new Date(entry!.cachedAt).getTime()).not.toBeNaN();
  });

  test('isStale returns true for missing feeds', () => {
    expect(feedStore.isStale(TEST_URL)).toBe(true);
  });

  test('isStale returns false for fresh feeds', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 3);
    expect(feedStore.isStale(TEST_URL)).toBe(false);
  });

  test('isStale returns true for old feeds with small maxAge', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 3);
    // 0ms maxAge means everything is stale
    expect(feedStore.isStale(TEST_URL, 0)).toBe(true);
  });

  test('handles corrupt file gracefully', () => {
    fs.mkdirSync(FEEDS_DIR, { recursive: true });
    fs.writeFileSync(path.join(FEEDS_DIR, `${TEST_LABEL}.json`), 'not valid json!!!', 'utf-8');
    expect(feedStore.get(TEST_URL)).toBeNull();
  });

  test('handles file with missing feed fields gracefully', () => {
    fs.mkdirSync(FEEDS_DIR, { recursive: true });
    const badEntry = { feeds: { rss: '<rss/>' }, cachedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(FEEDS_DIR, `${TEST_LABEL}.json`), JSON.stringify(badEntry), 'utf-8');
    expect(feedStore.get(TEST_URL)).toBeNull();
  });

  test('returns null for unknown URL', () => {
    expect(feedStore.get('https://unknown.example.com/')).toBeNull();
  });

  test('getMetadata returns metadata for cached feed', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 7);
    const meta = feedStore.getMetadata(TEST_URL);
    expect(meta).not.toBeNull();
    expect(meta!.articleCount).toBe(7);
    expect(meta!.cachedAt).toBeDefined();
  });

  test('getMetadata returns null for uncached feed', () => {
    expect(feedStore.getMetadata(TEST_URL)).toBeNull();
  });

  test('atomic write does not leave tmp file', () => {
    feedStore.set(TEST_URL, MOCK_FEEDS, 3);
    const tmpPath = path.join(FEEDS_DIR, `${TEST_LABEL}.json.tmp`);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });
});
