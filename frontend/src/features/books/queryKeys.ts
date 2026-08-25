import type { BookListParams } from './types';

export const bookKeys = {
  all: ['books'] as const,
  lists: () => [...bookKeys.all, 'list'] as const,
  list: (params: BookListParams) => [...bookKeys.lists(), params] as const,
  details: () => [...bookKeys.all, 'detail'] as const,
  detail: (bookId: string) => [...bookKeys.details(), bookId] as const,
  related: (bookId: string) => [...bookKeys.all, 'related', bookId] as const,
  insights: (bookId: string) => [...bookKeys.all, 'insights', bookId] as const,
};
