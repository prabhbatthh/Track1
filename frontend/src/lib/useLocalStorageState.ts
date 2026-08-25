import { useCallback, useEffect, useState } from 'react';

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readStoredValue<T>(key: string, defaultValue: T): T {
  try {
    const stored = getStorage()?.getItem(key);
    return stored ? (JSON.parse(stored) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    return readStoredValue(key, defaultValue);
  });

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key !== key || (event.storageArea && event.storageArea !== getStorage())) return;
      setValue(event.newValue === null ? defaultValue : readStoredValue(key, defaultValue));
    }

    window.addEventListener('storage', syncFromAnotherTab);
    return () => window.removeEventListener('storage', syncFromAnotherTab);
  }, [defaultValue, key]);

  // Stable identity (useCallback, not a plain function) — callers that memoize around this
  // setter (e.g. AuthProvider's action functions) can trust it never changes across renders.
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        getStorage()?.setItem(key, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (privacy mode) or full; in-memory state still works.
      }
    },
    [key],
  );

  return [value, set] as const;
}
