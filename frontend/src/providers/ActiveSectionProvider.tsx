/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ActiveSectionContextValue {
  /** id of the landing-page section currently in view (e.g. "testimonials"), or null. */
  activeSection: string | null;
  setActiveSection: (section: string | null) => void;
}

const ActiveSectionContext = createContext<ActiveSectionContextValue | undefined>(undefined);

// Lets any section (e.g. Testimonials) report that it's currently in the viewport, so the
// header nav can highlight the matching link only while that section is actually visible —
// rather than just whenever we're on the home route.
export function ActiveSectionProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <ActiveSectionContext.Provider value={{ activeSection, setActiveSection }}>
      {children}
    </ActiveSectionContext.Provider>
  );
}

export function useActiveSection() {
  const ctx = useContext(ActiveSectionContext);
  if (!ctx) {
    throw new Error('useActiveSection must be used within an ActiveSectionProvider');
  }
  return ctx;
}
