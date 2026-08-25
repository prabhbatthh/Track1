export interface GuardianProgressArtProps {
  className?: string;
}

/**
 * Parent & child reading together with an open book and achievement stars,
 * for the Guardian sidebar promo card ("Follow Their Progress").
 *
 * Built with CSS design tokens so it automatically recolors in dark mode.
 */
export function GuardianProgressArt({ className }: GuardianProgressArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      {/* Grounding shadow */}
      <ellipse cx="100" cy="126" rx="82" ry="7" fill="var(--color-foreground)" opacity="0.07" />

      {/* Parent Avatar (Left) */}
      <g>
        {/* Head */}
        <circle cx="72" cy="48" r="16" fill="var(--color-primary)" opacity="0.9" />
        {/* Body/Shoulders */}
        <path
          d="M48 88 C48 70, 96 70, 96 88 Z"
          fill="var(--color-primary)"
          opacity="0.85"
        />
      </g>

      {/* Child Avatar (Right) */}
      <g>
        {/* Head */}
        <circle cx="128" cy="54" r="13" fill="var(--color-info)" opacity="0.9" />
        {/* Body/Shoulders */}
        <path
          d="M108 88 C108 72, 148 72, 148 88 Z"
          fill="var(--color-info)"
          opacity="0.85"
        />
      </g>

      {/* Open Book in Front */}
      <g transform="translate(40, 78)">
        {/* Book shadow/base */}
        <path
          d="M0 24 Q 60 32, 120 24 L 120 28 Q 60 36, 0 28 Z"
          fill="var(--color-foreground)"
          opacity="0.1"
        />
        {/* Left Page */}
        <path
          d="M4 24 Q 30 16, 60 22 L 60 2 Q 30 -4, 4 4 Z"
          fill="var(--color-surface)"
          stroke="var(--color-primary)"
          strokeWidth="2"
        />
        {/* Right Page */}
        <path
          d="M60 22 Q 90 16, 116 24 L 116 4 Q 90 -4, 60 2 Z"
          fill="var(--color-surface)"
          stroke="var(--color-primary)"
          strokeWidth="2"
        />
        {/* Book Spine Center */}
        <line x1="60" y1="2" x2="60" y2="22" stroke="var(--color-primary)" strokeWidth="2.5" />
        {/* Page text lines (Left) */}
        <line x1="14" y1="9" x2="48" y2="6" stroke="var(--color-muted-foreground)" strokeWidth="1.75" strokeLinecap="round" opacity="0.6" />
        <line x1="14" y1="14" x2="44" y2="12" stroke="var(--color-muted-foreground)" strokeWidth="1.75" strokeLinecap="round" opacity="0.6" />
        <line x1="14" y1="19" x2="50" y2="17" stroke="var(--color-muted-foreground)" strokeWidth="1.75" strokeLinecap="round" opacity="0.6" />
        {/* Page text lines (Right) */}
        <line x1="72" y1="6" x2="106" y2="9" stroke="var(--color-muted-foreground)" strokeWidth="1.75" strokeLinecap="round" opacity="0.6" />
        <line x1="76" y1="12" x2="106" y2="14" stroke="var(--color-muted-foreground)" strokeWidth="1.75" strokeLinecap="round" opacity="0.6" />
        <line x1="70" y1="17" x2="106" y2="19" stroke="var(--color-muted-foreground)" strokeWidth="1.75" strokeLinecap="round" opacity="0.6" />
      </g>

      {/* Floating Milestone Stars & Achievement Badge */}
      <g>
        {/* Center Star above book */}
        <polygon
          points="100,18 103,26 111,26 104,31 107,39 100,34 93,39 96,31 89,26 97,26"
          fill="var(--color-warning)"
        />
        {/* Small sparkle Left */}
        <polygon
          points="62,26 64,30 68,30 65,33 66,37 62,34 58,37 59,33 56,30 60,30"
          fill="var(--color-warning)"
          opacity="0.8"
        />
        {/* Small sparkle Right */}
        <polygon
          points="138,28 140,32 144,32 141,35 142,39 138,36 134,39 135,35 132,32 136,32"
          fill="var(--color-warning)"
          opacity="0.8"
        />

        {/* Heart/Connection Icon Badge */}
        <circle cx="100" cy="52" r="10" fill="var(--color-warning)" />
        <path
          d="M100 56.5 C95.5 52, 94 48, 97 46.5 C99 45.5, 100 47.5, 100 47.5 C100 47.5, 101 45.5, 103 46.5 C106 48, 104.5 52, 100 56.5 Z"
          fill="var(--color-warning-foreground)"
        />
      </g>
    </svg>
  );
}
