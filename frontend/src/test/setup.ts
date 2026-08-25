import '@testing-library/jest-dom/vitest';

// Node's experimental Web Storage implementation can expose an incomplete
// `localStorage` in jsdom. Use a deterministic browser-compatible store so
// stateful hooks behave the same in every test worker.
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});

// jsdom doesn't implement scrollTo; ChatbotWidget's auto-scroll-to-latest-message needs it.
Element.prototype.scrollTo ??= () => undefined;
window.scrollTo = () => undefined;

// jsdom doesn't implement IntersectionObserver; framer-motion's whileInView (landing
// sections, the large public footer) needs it to mount without throwing.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
  takeRecords = () => [];
}
window.IntersectionObserver ??= MockIntersectionObserver;

// jsdom doesn't implement matchMedia; ThemeProvider's system-theme detection needs it.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
