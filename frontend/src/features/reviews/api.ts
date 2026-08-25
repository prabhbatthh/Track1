import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

import type { BookReviews, Review, ReviewPayload } from './types';

export async function getBookReviews(bookId: string, token: string | null): Promise<BookReviews> {
  if (!token) {
    return { items: [], average_rating: 0, total_reviews: 0, breakdown: [], review_digest: null };
  }
  return apiGet<BookReviews>(`/books/${bookId}/reviews`, token);
}

export async function createReview(
  bookId: string,
  payload: ReviewPayload,
  token: string | null,
): Promise<Review> {
  if (!token) throw new Error('Not authenticated');
  return apiPost<Review>(`/books/${bookId}/reviews`, payload, token);
}

export async function updateReview(
  reviewId: string,
  payload: ReviewPayload,
  token: string | null,
): Promise<Review> {
  if (!token) throw new Error('Not authenticated');
  return apiPut<Review>(`/reviews/${reviewId}`, payload, token);
}

export async function deleteReview(reviewId: string, token: string | null): Promise<void> {
  if (!token) throw new Error('Not authenticated');
  await apiDelete(`/reviews/${reviewId}`, token);
}

export async function getAllReviews(token: string | null): Promise<Review[]> {
  if (!token) return [];
  return apiGet<Review[]>('/reviews', token);
}

export async function getMyReviews(token: string | null): Promise<Review[]> {
  if (!token) return [];
  return apiGet<Review[]>('/reviews/me', token);
}
