export interface ReviewPayload {
  rating: number;
  comment: string;
  images: string[];
}

export interface Review {
  id: string;
  book_id: string;
  book_title: string;
  book_author: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_avatar_url: string | null;
  rating: number;
  comment: string;
  images: string[];
  created_at: string;
  is_own: boolean;
}

export interface RatingBreakdownEntry {
  stars: number;
  percent: number;
}

export interface BookReviews {
  items: Review[];
  average_rating: number;
  total_reviews: number;
  breakdown: RatingBreakdownEntry[];
  /** AI-generated "what readers are saying" summary — null until there's at least one
   * review, or while the first one is still being generated. */
  review_digest: string | null;
}
