export interface ServerRackArtProps {
  className?: string;
}

/**
 * Stacked server units with status lights, for the IT head sidebar card — see BookStackArt
 * for why these illustrations are inline SVG on theme tokens rather than image assets.
 */
export function ServerRackArt({ className }: ServerRackArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="100" cy="126" rx="82" ry="7" fill="var(--color-foreground)" opacity="0.07" />

      {/* Three rack units: status light on the left, vent slots on the right. */}
      <g>
        <rect x="46" y="36" width="108" height="26" rx="6" fill="var(--color-info)" opacity="0.75" />
        <circle cx="62" cy="49" r="4" fill="var(--color-success)" />
        <rect x="80" y="46" width="58" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.5" />
        <rect x="80" y="53" width="42" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.35" />

        <rect x="46" y="68" width="108" height="26" rx="6" fill="var(--color-primary)" />
        <circle cx="62" cy="81" r="4" fill="var(--color-success)" />
        <rect x="80" y="78" width="58" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.5" />
        <rect x="80" y="85" width="42" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.35" />

        <rect x="46" y="100" width="108" height="26" rx="6" fill="var(--color-info)" opacity="0.5" />
        <circle cx="62" cy="113" r="4" fill="var(--color-warning)" />
        <rect x="80" y="110" width="58" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.5" />
        <rect x="80" y="117" width="42" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.35" />
      </g>
    </svg>
  );
}
