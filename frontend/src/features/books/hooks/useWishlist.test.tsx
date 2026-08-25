import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/providers/AuthProvider';

import { useWishlist } from './useWishlist';

vi.mock('@/providers/AuthProvider', () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useWishlist', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the signed-in member\'s wishlist from the backend', async () => {
    mockedUseAuth.mockReturnValue({
      userId: 'member-1',
      isAuthenticated: true,
      getWishlist: vi.fn().mockResolvedValue(['book-1', 'book-2']),
      addToWishlist: vi.fn(),
      removeFromWishlist: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useWishlist(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.wishlistIds).toEqual(['book-1', 'book-2']));
    expect(result.current.isWishlisted('book-1')).toBe(true);
    expect(result.current.isWishlisted('book-3')).toBe(false);
  });

  it('adds a book optimistically, before the backend call resolves', async () => {
    let resolveAdd: () => void = () => {};
    // Typed via the generic (rather than a named param) so the mock's call-args tuple
    // stays `[string]` for the assertion below, without an unused-parameter lint error —
    // react-query's mutate() actually invokes this with a second (internal context)
    // argument too, which is why the assertion below checks only the first.
    const addToWishlist = vi.fn<(bookId: string) => Promise<void>>(
      () => new Promise<void>((resolve) => (resolveAdd = resolve)),
    );
    mockedUseAuth.mockReturnValue({
      userId: 'member-1',
      isAuthenticated: true,
      getWishlist: vi.fn().mockResolvedValue([]),
      addToWishlist,
      removeFromWishlist: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useWishlist(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.wishlistIds).toEqual([]));

    result.current.toggleWishlist('book-1');

    // Reflected immediately, before addToWishlist's promise has resolved.
    await waitFor(() => expect(result.current.isWishlisted('book-1')).toBe(true));
    expect(addToWishlist.mock.calls[0]?.[0]).toBe('book-1');

    resolveAdd();
  });

  it('rolls back an optimistic add when the backend call fails', async () => {
    const addToWishlist = vi.fn().mockRejectedValue(new Error('offline'));
    mockedUseAuth.mockReturnValue({
      userId: 'member-1',
      isAuthenticated: true,
      getWishlist: vi.fn().mockResolvedValue([]),
      addToWishlist,
      removeFromWishlist: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { result } = renderHook(() => useWishlist(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.wishlistIds).toEqual([]));

    result.current.toggleWishlist('book-1');

    // The optimistic add is reverted once the backend call fails — asserting only the
    // settled end state, since the transient optimistic "true" in between is too brief
    // to reliably observe through a polling waitFor.
    await waitFor(() => expect(addToWishlist).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isWishlisted('book-1')).toBe(false));
  });
});
