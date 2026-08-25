import { useId } from 'react';

import { cn } from '@/lib/cn';

export interface TrendPoint {
  label: string;
  value: number;
}

export interface TrendLineChartProps {
  data: TrendPoint[];
  /** CSS color value, e.g. 'var(--color-primary)'. */
  color?: string;
  valueFormatter?: (value: number) => string;
  className?: string;
  /** Accessible name for the chart — the svg carries role="img", so axe/screen readers
   * need this to describe what it's a chart of (e.g. the card's own title text). */
  ariaLabel: string;
  /** Prefixes each y-axis tick, e.g. '₹'. */
  axisPrefix?: string;
  /** Suffixes each y-axis tick, e.g. '%'. */
  axisSuffix?: string;
}

// Plot geometry: a fixed left gutter for axis-tick text, a top strip for the endpoint
// label, everything else the actual plot. The container's aspect-ratio is locked to
// this box (see `aspect-[...]` below) so the svg never needs non-uniform scaling —
// with real <text> and ringed <circle> markers now inside it, distorted scaling would
// stretch glyphs and turn dots into ellipses.
const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 168;
const PLOT_LEFT = 30;
const PLOT_RIGHT = 6;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 20;
const PLOT_WIDTH = VIEW_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const TICK_COUNT = 4;

interface Coord {
  x: number;
  y: number;
}

