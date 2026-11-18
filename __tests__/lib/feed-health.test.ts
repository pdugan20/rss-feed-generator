import fs from 'fs';
import path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'data-test-feed-health');
process.env.DATA_DIR = TEST_DATA_DIR;

import { feedHealth, isHealthy, UNHEALTHY_AFTER_MS } from '../../lib/feed-health';

const MARINERS_URL = 'https://www.seattletimes.com/sports/mariners/';

function cleanup(): void {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  feedHealth.reset();
}

beforeEach(cleanup);
afterAll(() => {
  cleanup();
  delete process.env.DATA_DIR;
});

describe('feed health', () => {
  test('a failure keeps the previous success and survives a restart', () => {
    feedHealth.recordSuccess(MARINERS_URL);
    const { lastSuccessAt } = feedHealth.get(MARINERS_URL)!;
    feedHealth.recordFailure(MARINERS_URL, 'Page request limit exceeded');

    feedHealth.reset(); // simulate a new process reading the persisted file
    expect(feedHealth.get(MARINERS_URL)).toMatchObject({
      lastSuccessAt,
      lastError: 'Page request limit exceeded',
    });
  });

  test('a success clears the last error', () => {
    feedHealth.recordFailure(MARINERS_URL, 'No articles found');
    feedHealth.recordSuccess(MARINERS_URL);
    expect(feedHealth.get(MARINERS_URL)?.lastError).toBeNull();
  });

  test('ignores unregistered feeds', () => {
    feedHealth.recordFailure('https://example.com/', 'nope');
    expect(feedHealth.get('https://example.com/')).toBeNull();
  });

  test('isHealthy requires a success within the threshold', () => {
    const now = Date.now();
    expect(isHealthy(null, now)).toBe(false);
    expect(isHealthy(new Date(now - UNHEALTHY_AFTER_MS + 1000).toISOString(), now)).toBe(true);
    expect(isHealthy(new Date(now - UNHEALTHY_AFTER_MS).toISOString(), now)).toBe(false);
  });
});
