import i18n from '@/i18n/config';
import en from '@/i18n/locales/en.json';
import { apiPost } from '@/lib/api';

type Node = string | string[] | { [key: string]: Node };

function collectLeaves(node: Node, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    out.push(...node);
  } else {
    for (const value of Object.values(node)) collectLeaves(value, out);
  }
}

// Rebuilds a node with the same shape as `node` (objects/arrays preserved),
// pulling replacement leaf strings off `values` in the same traversal order
// collectLeaves used — avoids any dot-path key ambiguity.
function reshape(node: Node, values: string[], cursor: { i: number }): Node {
  if (typeof node === 'string') {
    return values[cursor.i++];
  }
  if (Array.isArray(node)) {
    return node.map(() => values[cursor.i++]);
  }
  const out: Record<string, Node> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = reshape(value, values, cursor);
  }
  return out;
}

const EN_NODE = en as Node;
const EN_VALUES: string[] = [];
collectLeaves(EN_NODE, EN_VALUES);

// Cheap fingerprint of the English source strings, so a cached translation is
// automatically invalidated once en.json's content changes (no manual version bump).
function fingerprint(values: string[]): string {
  let hash = 0;
  for (const value of values) {
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
  }
  return (hash >>> 0).toString(36);
}
const EN_FINGERPRINT = fingerprint(EN_VALUES);

function cacheKey(lang: string) {
  return `i18n-auto-${lang}-${EN_FINGERPRINT}`;
}

interface TranslateBatchResponse {
  translated: string[];
}

const inFlight = new Map<string, Promise<void>>();

// Curated locale files that ship as their own chunk (kept out of the main bundle) rather
// than being machine-translated — dynamic import so they only download when selected.
const STATIC_LOCALE_LOADERS: Record<string, () => Promise<{ default: Node }>> = {
  hi: () => import('@/i18n/locales/hi.json'),
  pa: () => import('@/i18n/locales/pa.json'),
};

/**
 * Ensures i18next has a resource bundle for `lang`. Languages with a static
 * locale file (en/hi/pa) or one already loaded this session are a no-op.
 * Everything else is machine-translated from en.json via the backend on first
 * use, then cached in localStorage so it never needs translating again.
 */
export function ensureLanguageLoaded(lang: string): Promise<void> {
  if (lang === 'en' || i18n.hasResourceBundle(lang, 'translation')) {
    return Promise.resolve();
  }

  const existing = inFlight.get(lang);
  if (existing) return existing;

  const promise = (STATIC_LOCALE_LOADERS[lang] ? loadStaticLocale(lang) : loadLanguage(lang)).finally(
    () => inFlight.delete(lang),
  );
  inFlight.set(lang, promise);
  return promise;
}

async function loadStaticLocale(lang: string): Promise<void> {
  const module = await STATIC_LOCALE_LOADERS[lang]();
  i18n.addResourceBundle(lang, 'translation', module.default, true, true);
}

async function loadLanguage(lang: string): Promise<void> {
  const cached = readCache(lang);
  if (cached) {
    i18n.addResourceBundle(lang, 'translation', cached, true, true);
    return;
  }

  const { translated } = await apiPost<TranslateBatchResponse>('/translate/batch', {
    texts: EN_VALUES,
    target_lang: lang,
  });

  const nested = reshape(EN_NODE, translated, { i: 0 });

  i18n.addResourceBundle(lang, 'translation', nested, true, true);
  writeCache(lang, nested);
}

function readCache(lang: string): Node | null {
  try {
    const raw = localStorage.getItem(cacheKey(lang));
    return raw ? (JSON.parse(raw) as Node) : null;
  } catch {
    return null;
  }
}

function writeCache(lang: string, value: Node) {
  try {
    localStorage.setItem(cacheKey(lang), JSON.stringify(value));
  } catch {
    // Cache is a pure optimization (e.g. storage full/disabled) — safe to skip.
  }
}