// Smooth curve: each segment is a cubic bezier with control points at the horizontal
// midpoint between the two points, so the curve eases in/out of every data point
// instead of the straight-line kinks a plain M/L path draws. Shared by every chart in
// this file so they all read as the same visual language.
function buildSmoothPath(coords: Coord[]): string {
  return coords.reduce((path, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const prev = coords[i - 1];
    const midX = (prev.x + point.x) / 2;
    return `${path} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function xFor(index: number, count: number): number {
  return count === 1 ? PLOT_LEFT + PLOT_WIDTH / 2 : PLOT_LEFT + (index / (count - 1)) * PLOT_WIDTH;
}

// Bar groups need their own half-band clearance from the plot edges (so the outermost
// bars don't hang off the edge), unlike line-chart points which sit flush on them —
// each index gets the center of its own equal-width band instead.
function bandXFor(index: number, count: number): number {
  return PLOT_LEFT + (index + 0.5) * (PLOT_WIDTH / count);
}

function yFor(value: number, axisMax: number): number {
  return PLOT_TOP + PLOT_HEIGHT - (axisMax === 0 ? 0 : (value / axisMax) * PLOT_HEIGHT);
}

// Rounds max up to a "nice" step (1/2/5 x a power of ten) so gridlines land on clean
// numbers — 0, 10, 20... never 0, 13, 26. All current chart data is non-negative
// (counts, currency, percentages), so every axis anchors at 0.
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function GridLines({
  ticks,
  axisMax,
  prefix,
  suffix,
}: {
  ticks: number[];
  axisMax: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <>
      {ticks.map((tick) => {
        const y = yFor(tick, axisMax);
        return (
          <g key={tick}>
            <line
              x1={PLOT_LEFT}
              y1={y}
              x2={VIEW_WIDTH - PLOT_RIGHT}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={PLOT_LEFT - 5}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              fill="var(--color-muted-foreground)"
            >
              {prefix}
              {compactNumber(tick)}
              {suffix}
            </text>
          </g>
        );
      })}
    </>
  );
}

const MAX_X_LABELS = 7;
// Rough glyph metrics at fontSize 9 — good enough to size a safe stride, not pixel-exact.
const AXIS_CHAR_WIDTH = 5.3;
const AXIS_LABEL_GAP = 8;

// `x` per label is supplied by the caller — line charts position labels flush with the
// plot edges (xFor), bar charts center them under their own band (bandXFor); baking
// either choice in here would misalign the other chart type's labels under its marks.
function XAxisLabels({ data, xForIndex }: { data: { label: string }[]; xForIndex: (i: number) => number }) {
  // A label per point is too dense once there are many points (e.g. 12 hourly slots) —
  // or even at a modest point count if the labels themselves are wide (e.g. 6 "Mon
  // YYYY" labels). Either way they visually merge, so the stride accounts for both:
  // however many of the widest label fit across the plot, capped at MAX_X_LABELS.
  const widestLabel = Math.max(...data.map((d) => d.label.length), 1);
  const labelSpan = widestLabel * AXIS_CHAR_WIDTH + AXIS_LABEL_GAP;
  const labelsThatFit = Math.max(2, Math.floor(PLOT_WIDTH / labelSpan));
  const effectiveMax = Math.min(MAX_X_LABELS, labelsThatFit);
  const stride = Math.max(1, Math.ceil(data.length / effectiveMax));
  const lastIndex = data.length - 1;

  // The first/last labels center exactly on the plot's edge columns for a line chart
  // (bar charts already get inset positions from bandXFor), so a plain
  // textAnchor="middle" could let half the glyph run past the viewBox and clip on a
  // line chart's edges. Anchor those two toward the inside instead, like a real axis.
  return (
    <>
      {data.map((d, i) => {
        // Anchored to the last index and counting backward (rather than forward from 0)
        // so the most recent label is always shown and never crowds against a forced
        // last-index label landing right next to it — e.g. 6 months at stride 2 used to
        // show index 4 *and* the forced index 5, two adjacent months overlapping.
        if ((lastIndex - i) % stride !== 0) return null;
        const anchor = i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle';
        return (
          <text
            key={d.label + i}
            x={xForIndex(i)}
            y={VIEW_HEIGHT - 4}
            textAnchor={anchor}
            fontSize={9}
            fill="var(--color-muted-foreground)"
          >
            {d.label}
          </text>
        );
      })}
    </>
  );
}

// A subtle glow (small-radius blur merged under the crisp original) reads as "glowing"
// on a dark surface and just a soft lift on light — a heavy blur would look neon-only
// in dark mode and hazy in light mode, so this stays modest in both.
function GlowFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

export interface TrendLineChartProps {
  data: TrendPoint[];
  /** CSS color value, e.g. 'var(--color-primary)'. */
  color?: string;
  valueFormatter?: (value: number) => string;
  className?: string;
  /** Accessible name for the chart — the svg carries role="img", so axe/screen readers
   * need this to describe what it's a chart of (e.g. the card's own title text). */
  ariaLabel: string;
  /** Prefixes each y-axis tick, e.g. '₹'. */
  axisPrefix?: string;
  /** Suffixes each y-axis tick, e.g. '%'. */
  axisSuffix?: string;
  aspectRatio?: string;
  compact?: boolean;
}

export function TrendLineChart({
  data,
  color = 'var(--color-primary)',
  valueFormatter,
  className,
  ariaLabel,
  axisPrefix,
  axisSuffix,
  aspectRatio,
  compact = false,
}: TrendLineChartProps) {
  // useId must run unconditionally on every render (rules of hooks) — hoisted above
  // the empty-data early return below, even though only the non-empty path uses them.
  const gradientId = `trend-area-${useId()}`;
  const glowId = `trend-glow-${useId()}`;

  if (data.length === 0) return null;

  const viewH = compact ? 54 : VIEW_HEIGHT;
  const plotT = compact ? 14 : PLOT_TOP;
  const plotH = compact ? 28 : PLOT_HEIGHT;

  const values = data.map((d) => d.value);
  const axisMax = niceTicks(Math.max(...values, 0)).at(-1) ?? 1;
  const ticks = niceTicks(Math.max(...values, 0));

  const coords = data.map((d, i) => ({
    x: xFor(i, data.length),
    y: plotT + plotH - (axisMax > 0 ? (d.value / axisMax) * plotH : 0),
  }));
  const linePath = buildSmoothPath(coords);
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${plotT + plotH} L ${coords[0].x} ${plotT + plotH} Z`;
  const last = data[data.length - 1];
  const lastCoord = coords[coords.length - 1];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${viewH}`}
        className={cn(aspectRatio ?? (compact ? 'aspect-320/54' : 'aspect-320/168'), 'w-full')}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={compact ? 0.15 : 0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
          <GlowFilter id={glowId} />
        </defs>
        {ticks.map((tick) => {
          const y = plotT + plotH - (axisMax > 0 ? (tick / axisMax) * plotH : 0);
          return (
            <g key={tick}>
              <line
                x1={PLOT_LEFT}
                y1={y}
                x2={VIEW_WIDTH - PLOT_RIGHT}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PLOT_LEFT - 5}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={compact ? 5 : 6}
                fill="var(--color-muted-foreground)"
              >
                {axisPrefix}
                {compactNumber(tick)}
                {axisSuffix}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={compact ? 1.5 : 1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={compact ? undefined : `url(#${glowId})`}
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={compact ? 2.5 : 3.25} fill={color} stroke="var(--color-surface)" strokeWidth={compact ? 1.25 : 1.5} />
        ))}
        {/* Endpoint label only */}
        <text
          x={lastCoord.x}
          y={Math.max(lastCoord.y - 4, 7)}
          textAnchor="end"
          fontSize={compact ? 5.5 : 6.5}
          fontWeight={600}
          fill="var(--color-foreground)"
        >
          {valueFormatter ? valueFormatter(last.value) : compactNumber(last.value)}
        </text>
        <XAxisLabels data={data} xForIndex={(i) => xFor(i, data.length)} />
      </svg>
    </div>
  );
}

