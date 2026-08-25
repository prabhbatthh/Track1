export interface CozyReadingNookArtProps {
  className?: string;
}

/**
 * Cozy reading nook illustration (armchair, warm floor lamp, side table with book & mug),
 * for the Member sidebar promo card ("Expand Your Knowledge").
 *
 * Built with CSS design tokens so it recolors in dark mode.
 */
export function CozyReadingNookArt({ className }: CozyReadingNookArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      <defs>
        {/* Warm light cone gradient */}
        <linearGradient id="lamp-light-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-warning)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-warning)" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Grounding shadow */}
      <ellipse cx="100" cy="126" rx="82" ry="7" fill="var(--color-foreground)" opacity="0.07" />

      {/* Floor Lamp Light Cone */}
      <polygon points="42,42 10,126 130,126" fill="url(#lamp-light-cone)" />

      {/* Floor Lamp (Left) */}
      <g>
        {/* Base */}
        <ellipse cx="42" cy="124" rx="14" ry="3" fill="var(--color-foreground)" opacity="0.3" />
        {/* Pole */}
        <path d="M42 124 L42 42" stroke="var(--color-muted-foreground)" strokeWidth="3" strokeLinecap="round" />
        {/* Lamp Shade */}
        <path d="M30 42 L54 42 L48 24 L36 24 Z" fill="var(--color-warning)" />
        {/* Lamp Top Accent */}
        <circle cx="42" cy="22" r="3" fill="var(--color-warning-foreground)" opacity="0.7" />
        {/* Bulb Glow */}
        <ellipse cx="42" cy="42" rx="10" ry="3" fill="var(--color-warning)" opacity="0.6" />
      </g>

      {/* Armchair (Center-Left) */}
      <g>
        {/* Chair Legs */}
        <line x1="62" y1="112" x2="56" y2="124" stroke="var(--color-foreground)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
        <line x1="118" y1="112" x2="124" y2="124" stroke="var(--color-foreground)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />

        {/* Chair Backrest */}
        <rect x="64" y="52" width="52" height="54" rx="12" fill="var(--color-primary)" />

        {/* Left Armrest */}
        <rect x="52" y="76" width="18" height="38" rx="8" fill="var(--color-primary-hover)" />

        {/* Right Armrest */}
        <rect x="110" y="76" width="18" height="38" rx="8" fill="var(--color-primary-hover)" />

        {/* Main Seat Cushion */}
        <rect x="64" y="86" width="52" height="24" rx="8" fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth="1.5" />

        {/* Throw Pillow */}
        <rect x="92" y="72" width="20" height="20" rx="4" fill="var(--color-info)" transform="rotate(-10 102 82)" />
      </g>

      {/* Small Side Table & Mug (Right) */}
      <g>
        {/* Table Leg */}
        <line x1="162" y1="92" x2="162" y2="124" stroke="var(--color-foreground)" strokeWidth="2.5" opacity="0.5" />
        <ellipse cx="162" cy="124" rx="10" ry="2.5" fill="var(--color-foreground)" opacity="0.2" />

        {/* Table Top */}
        <ellipse cx="162" cy="92" rx="22" ry="6" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />

        {/* Open Book on Table */}
        <path d="M148 90 Q155 86, 162 89 Q169 86, 176 90 L174 94 Q169 90, 162 93 Q155 90, 150 94 Z" fill="var(--color-primary)" opacity="0.9" />

        {/* Warm Coffee/Tea Mug */}
        <rect x="156" y="78" width="10" height="11" rx="2" fill="var(--color-warning)" />
        <path d="M166 80 C169 80, 169 87, 166 87" stroke="var(--color-warning)" strokeWidth="1.5" fill="none" />

        {/* Steam Lines */}
        <path d="M159 74 C158 71, 160 69, 159 66" stroke="var(--color-muted-foreground)" strokeWidth="1.2" fill="none" opacity="0.5" strokeLinecap="round" />
        <path d="M163 74 C162 71, 164 69, 163 66" stroke="var(--color-muted-foreground)" strokeWidth="1.2" fill="none" opacity="0.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
