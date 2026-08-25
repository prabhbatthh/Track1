/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface PageHeadingContextValue {
  /** The TopBar node that page headings portal into, or null before it mounts. */
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
}

const PageHeadingContext = createContext<PageHeadingContextValue | undefined>(undefined);

/**
 * Lets a page's PageHeader/PageTitle render its heading up in the TopBar instead of at the
 * top of the scrolling content, without every page having to know the layout exists.
 *
 * A DOM slot + portal rather than heading state in context: titles and descriptions are
 * ReactNode, so copying them into state would re-run the publishing effect on every render
 * whenever a page passed an element rather than a string. Portalling sidesteps that — and
 * keeps the heading owned by the page that declared it.
 */
export function PageHeadingProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);

  return <PageHeadingContext.Provider value={value}>{children}</PageHeadingContext.Provider>;
}

/**
 * Undefined outside the app shell — public pages have no TopBar, so PageHeader/PageTitle
 * fall back to rendering their heading inline there.
 */
export function usePageHeadingSlot() {
  return useContext(PageHeadingContext);
}
