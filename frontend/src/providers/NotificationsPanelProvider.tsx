/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useRef, type ReactNode } from 'react';

interface NotificationsPanelContextValue {
  /** TopBar registers the function that actually opens its notifications modal — the
   * modal's open state lives there, this just lets other pages ask for it to open. */
  registerOpen: (fn: (() => void) | null) => void;
  open: () => void;
}

const NotificationsPanelContext = createContext<NotificationsPanelContextValue | undefined>(
  undefined,
);

// Same shape as PageHeadingProvider: a ref rather than state, since nothing here needs
// to re-render when the registered function changes.
export function NotificationsPanelProvider({ children }: { children: ReactNode }) {
  const openRef = useRef<(() => void) | null>(null);

  const value: NotificationsPanelContextValue = {
    registerOpen: (fn) => {
      openRef.current = fn;
    },
    open: () => openRef.current?.(),
  };

  return (
    <NotificationsPanelContext.Provider value={value}>
      {children}
    </NotificationsPanelContext.Provider>
  );
}

/** Undefined outside the app shell, same as usePageHeadingSlot. */
export function useNotificationsPanel() {
  return useContext(NotificationsPanelContext);
}
