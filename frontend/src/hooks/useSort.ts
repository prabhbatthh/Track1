import { useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T> {
  direction?: SortDirection;
  compare: (a: T, b: T) => number;
}

export function useSortedItems<T>(items: T[], config: SortConfig<T> | null) {
  return useMemo(() => {
    if (!config) return [...items];
    const sorted = [...items];
    sorted.sort((a, b) => {
      const result = config.compare(a, b);
      return config.direction === 'desc' ? -result : result;
    });
    return sorted;
  }, [items, config]);
}
