export type BookSort = 'newest' | 'rating' | 'recommended';

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  isbn: string | null;
  description: string | null;
  total_copies: number;
  shelf_location: string | null;
  cover_image_url: string | null;
  available: boolean;
  average_rating: number | null;
  review_count: number;
}

export interface BookInsights {
  summary: string;
  key_concepts: string[];
  themes: string[];
  difficulty: string;
  technical_difficulty: string;
  vocabulary_complexity: string;
  prerequisites: string[];
  why_read: string;
}

export interface BookListResponse {
  items: Book[];
  total: number;
}

export interface BookListParams {
  search: string;
  category: string;
  sort: BookSort;
  page: number;
}
