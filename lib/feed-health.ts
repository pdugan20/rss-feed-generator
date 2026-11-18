import fs from 'fs';
import path from 'path';
import { getLabel } from './feeds';

/**
 * A feed is unhealthy once it has gone this long without a successful refresh.
 * The daily refresh runs at 13:00 UTC, so a single transient failure does not
 * alert; two consecutive failed days do.
 */
export const UNHEALTHY_AFTER_MS = 36 * 60 * 60 * 1000;

export interface FeedHealthRecord {
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const HEALTH_FILE = path.join(DATA_DIR, 'feed-health.json');
const MAX_ERROR_LENGTH = 300;

export function isHealthy(lastSuccessAt: string | null, now = Date.now()): boolean {
  if (!lastSuccessAt) return false;
  const time = new Date(lastSuccessAt).getTime();
  return !isNaN(time) && now - time < UNHEALTHY_AFTER_MS;
}

/** Persisted per-feed refresh outcomes. Recording never throws into feed serving. */
class FeedHealth {
  private records: Record<string, FeedHealthRecord> | null = null;

  get(url: string): FeedHealthRecord | null {
    const label = getLabel(url);
    return (label && this.load()[label]) || null;
  }

  recordSuccess(url: string): void {
    const now = new Date().toISOString();
    this.update(url, () => ({ lastAttemptAt: now, lastSuccessAt: now, lastError: null }));
  }

  recordFailure(url: string, message: string): void {
    this.update(url, (previous) => ({
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      lastError: message.substring(0, MAX_ERROR_LENGTH) || 'Unknown error',
    }));
  }

  /** Reset in-memory state (for testing) */
  reset(): void {
    this.records = null;
  }

  private update(
    url: string,
    next: (previous: FeedHealthRecord | undefined) => FeedHealthRecord
  ): void {
    const label = getLabel(url);
    if (!label) return;
    const records = this.load();
    records[label] = next(records[label]);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmpPath = HEALTH_FILE + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2), 'utf-8');
      fs.renameSync(tmpPath, HEALTH_FILE);
    } catch (error) {
      console.error(`Feed health: could not save: ${(error as Error).message}`);
    }
  }

  private load(): Record<string, FeedHealthRecord> {
    if (this.records) return this.records;
    try {
      this.records = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf-8')) as Record<
        string,
        FeedHealthRecord
      >;
    } catch {
      this.records = {};
    }
    return this.records;
  }
}

export const feedHealth = new FeedHealth();
