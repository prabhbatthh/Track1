import { describe, expect, it } from 'vitest';

import type { DailyFootfall } from '@/providers/AuthProvider';

import { toChartPoints } from './footfallChartPoints';

function daily(entries: [string, number][]): DailyFootfall[] {
  return entries.map(([date, visits]) => ({ date, visits }));
}

describe('toChartPoints', () => {
  it('keeps one point per day for the 7-day range', () => {
    const points = toChartPoints(
      daily([
        ['2026-08-01', 3],
        ['2026-08-02', 5],
      ]),
      '7d',
    );
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.value)).toEqual([3, 5]);
  });

  it('buckets 30 days into weekly totals', () => {
    const thirtyDays = daily(
      Array.from({ length: 30 }, (_, i) => [
        `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
        1,
      ] as [string, number]),
    );
    const points = toChartPoints(thirtyDays, '30d');
    // 30 days / 7-day chunks = 5 buckets (4 full weeks + a 2-day remainder).
    expect(points).toHaveLength(5);
    expect(points.slice(0, 4).every((p) => p.value === 7)).toBe(true);
    expect(points[4].value).toBe(2);
  });

  it('sums visits within each weekly bucket rather than dropping any', () => {
    const points = toChartPoints(
      daily([
        ['2026-08-01', 2],
        ['2026-08-02', 4],
        ['2026-08-03', 0],
      ]),
      '30d',
    );
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(6);
  });
});
