import fs from 'fs';
import path from 'path';
import type { GeneratedFeeds } from './types';
import { getLabel } from './feeds';

interface FeedCacheEntry {
  feeds: GeneratedFeeds;
  sourceUrl: string;
  articleCount: number;
  cachedAt: string;
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FEEDS_DIR = path.join(DATA_DIR, 'feeds');
const DEFAULT_MAX_AGE_MS = 86400000; // 24 hours

class FeedStore {
  get(url: string): FeedCacheEntry | null {
    const filePath = this.getFilePath(url);
    if (!filePath) return null;

    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(raw) as FeedCacheEntry;

      if (!entry.feeds || !entry.feeds.rss || !entry.feeds.atom || !entry.feeds.json) {
        console.log(`Feed store: invalid entry for ${url}, ignoring`);
        return null;
      }

      return entry;
    } catch {
      console.log(`Feed store: could not read cache for ${url}`);
      return null;
    }
  }

  set(url: string, feeds: GeneratedFeeds, articleCount: number): void {
    const filePath = this.getFilePath(url);
    if (!filePath) return;

    const entry: FeedCacheEntry = {
      feeds,
      sourceUrl: url,
      articleCount,
      cachedAt: new Date().toISOString(),
    };

    if (!fs.existsSync(FEEDS_DIR)) {
      fs.mkdirSync(FEEDS_DIR, { recursive: true });
    }

    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(entry, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  has(url: string): boolean {
    const filePath = this.getFilePath(url);
    if (!filePath) return false;
    return fs.existsSync(filePath);
  }

  isStale(url: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS): boolean {
    const entry = this.get(url);
    if (!entry) return true;

    const cachedTime = new Date(entry.cachedAt).getTime();
    if (isNaN(cachedTime)) return true;

    return Date.now() - cachedTime >= maxAgeMs;
  }

  getMetadata(url: string): { cachedAt: string; articleCount: number } | null {
    const entry = this.get(url);
    if (!entry) return null;
    return { cachedAt: entry.cachedAt, articleCount: entry.articleCount };
  }

  /** Reset state (for testing) */
  reset(): void {
    // No in-memory state to clear; exists for pattern consistency
  }

  private getFilePath(url: string): string | null {
    const label = getLabel(url);
    if (!label) return null;
    return path.join(FEEDS_DIR, `${label}.json`);
  }
}

export = new FeedStore();
