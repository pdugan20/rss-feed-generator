/**
 * Scheduled feed health check (see .github/workflows/feed-health.yml). Reads the
 * production /status endpoint and exits non-zero when any feed is failing, so
 * GitHub's failed-workflow notification is the alert. Read-only: no tokens.
 */
import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_STATUS_URL = 'https://rss-feed-generator-production.up.railway.app/status';
const ATTEMPTS = 3;

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

export function assessStatus(status: unknown, now = Date.now()): HealthReport {
  const feeds = (status as { feeds?: StatusFeed[] } | null)?.feeds;
  if (!Array.isArray(feeds) || feeds.some((feed) => typeof feed.healthy !== 'boolean')) {
    const message = 'The /status response does not include per-feed health.';
    return { ok: false, summary: `## Feed health check failed\n\n${message}\n`, errors: [message] };
  }

  const failing = feeds.filter((feed) => !feed.healthy);
  if (failing.length === 0) {
    return { ok: true, summary: `## All ${feeds.length} feeds are healthy\n`, errors: [] };
  }

  const rows = failing.map(
    (feed) =>
      `| ${clean(feed.label)} | ${describeAge(feed.lastSuccessAt, now)} | ${clean(feed.lastError ?? 'No error recorded')} |`
  );
  const errors = failing.map(
    (feed) =>
      `${clean(feed.label)}: ${
        feed.lastSuccessAt
          ? `last updated ${describeAge(feed.lastSuccessAt, now)}`
          : 'no successful update on record'
      }. ${clean(feed.lastError ?? 'No error recorded')}`
  );
  return {
    ok: false,
    summary: [
      `## ${failing.length} of ${feeds.length} feeds are failing`,
      '',
      '| Feed | Last successful update | Last error |',
      '| --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
    errors,
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
  let report: HealthReport;
  try {
    report = assessStatus(await fetchStatus(url));
  } catch (error) {
    const message = `Could not reach ${url}: ${clean((error as Error).message)}`;
    report = {
      ok: false,
      summary: `## Feed service unreachable\n\n${message}\n`,
      errors: [message],
    };
  }

  console.log(report.summary);
  for (const error of report.errors) console.log(`::error title=Feed failing::${error}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.summary);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) void main();
