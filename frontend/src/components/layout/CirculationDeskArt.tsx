export interface CirculationDeskArtProps {
  className?: string;
}

/**
 * Circulation desk illustration (front desk counter, check-in stamp, book return box & checkmark badge),
 * specifically for the Manager sidebar promo card ("View Library Activity").
 *
 * Built with CSS design tokens so it recolors automatically in dark mode.
 */
export function CirculationDeskArt({ className }: CirculationDeskArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      {/* Grounding shadow */}
      <ellipse cx="100" cy="126" rx="82" ry="7" fill="var(--color-foreground)" opacity="0.07" />

      {/* Circulation Counter Desk Base */}
      <g>
        {/* Front Panel */}
        <rect x="24" y="82" width="152" height="42" rx="6" fill="var(--color-primary)" opacity="0.85" />
        <rect x="36" y="90" width="128" height="26" rx="4" fill="var(--color-primary-hover)" opacity="0.6" />

        {/* Counter Top Surface */}
        <rect x="18" y="74" width="164" height="10" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" />
      </g>

      {/* Book Return Box (Left) */}
      <g>
        <rect x="34" y="50" width="36" height="24" rx="4" fill="var(--color-info)" opacity="0.9" />
        {/* Return Slot */}
        <rect x="40" y="56" width="24" height="4" rx="1" fill="var(--color-surface)" />
        {/* Arrow Down Symbol */}
        <path d="M52 63 L52 70 M48 67 L52 71 L56 67" stroke="var(--color-surface)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Checked-In Books Stack on Counter (Center) */}
      <g>
        {/* Bottom Book */}
        <rect x="80" y="60" width="56" height="14" rx="3" fill="var(--color-warning)" />
        <rect x="126" y="63" width="8" height="8" rx="1.5" fill="var(--color-surface)" opacity="0.7" />

        {/* Top Book */}
        <rect x="86" y="46" width="52" height="14" rx="3" fill="var(--color-success)" />
        <rect x="128" y="49" width="8" height="8" rx="1.5" fill="var(--color-surface)" opacity="0.7" />
      </g>

      {/* Check-In Date Stamp (Right) */}
      <g>
        {/* Stamp Handle */}
        <path d="M156 36 C152 36, 150 42, 153 46 L155 58 L161 58 L163 46 C166 42, 164 36, 160 36 Z" fill="var(--color-primary)" />
        {/* Stamp Cushion Base */}
        <rect x="149" y="58" width="18" height="16" rx="2" fill="var(--color-foreground)" opacity="0.75" />
        <rect x="147" y="70" width="22" height="4" rx="1" fill="var(--color-success)" />
      </g>

      {/* Floating Checkmark Approval Badge (Above Books) */}
      <g>
        <circle cx="112" cy="26" r="12" fill="var(--color-success)" />
        <path d="M106 26 L110 30 L118 22" stroke="var(--color-success-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}
