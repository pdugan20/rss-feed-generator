import fs from 'fs';
import path from 'path';

// Set DATA_DIR before importing article-store so it uses our test directory
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'data-test-article-store');
process.env.DATA_DIR = TEST_DATA_DIR;

import articleStore from '../../lib/article-store';

const STORE_FILE = path.join(TEST_DATA_DIR, 'articles.json');

function cleanup(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
  articleStore.reset();
}

beforeEach(() => {
  cleanup();
});

afterAll(() => {
  cleanup();
  delete process.env.DATA_DIR;
});

describe('article-store', () => {
  test('stores and retrieves a description', () => {
    articleStore.setDescription('https://example.com/post-1', 'A test description');
    expect(articleStore.getDescription('https://example.com/post-1')).toBe('A test description');
  });

  test('hasDescription returns false for unknown URLs', () => {
    expect(articleStore.hasDescription('https://example.com/unknown')).toBe(false);
  });

  test('hasDescription returns true after setting description', () => {
    articleStore.setDescription('https://example.com/post-2', 'Some text');
    expect(articleStore.hasDescription('https://example.com/post-2')).toBe(true);
  });

  test('hasDescription returns false for empty descriptions', () => {
    articleStore.setDescription('https://example.com/empty', '');
    expect(articleStore.hasDescription('https://example.com/empty')).toBe(false);
  });

  test('persists to disk and reloads', () => {
    articleStore.setDescription('https://example.com/persist', 'Persisted description');
    articleStore.save();

    expect(fs.existsSync(STORE_FILE)).toBe(true);

    // Reset in-memory state to force reload from disk
    articleStore.reset();

    expect(articleStore.getDescription('https://example.com/persist')).toBe(
      'Persisted description'
    );
  });

  test('creates data directory if it does not exist', () => {
    expect(fs.existsSync(TEST_DATA_DIR)).toBe(false);
    articleStore.setDescription('https://example.com/dir-test', 'test');
    articleStore.save();
    expect(fs.existsSync(TEST_DATA_DIR)).toBe(true);
  });

  test('handles missing file gracefully', () => {
    // No file exists, should start with empty store
    expect(articleStore.getDescription('https://example.com/missing')).toBeUndefined();
  });

  test('handles corrupt file gracefully', () => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, 'not valid json!!!', 'utf-8');

    articleStore.reset();
    expect(articleStore.getDescription('https://example.com/corrupt')).toBeUndefined();
  });

  test('stores and retrieves readingTime via setArticleData', () => {
    articleStore.setArticleData('https://example.com/rt', {
      description: 'A description',
      readingTime: 5,
    });
    expect(articleStore.getDescription('https://example.com/rt')).toBe('A description');
    expect(articleStore.getReadingTime('https://example.com/rt')).toBe(5);
  });

  test('getReadingTime returns undefined for articles without it', () => {
    articleStore.setDescription('https://example.com/no-rt', 'A description');
    expect(articleStore.getReadingTime('https://example.com/no-rt')).toBeUndefined();
  });

  test('readingTime persists to disk and reloads', () => {
    articleStore.setArticleData('https://example.com/rt-persist', {
      description: 'Desc',
      readingTime: 8,
    });
    articleStore.save();

    articleStore.reset();

    expect(articleStore.getReadingTime('https://example.com/rt-persist')).toBe(8);
    expect(articleStore.getDescription('https://example.com/rt-persist')).toBe('Desc');
  });

  test('setDescription records fetchedAt timestamp', () => {
    articleStore.setDescription('https://example.com/timestamp', 'test');
    articleStore.save();

    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    expect(raw['https://example.com/timestamp'].fetchedAt).toBeDefined();
    expect(new Date(raw['https://example.com/timestamp'].fetchedAt).getTime()).not.toBeNaN();
  });
});
