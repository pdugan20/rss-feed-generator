/**
 * Scheduled feed health check (see .github/workflows/feed-health.yml). Reads the
 * production /status endpoint and exits non-zero when it should alert, so
 * GitHub's failed-workflow notification is the alert. Read-only: no tokens.
 *
 * Scheduled runs alert once per breakage: on the run after a feed crosses the
 * unhealthy threshold, then again on Mondays while it stays broken. An
 * unreachable service alerts every run. Manual runs alert on any failing feed.
 */
import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { UNHEALTHY_AFTER_MS } from '../lib/feed-health';

const DEFAULT_STATUS_URL = 'https://rss-feed-generator-production.up.railway.app/status';
const ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// Must match the cron in .github/workflows/feed-health.yml (14:30 UTC).
const SCHEDULE_UTC_MINUTES = 14 * 60 + 30;
const REMINDER_UTC_DAY = 1; // Monday

interface StatusFeed {
  label: string;
  url: string;
  healthy?: boolean;
  lastSuccessAt?: string | null;
  lastError?: string | null;
}

export interface HealthReport {
  ok: boolean;
  summary: string;
  errors: string[];
  warnings: string[];
}

export interface AssessOptions {
  now?: number;
  /** Scheduled runs alert once per breakage plus a weekly reminder. */
  scheduled?: boolean;
}

/** The planned start of the scheduled run covering `now`, ignoring GitHub's start delay. */
export function scheduledSlot(now: number): number {
  const day = new Date(now);
  const slot =
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) +
    SCHEDULE_UTC_MINUTES * 60_000;
  return slot <= now ? slot : slot - DAY_MS;
}

function describeAge(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const hours = Math.round((now - new Date(iso).getTime()) / 3_600_000);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
}

/** Markdown and inline-safe text: no table breaks, workflow-command escapes or HTML. */
function clean(text: string): string {
  return text.replace(/[\r\n|%<>]/g, ' ').trim();
}

function describe(feed: StatusFeed, now: number): string {
  const age = feed.lastSuccessAt
    ? `last updated ${describeAge(feed.lastSuccessAt, now)}`
    : 'no successful update on record';
  return `${clean(feed.label)}: ${age}. ${clean(feed.lastError ?? 'No error recorded')}`;
}

export function assessStatus(status: unknown, options: AssessOptions = {}): HealthReport {
  const now = options.now ?? Date.now();
  const feeds = (status as { feeds?: StatusFeed[] } | null)?.feeds;
  if (!Array.isArray(feeds) || feeds.some((feed) => typeof feed.healthy !== 'boolean')) {
    const message = 'The /status response does not include per-feed health.';
    return {
      ok: false,
      summary: `## Feed health check failed\n\n${message}\n`,
      errors: [message],
      warnings: [],
    };
  }

  const failing = feeds.filter((feed) => !feed.healthy);
  if (failing.length === 0) {
    return {
      ok: true,
      summary: `## All ${feeds.length} feeds are healthy\n`,
      errors: [],
      warnings: [],
    };
  }

  const slot = scheduledSlot(now);
  const reminderDay = new Date(slot).getUTCDay() === REMINDER_UTC_DAY;
  // A feed is newly failing when it crossed the threshold since the previous slot.
  // Feeds that never succeeded have no crossing time, so they always alert.
  const isNew = (feed: StatusFeed) => {
    if (!feed.lastSuccessAt) return true;
    const crossedAt = new Date(feed.lastSuccessAt).getTime() + UNHEALTHY_AFTER_MS;
    return crossedAt > slot - DAY_MS && crossedAt <= slot;
  };
  const alerting =
    !options.scheduled || reminderDay ? failing : failing.filter((feed) => isNew(feed));
  const quiet = failing.filter((feed) => !alerting.includes(feed));

  const rows = failing.map(
    (feed) =>
      `| ${clean(feed.label)} | ${describeAge(feed.lastSuccessAt, now)} | ${clean(feed.lastError ?? 'No error recorded')} | ${alerting.includes(feed) ? 'Yes' : 'Already reported'} |`
  );
  const footer =
    quiet.length > 0
      ? ['', 'Feeds already reported alert again on Monday while they stay broken.', '']
      : [''];
  return {
    ok: alerting.length === 0,
    summary: [
      `## ${failing.length} of ${feeds.length} feeds are failing`,
      '',
      '| Feed | Last successful update | Last error | Alerted this run |',
      '| --- | --- | --- | --- |',
      ...rows,
      ...footer,
    ].join('\n'),
    errors: alerting.map((feed) => describe(feed, now)),
    warnings: quiet.map((feed) => describe(feed, now)),
  };
}

async function fetchStatus(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await delay(10_000);
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const url = process.env.FEED_STATUS_URL || DEFAULT_STATUS_URL;
  const scheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
  let report: HealthReport;
  try {
    report = assessStatus(await fetchStatus(url), { scheduled });
  } catch (error) {
    const message = `Could not reach ${url}: ${clean((error as Error).message)}`;
    report = {
      ok: false,
      summary: `## Feed service unreachable\n\n${message}\n`,
      errors: [message],
      warnings: [],
    };
  }

  console.log(report.summary);
  for (const error of report.errors) console.log(`::error title=Feed failing::${error}`);
  for (const warning of report.warnings)
    console.log(`::warning title=Feed still failing::${warning}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.summary);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) void main();
