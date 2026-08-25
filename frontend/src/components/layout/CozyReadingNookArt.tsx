export interface CozyReadingNookArtProps {
  className?: string;
}

/**
 * Community Library & Bookshelves Illustration (library bookshelves, study desk, open book & lamp),
 * for the Member sidebar promo card ("Expand Your Knowledge").
 *
 * Built with CSS design tokens so it recolors dynamically in dark mode.
 */
export function CozyReadingNookArt({ className }: CozyReadingNookArtProps) {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" className={className}>
      <defs>
        {/* Soft warm lamp light cone */}
        <linearGradient id="library-lamp-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-warning)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-warning)" stopOpacity="0.02" />
        </linearGradient>

        <linearGradient id="wood-shelf-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--color-primary-hover)" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Floor grounding shadow */}
      <ellipse cx="100" cy="128" rx="85" ry="6" fill="var(--color-foreground)" opacity="0.08" />

      {/* Library Bookshelf Frame (Background) */}
      <g>
        {/* Outer Wooden Bookcase Shell */}
        <rect x="25" y="15" width="150" height="92" rx="4" fill="url(#wood-shelf-grad)" />
        <rect x="29" y="19" width="142" height="84" rx="2" fill="var(--color-surface)" opacity="0.95" />

        {/* Shelf Divider 1 (Top) */}
        <rect x="29" y="48" width="142" height="5" fill="var(--color-border)" />

        {/* Shelf Divider 2 (Middle) */}
        <rect x="29" y="78" width="142" height="5" fill="var(--color-border)" />

        {/* TOP SHELF BOOKS (Row 1) */}
        <g>
          <rect x="35" y="24" width="8" height="24" rx="1" fill="var(--color-primary)" />
          <rect x="44" y="22" width="10" height="26" rx="1" fill="var(--color-warning)" />
          <rect x="55" y="26" width="7" height="22" rx="1" fill="var(--color-info)" />
          <rect x="63" y="23" width="9" height="25" rx="1" fill="var(--color-success)" />
          <rect x="73" y="25" width="6" height="23" rx="1" fill="var(--color-danger)" />

          {/* Leaning books on top shelf */}
          <rect x="85" y="24" width="7" height="24" rx="1" fill="var(--color-primary)" transform="rotate(12 85 48)" />
          <rect x="94" y="24" width="8" height="24" rx="1" fill="var(--color-warning)" transform="rotate(14 94 48)" />

          <rect x="120" y="23" width="11" height="25" rx="1" fill="var(--color-info)" />
          <rect x="132" y="25" width="7" height="23" rx="1" fill="var(--color-primary)" />
          <rect x="140" y="22" width="12" height="26" rx="1" fill="var(--color-success)" />
          <rect x="153" y="24" width="9" height="24" rx="1" fill="var(--color-warning)" />
        </g>

        {/* MIDDLE SHELF BOOKS (Row 2) */}
        <g>
          <rect x="34" y="54" width="11" height="24" rx="1" fill="var(--color-success)" />
          <rect x="46" y="56" width="7" height="22" rx="1" fill="var(--color-danger)" />
          <rect x="54" y="53" width="9" height="25" rx="1" fill="var(--color-primary)" />

          {/* Book Stack on middle shelf */}
          <rect x="68" y="70" width="30" height="8" rx="1" fill="var(--color-info)" />
          <rect x="71" y="62" width="25" height="7" rx="1" fill="var(--color-warning)" />
          <rect x="73" y="55" width="22" height="6" rx="1" fill="var(--color-success)" />

          <rect x="110" y="54" width="8" height="24" rx="1" fill="var(--color-primary)" />
          <rect x="119" y="52" width="10" height="26" rx="1" fill="var(--color-danger)" />
          <rect x="130" y="55" width="8" height="23" rx="1" fill="var(--color-info)" />
          <rect x="139" y="53" width="9" height="25" rx="1" fill="var(--color-warning)" />
          <rect x="149" y="54" width="12" height="24" rx="1" fill="var(--color-primary)" />
        </g>
      </g>

      {/* Library Study Desk (Foreground) */}
      <g>
        {/* Desk Surface */}
        <rect x="15" y="102" width="170" height="10" rx="3" fill="var(--color-primary)" />
        {/* Desk Edge Accent */}
        <rect x="15" y="110" width="170" height="3" fill="var(--color-primary-hover)" />

        {/* Desk Legs */}
        <rect x="25" y="113" width="7" height="15" fill="var(--color-primary-hover)" />
        <rect x="168" y="113" width="7" height="15" fill="var(--color-primary-hover)" />

        {/* Open Book on Desk (Center) */}
        <path d="M72 102 C85 96, 96 99, 100 102 C104 99, 115 96, 128 102 L125 106 C114 101, 104 103, 100 105 C96 103, 86 101, 75 106 Z" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
        {/* Open Book Spine */}
        <line x1="100" y1="102" x2="100" y2="105" stroke="var(--color-primary)" strokeWidth="1.5" />

        {/* Stack of Books on Left Desk */}
        <rect x="32" y="97" width="28" height="5" rx="1" fill="var(--color-info)" />
        <rect x="34" y="92" width="24" height="4" rx="1" fill="var(--color-warning)" />
        <rect x="36" y="87" width="20" height="4" rx="1" fill="var(--color-danger)" />

        {/* Library Desk Lamp Glow */}
        <polygon points="152,72 125,102 175,102" fill="url(#library-lamp-glow)" />

        {/* Library Desk Lamp (Right) */}
        <g>
          <ellipse cx="152" cy="102" rx="7" ry="2" fill="var(--color-foreground)" opacity="0.4" />
          <path d="M152 102 Q158 85 152 72" stroke="var(--color-muted-foreground)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Lamp Shade */}
          <path d="M142 72 L162 72 L157 62 L147 62 Z" fill="var(--color-warning)" />
        </g>
      </g>
    </svg>
  );
}
