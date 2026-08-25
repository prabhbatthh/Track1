import type { TrendPoint } from '@/components/common';
import type { DailyFootfall, FootfallRange } from '@/providers/AuthProvider';

// >7 daily points get unreadably dense on a compact chart (30/90 labels in ~320px), so
// 30D/3M are shown as weekly totals instead — still real per-day data underneath (the
// daily list from the API), just bucketed coarser for display.
export function toChartPoints(daily: DailyFootfall[], range: FootfallRange): TrendPoint[] {
  if (range === '7d') {
    return daily.map((d) => ({
      label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
      value: d.visits,
    }));
  }
  const weeks: TrendPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const total = chunk.reduce((sum, d) => sum + d.visits, 0);
    const weekStart = new Date(`${chunk[0].date}T00:00:00`);
    weeks.push({
      label: weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: total,
    });
  }
  return weeks;
}
