import { assessStatus } from '../scripts/check-feed-health';

const NOW = Date.parse('2026-11-18T14:30:00Z');

describe('feed health check', () => {
  test('passes when every feed is healthy', () => {
    const report = assessStatus(
      { feeds: [{ label: 'mariners', url: 'u', healthy: true, lastSuccessAt: null }] },
      NOW
    );
    expect(report).toMatchObject({ ok: true, errors: [] });
  });

  test('lists each failing feed with its age and last error', () => {
    const report = assessStatus(
      {
        feeds: [
          { label: 'claude-blog', url: 'u', healthy: true },
          {
            label: 'mariners',
            url: 'u',
            healthy: false,
            lastSuccessAt: '2026-11-03T13:00:35Z',
            lastError: 'Page request limit exceeded (129 fetched: script 90 | xhr 39)',
          },
          { label: 'ap-mariners-photos', url: 'u', healthy: false, lastSuccessAt: null },
        ],
      },
      NOW
    );

    expect(report.ok).toBe(false);
    expect(report.summary).toContain('2 of 3 feeds are failing');
    expect(report.summary).toContain(
      '| mariners | 15 days ago | Page request limit exceeded (129 fetched: script 90   xhr 39) |'
    );
    expect(report.errors).toEqual([
      'mariners: last updated 15 days ago. Page request limit exceeded (129 fetched: script 90   xhr 39)',
      'ap-mariners-photos: no successful update on record. No error recorded',
    ]);
  });

  test('fails when the status response predates per-feed health', () => {
    const report = assessStatus({ feeds: [{ label: 'mariners', url: 'u', cached: true }] }, NOW);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toMatch(/per-feed health/);
  });
});
