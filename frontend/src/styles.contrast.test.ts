import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Read the file straight off disk rather than `import ... from './styles.css?raw'` —
// @tailwindcss/vite's load hook intercepts any `.css` id ahead of Vite's own raw-loader
// and returns its transformed (Tailwind-processed) output instead, which silently drops
// the literal `@theme`/`.dark` blocks this test parses for (the `?raw` query is ignored,
// so the import resolves to an empty string rather than throwing — it fails the first
// `tokens()` lookup below instead of at import time). Vitest's `include` glob is anchored
// to `src/**`, and its test runner's `import.meta.url` isn't a real `file://` URL, so this
// resolves off `process.cwd()` (always the frontend package root under every npm script
// that runs this suite) rather than `__dirname`/`import.meta.url`.
const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf-8');

/**
 * The axe scan in tests/e2e/theme-layout.spec.ts already catches contrast regressions, but
 * only after a full stack boot across every page. This reads the same tokens straight out of
 * styles.css so a failing pair shows up in seconds, with the ratio named.
 */

/**
 * Pulls the --color-* declarations out of one CSS block. `opener` includes the brace
 * (`'.dark {'`) so it can't match the `@custom-variant dark (&:where(.dark, .dark *))`
 * line instead of the rule itself.
 */
function tokens(opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`styles.css has no "${opener}" block`);
  const body = css.slice(start + opener.length, css.indexOf('}', start));
  const found = Object.fromEntries(
    [...body.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]),
  );
  for (const name of ['background', 'surface', 'foreground', 'muted', 'muted-foreground', 'secondary', 'primary']) {
    if (!found[name]) throw new Error(`"${opener}" block is missing --color-${name}`);
  }
  return found;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Flattens a translucent foreground over an opaque background, as the browser composites it. */
const over = (fg: string, bg: string, alpha: number) =>
  '#' +
  rgb(fg)
    .map((v, i) => Math.round(alpha * v + (1 - alpha) * rgb(bg)[i]))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

const luminance = (hex: string) =>
  rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + [0.2126, 0.7152, 0.0722][i] * v, 0);

function contrast(fg: string, bg: string) {
  const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

// WCAG 2 AA: 4.5:1 for normal-size text. Every pair below is normal-size body copy.
const AA_NORMAL = 4.5;

// SidebarPromo tints its card with bg-primary/5 (light) / dark:bg-primary/10 over the aside's
// surface, so its body copy sits on the composited colour rather than on surface itself.
const THEMES = [
  { name: 'light', t: tokens('@theme'), promoTint: 0.05 },
  { name: 'dark', t: tokens('.dark'), promoTint: 0.1 },
];

describe.each(THEMES)('$name theme text contrast', ({ t, promoTint }) => {
  const promoCard = over(t.primary, t.surface, promoTint);

  it.each([
    ['foreground on background', t.foreground, t.background],
    ['foreground on surface', t.foreground, t.surface],
    ['muted on surface', t.muted, t.surface],
    ['muted-foreground on surface', t['muted-foreground'], t.surface],
    ['muted-foreground on background', t['muted-foreground'], t.background],
    ['foreground on secondary', t.foreground, t.secondary],
    ['muted-foreground on secondary', t['muted-foreground'], t.secondary],
    ['foreground on the tinted promo card', t.foreground, promoCard],
    ['muted-foreground on the tinted promo card', t['muted-foreground'], promoCard],
  ])('%s clears AA', (_pair, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
