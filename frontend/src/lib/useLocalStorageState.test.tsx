import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLocalStorageState } from './useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => localStorage.clear());

  it('falls back safely when stored JSON is corrupt', () => {
    localStorage.setItem('preference', '{invalid');

    const { result } = renderHook(() => useLocalStorageState('preference', 'default'));

    expect(result.current[0]).toBe('default');
  });

  it('updates local state and persists values', () => {
    const { result } = renderHook(() => useLocalStorageState('preference', 'default'));

    act(() => result.current[1]('updated'));

    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('preference')).toBe('"updated"');
  });

  it('synchronizes changes made in another tab', () => {
    const { result } = renderHook(() => useLocalStorageState('session', 'signed-in'));
    localStorage.setItem('session', '"signed-out"');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'session',
          newValue: '"signed-out"',
        }),
      );
    });

    expect(result.current[0]).toBe('signed-out');
  });
});
