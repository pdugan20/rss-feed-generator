import { assessStatus, scheduledSlot } from '../scripts/check-feed-health';

const HOUR = 3_600_000;
// Wednesday 2026-11-18, 40 minutes after the 14:30 UTC slot (a late GitHub start).
const WEDNESDAY = Date.parse('2026-11-18T15:10:00Z');
const MONDAY = Date.parse('2026-11-16T14:35:00Z');
const SLOT = Date.parse('2026-11-18T14:30:00Z');

function feed(label: string, lastSuccessAt: string | null, lastError: string | null = null) {
  return { label, url: 'u', healthy: false, lastSuccessAt, lastError };
}
const iso = (ms: number) => new Date(ms).toISOString();

describe('feed health check', () => {
  test('passes when every feed is healthy', () => {
    const report = assessStatus(
      { feeds: [{ label: 'mariners', url: 'u', healthy: true, lastSuccessAt: null }] },
      { now: WEDNESDAY, scheduled: true }
    );
    expect(report).toMatchObject({ ok: true, errors: [], warnings: [] });
  });

  test('anchors scheduled runs to the planned slot, not the late start time', () => {
    expect(scheduledSlot(WEDNESDAY)).toBe(SLOT);
    expect(scheduledSlot(Date.parse('2026-11-18T09:00:00Z'))).toBe(SLOT - 24 * HOUR);
  });

  test('a scheduled run alerts only on feeds that crossed the threshold since the last slot', () => {
    const status = {
      feeds: [
        { label: 'claude-blog', url: 'u', healthy: true },
        // Crossed 36h one hour before this slot: new breakage.
        feed('mariners', iso(SLOT - 37 * HOUR), 'Page request limit exceeded (script 90 | xhr 39)'),
        // Crossed 36h a day ago: already reported yesterday.
        feed('huskies', iso(SLOT - 61 * HOUR), 'Page request limit exceeded'),
      ],
    };
    const report = assessStatus(status, { now: WEDNESDAY, scheduled: true });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      'mariners: last updated 38 hours ago. Page request limit exceeded (script 90   xhr 39)',
    ]);
    expect(report.warnings).toEqual([
      'huskies: last updated 3 days ago. Page request limit exceeded',
    ]);
    expect(report.summary).toContain('2 of 3 feeds are failing');
    expect(report.summary).toContain(
      '| huskies | 3 days ago | Page request limit exceeded | Already reported |'
    );
  });

  test('a scheduled run passes when every failing feed was already reported', () => {
    const report = assessStatus(
      { feeds: [feed('huskies', iso(SLOT - 10 * 24 * HOUR))] },
      { now: WEDNESDAY, scheduled: true }
    );
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(1);
  });

  test('the Monday run reminds about every feed that is still failing', () => {
    const report = assessStatus(
      { feeds: [feed('huskies', iso(MONDAY - 10 * 24 * HOUR))] },
      { now: MONDAY, scheduled: true }
    );
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
  });

  test('a feed with no recorded success always alerts', () => {
    const report = assessStatus(
      { feeds: [feed('ap-mariners-photos', null)] },
      { now: WEDNESDAY, scheduled: true }
    );
    expect(report.errors).toEqual([
      'ap-mariners-photos: no successful update on record. No error recorded',
    ]);
  });

  test('a manual run alerts on every failing feed', () => {
    const report = assessStatus(
      { feeds: [feed('huskies', iso(SLOT - 10 * 24 * HOUR))] },
      { now: WEDNESDAY }
    );
    expect(report.ok).toBe(false);
  });

  test('fails when the status response predates per-feed health', () => {
    const report = assessStatus(
      { feeds: [{ label: 'mariners', url: 'u', cached: true }] },
      { now: WEDNESDAY, scheduled: true }
    );
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toMatch(/per-feed health/);
  });
});