export interface MultiTrendPoint {
  label: string;
  values: Record<string, number>;
}

export interface MultiTrendSeries {
  key: string;
  label: string;
  /** CSS color value, e.g. 'var(--color-primary)'. */
  color: string;
}

export interface MultiLineTrendChartProps {
  data: MultiTrendPoint[];
  series: MultiTrendSeries[];
  className?: string;
  /** Accessible name for the chart — the svg carries role="img", so axe/screen readers
   * need this to describe what it's a chart of (e.g. the card's own title text). */
  ariaLabel: string;
  /** Prefixes each y-axis tick, e.g. '₹' or '%'. */
  axisPrefix?: string;
  /** Labels every point on every series — only sane for a short series (e.g. 7 days).
   * Deliberately opt-in: the general rule is "label selectively," but a small, fixed-size
   * series like a 7-day window reads fine with a number on every point. */
  showPointLabels?: boolean;
  /** Controls whether the series legend renders above or below the graph SVG. */
  legendPosition?: 'top' | 'bottom';
}

// Same smooth-curve construction as TrendLineChart, but for two or more series sharing
// one axis (e.g. issued vs. returned) — no area fill, since overlapping fills between
// series read as noise rather than signal, plus a legend since color is now the only
// way to tell series apart.
export function MultiLineTrendChart({
  data,
  series,
  className,
  ariaLabel,
  axisPrefix,
  showPointLabels,
  legendPosition = 'top',
}: MultiLineTrendChartProps) {
  // Hoisted above the early return — see TrendLineChart's identical comment.
  const glowId = `multiline-glow-${useId()}`;

  if (data.length === 0 || series.length === 0) return null;

  const allValues = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0));
  const ticks = niceTicks(Math.max(...allValues, 0));
  const axisMax = ticks.at(-1) ?? 1;

  const seriesCoords = series.map((s) => ({
    series: s,
    coords: data.map((d, i) => ({ x: xFor(i, data.length), y: yFor(d.values[s.key] ?? 0, axisMax) })),
  }));

  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {legendPosition === 'top' && legend}
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="aspect-320/168 w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <GlowFilter id={glowId} />
        </defs>
        <GridLines ticks={ticks} axisMax={axisMax} prefix={axisPrefix} />
        {seriesCoords.map(({ series: s, coords }) => (
          <g key={s.key}>
            <path
              d={buildSmoothPath(coords)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${glowId})`}
            />
            {coords.map((c, i) => (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={3.5} fill={s.color} stroke="var(--color-surface)" strokeWidth={1.75} />
                {showPointLabels && (
                  <text
                    x={c.x}
                    y={c.y - 7}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontWeight={600}
                    fill="var(--color-foreground)"
                  >
                    {data[i].values[s.key] ?? 0}
                  </text>
                )}
              </g>
            ))}
          </g>
        ))}
        <XAxisLabels data={data} xForIndex={(i) => xFor(i, data.length)} />
      </svg>
      {legendPosition === 'bottom' && legend}
    </div>
  );
}

export interface MultiBarChartProps {
  data: MultiTrendPoint[];
  series: MultiTrendSeries[];
  className?: string;
  /** Side-by-side bars per group by default; true stacks each group's series into one
   * bar, for series that are parts of a whole (e.g. resolved/open/other tickets) rather
   * than independent quantities being compared side by side. */
  stacked?: boolean;
  /** Accessible name for the chart — the svg carries role="img", so axe/screen readers
   * need this to describe what it's a chart of (e.g. the card's own title text). */
  ariaLabel: string;
  /** Prefixes each y-axis tick, e.g. '₹' or '%'. */
  axisPrefix?: string;
  /** Controls whether the series legend renders above or below the graph SVG. */
  legendPosition?: 'top' | 'bottom';
}

const BAR_GROUP_GAP = 8;
const BAR_GAP = 2;
const BAR_RADIUS = 3;

// Square baseline, rounded top-only cap — a plain rounded <rect> would round all four
// corners, which reads as a pill sitting above the axis instead of growing from it.
function roundedTopBarPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return '';
  const r = Math.min(BAR_RADIUS, width / 2, height);
  const bottom = y + height;
  return `M ${x} ${bottom} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y} ${x + width} ${y + r} L ${x + width} ${bottom} Z`;
}

// Same MultiTrendPoint/MultiTrendSeries shape as MultiLineTrendChart, grouped bars
// instead of lines — a trend made of few, discrete periods (e.g. months) usually reads
// better as bars than as a curve implying continuous movement between points.
export function MultiBarChart({
  data,
  series,
  className,
  stacked = false,
  ariaLabel,
  axisPrefix,
  legendPosition = 'top',
}: MultiBarChartProps) {
  // Hoisted above the early return — see TrendLineChart's identical comment.
  const glowId = `bar-glow-${useId()}`;

  if (data.length === 0 || series.length === 0) return null;

  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0));
  const allValues = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0));
  const ticks = niceTicks(stacked ? Math.max(...totals, 0) : Math.max(...allValues, 0));
  const axisMax = ticks.at(-1) ?? 1;

  const groupWidth = PLOT_WIDTH / data.length;
  const barWidth = stacked
    ? Math.min(groupWidth - BAR_GROUP_GAP, 32)
    : Math.min((groupWidth - BAR_GROUP_GAP - (series.length - 1) * BAR_GAP) / series.length, 24);
  const groupContentWidth = stacked
    ? barWidth
    : barWidth * series.length + (series.length - 1) * BAR_GAP;
  const lastGroupIndex = data.length - 1;

  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {legendPosition === 'top' && legend}
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="aspect-320/168 w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <GlowFilter id={glowId} />
        </defs>
        <GridLines ticks={ticks} axisMax={axisMax} prefix={axisPrefix} />
        {data.map((point, groupIndex) => {
          const groupCenter = bandXFor(groupIndex, data.length);
          const groupX = groupCenter - groupContentWidth / 2;

          if (stacked) {
            // Bottom-up: series[0] sits on the axis, later series stack above it — only
            // the topmost non-zero segment gets a rounded cap, everything below stays a
            // plain rect so the stack reads as one continuous bar, not stacked pills.
            const nonZeroKeys = series.filter((s) => (point.values[s.key] ?? 0) > 0).map((s) => s.key);
            const topKey = nonZeroKeys.at(-1);
            let cumulative = 0;
            const total = totals[groupIndex];
            return (
              <g key={point.label}>
                {series.map((s) => {
                  const value = point.values[s.key] ?? 0;
                  if (value <= 0) return null;
                  const segmentBottom = yFor(cumulative, axisMax);
                  const segmentTop = yFor(cumulative + value, axisMax);
                  const height = segmentBottom - segmentTop;
                  cumulative += value;
                  const isTop = s.key === topKey;
                  return isTop ? (
                    <path
                      key={s.key}
                      d={roundedTopBarPath(groupX, segmentTop, barWidth, height)}
                      fill={s.color}
                      filter={`url(#${glowId})`}
                    />
                  ) : (
                    <rect key={s.key} x={groupX} y={segmentTop} width={barWidth} height={height} fill={s.color} />
                  );
                })}
                {groupIndex === lastGroupIndex && total > 0 && (
                  <text
                    x={groupX + barWidth / 2}
                    y={yFor(total, axisMax) - 4}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={600}
                    fill="var(--color-foreground)"
                  >
                    {axisPrefix}
                    {compactNumber(total)}
                  </text>
                )}
              </g>
            );
          }

          return (
            <g key={point.label}>
              {series.map((s, seriesIndex) => {
                const value = point.values[s.key] ?? 0;
                const barX = groupX + seriesIndex * (barWidth + BAR_GAP);
                const barY = yFor(value, axisMax);
                const barHeight = PLOT_TOP + PLOT_HEIGHT - barY;
                return (
                  <g key={s.key}>
                    <path
                      d={roundedTopBarPath(barX, barY, barWidth, barHeight)}
                      fill={s.color}
                      filter={`url(#${glowId})`}
                    />
                    {/* Value-on-cap only for the most recent group — one number per bar
                        across every month would be a wall of text; the current period
                        is the one the reader actually wants at a glance. */}
                    {groupIndex === lastGroupIndex && value > 0 && (
                      <text
                        x={barX + barWidth / 2}
                        y={barY - 4}
                        textAnchor="middle"
                        fontSize={8}
                        fontWeight={600}
                        fill="var(--color-foreground)"
                      >
                        {axisPrefix}
                        {compactNumber(value)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        <XAxisLabels data={data} xForIndex={(i) => bandXFor(i, data.length)} />
      </svg>
      {legendPosition === 'bottom' && legend}
    </div>
  );
}

export interface ComboBarLineChartProps {
  data: MultiTrendPoint[];
  /** Single count-type series rendered as bars, e.g. Overdue Books. */
  barSeries: MultiTrendSeries;
  /** One or more currency/rate-type series overlaid as lines — a different unit than
   * the bar series, so they get their own right-hand axis rather than sharing the
   * bar's scale (which would squash whichever series has the smaller range). */
  lineSeries: MultiTrendSeries[];
  ariaLabel: string;
  /** Prefix/suffix for the LEFT axis (bar scale), e.g. none for a plain count. */
  barAxisPrefix?: string;
  barAxisSuffix?: string;
  /** Prefix/suffix for the RIGHT axis (line scale), e.g. '₹' for currency. */
  lineAxisPrefix?: string;
  lineAxisSuffix?: string;
  legendPosition?: 'top' | 'bottom';
  className?: string;
}

// A combo chart needs its own wider gutters — a right-hand axis for the line scale is
// exactly what the single-axis charts above never allocate room for — so it gets its
// own local plot rect rather than reusing PLOT_LEFT/PLOT_RIGHT/xFor/bandXFor, which are
// sized (and used elsewhere) assuming there's only ever a left axis.
const COMBO_PLOT_LEFT = 34;
const COMBO_PLOT_RIGHT = 34;
const COMBO_PLOT_TOP = 20;
const COMBO_PLOT_BOTTOM = 20;
const COMBO_PLOT_WIDTH = VIEW_WIDTH - COMBO_PLOT_LEFT - COMBO_PLOT_RIGHT;
const COMBO_PLOT_HEIGHT = VIEW_HEIGHT - COMBO_PLOT_TOP - COMBO_PLOT_BOTTOM;
const COMBO_ROW_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function comboBandXFor(index: number, count: number): number {
  return COMBO_PLOT_LEFT + (index + 0.5) * (COMBO_PLOT_WIDTH / count);
}

function comboYForFraction(fraction: number): number {
  return COMBO_PLOT_TOP + COMBO_PLOT_HEIGHT - fraction * COMBO_PLOT_HEIGHT;
}

// Two independently-scaled axes sharing the same gridline rows (row N is fraction N/4
// of BOTH axes' own max, so the rows line up even though the two numbers at any given
// row are unrelated). This is the honest way to combo a count with a currency series:
// never merge them onto one shared number line — keep both scales visibly separate,
// each with its own labeled axis, so nothing implies a correlation that isn't there.
function DualGridLines({
  barAxisMax,
  lineAxisMax,
  barPrefix,
  barSuffix,
  linePrefix,
  lineSuffix,
}: {
  barAxisMax: number;
  lineAxisMax: number;
  barPrefix?: string;
  barSuffix?: string;
  linePrefix?: string;
  lineSuffix?: string;
}) {
  return (
    <>
      {COMBO_ROW_FRACTIONS.map((fraction) => {
        const y = comboYForFraction(fraction);
        return (
          <g key={fraction}>
            <line
              x1={COMBO_PLOT_LEFT}
              y1={y}
              x2={VIEW_WIDTH - COMBO_PLOT_RIGHT}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={COMBO_PLOT_LEFT - 5}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              fill="var(--color-muted-foreground)"
            >
              {barPrefix}
              {compactNumber(fraction * barAxisMax)}
              {barSuffix}
            </text>
            <text
              x={VIEW_WIDTH - COMBO_PLOT_RIGHT + 5}
              y={y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={9}
              fill="var(--color-muted-foreground)"
            >
              {linePrefix}
              {compactNumber(fraction * lineAxisMax)}
              {lineSuffix}
            </text>
          </g>
        );
      })}
    </>
  );
}

// Bars for one count-type metric plus overlaid lines for one or more currency-type
// metrics, e.g. Overdue Books (bars, a count) against Fines Generated/Collected (lines,
// ₹) — the two-y-axis form real dashboards reach for specifically when a trend and a
// magnitude of different units need to sit on one chart without squashing either one.
export function ComboBarLineChart({
  data,
  barSeries,
  lineSeries,
  ariaLabel,
  barAxisPrefix,
  barAxisSuffix,
  lineAxisPrefix,
  lineAxisSuffix,
  legendPosition = 'bottom',
  className,
}: ComboBarLineChartProps) {
  // Hoisted above the early return — see TrendLineChart's identical comment.
  const glowId = `combo-glow-${useId()}`;

  if (data.length === 0 || lineSeries.length === 0) return null;

  const barAxisMax =
    niceTicks(Math.max(...data.map((d) => d.values[barSeries.key] ?? 0), 0)).at(-1) ?? 1;
  const lineAxisMax =
    niceTicks(Math.max(...data.flatMap((d) => lineSeries.map((s) => d.values[s.key] ?? 0)), 0)).at(
      -1,
    ) ?? 1;

  const barWidth = Math.min((COMBO_PLOT_WIDTH / data.length) * 0.5, 28);
  const lineCoords = lineSeries.map((s) => ({
    series: s,
    coords: data.map((d, i) => ({
      x: comboBandXFor(i, data.length),
      y: comboYForFraction((d.values[s.key] ?? 0) / lineAxisMax),
    })),
  }));

  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground justify-center">
      {[barSeries, ...lineSeries].map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {legendPosition === 'top' && legend}
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="aspect-320/168 w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <GlowFilter id={glowId} />
        </defs>
        <DualGridLines
          barAxisMax={barAxisMax}
          lineAxisMax={lineAxisMax}
          barPrefix={barAxisPrefix}
          barSuffix={barAxisSuffix}
          linePrefix={lineAxisPrefix}
          lineSuffix={lineAxisSuffix}
        />
        {/* Bars first (behind), lines on top — a tall bar should never occlude a line
            passing over it. */}
        {data.map((point, i) => {
          const value = point.values[barSeries.key] ?? 0;
          const barX = comboBandXFor(i, data.length) - barWidth / 2;
          const barY = comboYForFraction(value / barAxisMax);
          const barHeight = COMBO_PLOT_TOP + COMBO_PLOT_HEIGHT - barY;
          return (
            <path
              key={point.label}
              d={roundedTopBarPath(barX, barY, barWidth, barHeight)}
              fill={barSeries.color}
              filter={`url(#${glowId})`}
            />
          );
        })}
        {lineCoords.map(({ series: s, coords }) => (
          <g key={s.key}>
            <path
              d={buildSmoothPath(coords)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${glowId})`}
            />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={3.5} fill={s.color} stroke="var(--color-surface)" strokeWidth={1.75} />
            ))}
          </g>
        ))}
        <XAxisLabels data={data} xForIndex={(i) => comboBandXFor(i, data.length)} />
      </svg>
      {legendPosition === 'bottom' && legend}
    </div>
  );
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface MultiSegmentDonutProps {
  segments: DonutSegment[];
  /** Rendered in the donut's hollow center — typically a total + caption. */
  centerValue: string;
  centerLabel: string;
  className?: string;
  /** Formats each segment's legend value, e.g. formatCurrency. Defaults to the raw number. */
  valueFormatter?: (value: number) => string;
  /** Hides the default vertical legend list below the SVG. */
  hideLegend?: boolean;
}

const DONUT_RADIUS = 40;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

// Several categorical segments around one ring, unlike EventAnalyticsCharts.tsx's
// FillRateDonut (a single percent-of-100 arc) — each segment is its own stroke-dasharray
// slice, offset by the running total of everything drawn before it, going clockwise from
// 12 o'clock (the shared -rotate-90 on the svg matches FillRateDonut's convention).
export function MultiSegmentDonut({
  segments,
  centerValue,
  centerLabel,
  className,
  valueFormatter = String,
  hideLegend = false,
}: MultiSegmentDonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let cursor = 0;

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div
        className="relative flex size-44 shrink-0 items-center justify-center"
        role="img"
        aria-label={`${centerLabel}: ${centerValue}. ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
      >
        <svg className="size-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={DONUT_RADIUS} stroke="var(--color-secondary)" strokeWidth="12" fill="transparent" />
          {total > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((segment) => {
                const length = (segment.value / total) * DONUT_CIRCUMFERENCE;
                const offset = DONUT_CIRCUMFERENCE - cursor;
                cursor += length;
                return (
                  <circle
                    key={segment.key}
                    cx="50"
                    cy="50"
                    r={DONUT_RADIUS}
                    stroke={segment.color}
                    strokeWidth="12"
                    strokeDasharray={`${length} ${DONUT_CIRCUMFERENCE - length}`}
                    strokeDashoffset={offset}
                    fill="transparent"
                  />
                );
              })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-xl font-bold text-foreground">{centerValue}</span>
          <span className="text-xs font-medium text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      {!hideLegend && (
        <ul className="flex w-full flex-col gap-1.5">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                {segment.label}
              </span>
              <span className="font-medium text-foreground">{valueFormatter(segment.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface MultiSegmentPieProps {
  segments: DonutSegment[];
  ariaLabel?: string;
  className?: string;
  valueFormatter?: (value: number) => string;
}

export function MultiSegmentPie({
  segments,
  ariaLabel = 'Pie chart',
  className,
  valueFormatter = String,
}: MultiSegmentPieProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let currentAngle = -Math.PI / 2; // Start at 12 o'clock

  const slices = segments
    .filter((s) => s.value > 0)
    .map((segment) => {
      const sliceAngle = total > 0 ? (segment.value / total) * 2 * Math.PI : 0;
      const startAngle = currentAngle;
      const endAngle = startAngle + sliceAngle;
      currentAngle = endAngle;

      const cx = 50;
      const cy = 50;
      const r = 45;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
      const isFull = sliceAngle >= 2 * Math.PI - 0.0001;

      const d = isFull
        ? ''
        : `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;

      return {
        ...segment,
        d,
        isFull,
        r,
        cx,
        cy,
      };
    });

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div
        className="relative flex size-56 shrink-0 items-center justify-center p-1"
        role="img"
        aria-label={`${ariaLabel}. ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
      >
        <svg className="size-full overflow-visible" viewBox="0 0 100 100">
          {total > 0 &&
            slices.map((slice) =>
              slice.isFull ? (
                <circle
                  key={slice.key}
                  cx={slice.cx}
                  cy={slice.cy}
                  r={slice.r}
                  fill={slice.color}
                  stroke="none"
                />
              ) : (
                <path
                  key={slice.key}
                  d={slice.d}
                  fill={slice.color}
                  stroke="none"
                  strokeLinejoin="round"
                  className="transition-opacity hover:opacity-90"
                />
              ),
            )}
        </svg>
      </div>
      <ul className="flex w-full flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span
                className="size-3 shrink-0 rounded-sm border border-black/20 shadow-xs"
                style={{ backgroundColor: segment.color }}
              />
              <span className="font-medium text-foreground">{segment.label}</span>
            </span>
            <span className="font-semibold text-foreground">{valueFormatter(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

