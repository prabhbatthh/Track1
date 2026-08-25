import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiPost } from '@/lib/api';

import { useTranslateText } from './useTranslateText';

vi.mock('@/lib/api', () => ({ apiPost: vi.fn() }));

const mockedApiPost = vi.mocked(apiPost);

describe('useTranslateText', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps the source visible and exposes a retry after a request fails', async () => {
    vi.useFakeTimers();
    mockedApiPost
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ translated: 'नमस्ते' });

    const { result } = renderHook(() => useTranslateText('Hello', 'hi'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.translated).toBe('Hello');

    act(() => result.current.retry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.translated).toBe('नमस्ते');
    expect(result.current.error).toBeNull();
  });
});
