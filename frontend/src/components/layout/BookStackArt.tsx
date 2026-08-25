export interface BookStackArtProps {
  className?: string;
}

/**
 * Stack of books beside a potted plant, for the sidebar's "Expand your knowledge" card.
 *
 * Inline SVG rather than an asset: it's a handful of shapes, so it costs no extra request,
 * scales without artefacts, and — because every fill reads a theme token instead of a
 * hardcoded hex — it recolors itself in dark mode along with the rest of the UI.
 * Decorative only; the card's own text carries the meaning, so it stays aria-hidden.
 */
export function BookStackArt({ className }: BookStackArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      {/* Grounds the objects so they don't look like they're floating in the card. */}
      <ellipse cx="100" cy="126" rx="82" ry="7" fill="var(--color-foreground)" opacity="0.07" />

      {/* Books, bottom of the stack upward. The inset light rect on each is its page block. */}
      <g>
        <rect x="12" y="103" width="116" height="17" rx="4" fill="var(--color-info)" />
        <rect x="110" y="107" width="14" height="9" rx="2" fill="var(--color-surface)" opacity="0.6" />

        <rect x="20" y="85" width="104" height="17" rx="4" fill="var(--color-success)" />
        <rect x="106" y="89" width="14" height="9" rx="2" fill="var(--color-surface)" opacity="0.6" />

        <rect x="14" y="67" width="112" height="17" rx="4" fill="var(--color-warning)" />
        <rect x="108" y="71" width="14" height="9" rx="2" fill="var(--color-surface)" opacity="0.6" />

        <rect x="24" y="49" width="94" height="17" rx="4" fill="var(--color-danger)" />
        <rect x="100" y="53" width="14" height="9" rx="2" fill="var(--color-surface)" opacity="0.6" />
      </g>

      {/* Potted plant */}
      <g>
        <path d="M168 88 V64" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M167 80C155 80 147 72 147 62C158 62 166 70 167 80Z"
          fill="var(--color-success)"
          opacity="0.75"
        />
        <path
          d="M169 74C181 74 189 66 189 56C178 56 170 64 169 74Z"
          fill="var(--color-success)"
          opacity="0.9"
        />
        <ellipse cx="168" cy="50" rx="8" ry="12" fill="var(--color-success)" />

        <path
          d="M150 96H186L181 119C180.8 121.2 179 123 176.7 123H159.3C157 123 155.2 121.2 155 119Z"
          fill="var(--color-primary)"
        />
        <rect x="144" y="86" width="48" height="11" rx="3.5" fill="var(--color-primary)" />
        <rect
          x="144"
          y="86"
          width="48"
          height="11"
          rx="3.5"
          fill="var(--color-surface)"
          opacity="0.18"
        />
      </g>
    </svg>
  );
}
