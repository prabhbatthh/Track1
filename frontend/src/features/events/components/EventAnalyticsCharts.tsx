import { cn } from '@/lib/cn';

const ROLE_BAR_COLORS = [
  'bg-primary',
  'bg-info',
  'bg-success',
  'bg-warning',
  'bg-ink',
  'bg-danger',
];

export interface FillRateDonutProps {
  percent: number;
  registered: number;
  capacity: number;
  label: string;
}

export function FillRateDonut({ percent, registered, capacity, label }: FillRateDonutProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex size-28 shrink-0 items-center justify-center"
        role="img"
        aria-label={`${label}: ${Math.round(clamped)}%`}
      >
        <svg className="size-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="var(--color-secondary)"
            strokeWidth="10"
            fill="transparent"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="var(--color-primary)"
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-foreground">{Math.round(clamped)}%</span>
          <span className="text-[10px] text-muted-foreground">
            {registered}/{capacity}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export interface RoleBreakdownBarsProps {
  data: { role: string; count: number }[];
  label: string;
}

export function RoleBreakdownBars({ data, label }: RoleBreakdownBarsProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={d.role} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-xs capitalize text-foreground">
              {d.role}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  ROLE_BAR_COLORS[i % ROLE_BAR_COLORS.length],
                )}
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-semibold text-foreground">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface RegistrationTrendChartProps {
  registeredAtDates: string[];
  label: string;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 72;
const CHART_PADDING = 6;

// A plain helper, not inlined in the component: react-hooks/immutability flags any
// reassignment inside a component body (the React Compiler can't prove a mutable
// accumulator stays safe under speculative re-execution), even one scoped fresh to
// each render like this. Outside the component, the same running-sum loop is fine.
function cumulativeCounts(days: string[], dayBuckets: Map<string, number>): number[] {
  let cumulative = 0;
  return days.map((day) => {
    cumulative += dayBuckets.get(day) ?? 0;
    return cumulative;
  });
}

export function RegistrationTrendChart({ registeredAtDates, label }: RegistrationTrendChartProps) {
  const dayBuckets = new Map<string, number>();
  for (const iso of registeredAtDates) {
    const day = iso.slice(0, 10);
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
  }
  const days = [...dayBuckets.keys()].sort();

  // A single-day cluster of registrations doesn't tell a "trend" story.
  if (days.length < 2) return null;

  const points = cumulativeCounts(days, dayBuckets);
  const maxCount = points[points.length - 1] || 1;

  const coords = points.map((count, i) => {
    const x =
      points.length === 1
        ? CHART_WIDTH / 2
        : CHART_PADDING + (i / (points.length - 1)) * (CHART_WIDTH - CHART_PADDING * 2);
    const y = CHART_HEIGHT - CHART_PADDING - (count / maxCount) * (CHART_HEIGHT - CHART_PADDING * 2);
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${CHART_HEIGHT - CHART_PADDING} L ${coords[0].x} ${CHART_HEIGHT - CHART_PADDING} Z`;

  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={label}
      >
        <path d={areaPath} fill="var(--color-primary)" opacity={0.12} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={2.5} fill="var(--color-primary)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDay(days[0])}</span>
        <span>{formatDay(days[days.length - 1])}</span>
      </div>
    </div>
  );
}
