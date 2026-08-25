export interface GrowthChartArtProps {
  className?: string;
}

/**
 * Rising bars under a trend arrow, for the admin sidebar card — see BookStackArt for why
 * these illustrations are inline SVG on theme tokens rather than image assets.
 */
export function GrowthChartArt({ className }: GrowthChartArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="100" cy="126" rx="82" ry="7" fill="var(--color-foreground)" opacity="0.07" />

      <path
        d="M30 116H170"
        stroke="var(--color-border)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <rect x="38" y="84" width="24" height="30" rx="4" fill="var(--color-info)" opacity="0.5" />
      <rect x="72" y="70" width="24" height="44" rx="4" fill="var(--color-info)" opacity="0.7" />
      <rect x="106" y="54" width="24" height="60" rx="4" fill="var(--color-success)" opacity="0.85" />
      <rect x="140" y="38" width="24" height="76" rx="4" fill="var(--color-primary)" />

      <path
        d="M46 72L82 58L116 42L148 24"
        stroke="var(--color-warning)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M133 22L152 21L151 40Z" fill="var(--color-warning)" />
    </svg>
  );
}
