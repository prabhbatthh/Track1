export interface LibraryReview {
  id: string;
  name: string;
  role: string;
  rating: number;
  quote: string;
  userEmail?: string;
  createdAt: string;
}

const STORAGE_KEY = 'library_platform_reviews';

export const DEFAULT_LIBRARY_REVIEWS: LibraryReview[] = [
  {
    id: 'priyaSharma',
    name: 'Priya Sharma',
    role: 'Standard Member',
    rating: 5,
    quote: 'The quiet study rooms and expansive collection have transformed my reading habits.',
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'rahulNair',
    name: 'Rahul Nair',
    role: 'Premium Member',
    rating: 5,
    quote: 'Reserving seats in advance and borrowing books digitally is seamless. Highly recommended!',
    createdAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'ananyaIyer',
    name: 'Ananya Iyer',
    role: 'Guardian',
    rating: 5,
    quote: 'My children love the reading streak feature. It keeps them engaged and eager to read daily.',
    createdAt: '2026-03-05T00:00:00Z',
  },
  {
    id: 'karanMalhotra',
    name: 'Karan Malhotra',
    role: 'Basic Member',
    rating: 4,
    quote: 'Great community events and helpful staff. A wonderful sanctuary for all book lovers.',
    createdAt: '2026-03-20T00:00:00Z',
  },
];

export function getCustomLibraryReviews(): LibraryReview[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAllLibraryReviews(): LibraryReview[] {
  const custom = getCustomLibraryReviews();
  return [...custom, ...DEFAULT_LIBRARY_REVIEWS];
}

export function getUserLibraryReview(email?: string | null): LibraryReview | undefined {
  if (!email) return undefined;
  const custom = getCustomLibraryReviews();
  return custom.find((r) => r.userEmail === email);
}

export function saveLibraryReview({
  name,
  role,
  rating,
  quote,
  userEmail,
}: {
  name: string;
  role: string;
  rating: number;
  quote: string;
  userEmail?: string;
}): LibraryReview {
  const custom = getCustomLibraryReviews();
  const existingIndex = userEmail ? custom.findIndex((r) => r.userEmail === userEmail) : -1;

  const review: LibraryReview = {
    id: existingIndex >= 0 ? custom[existingIndex].id : `review_${Date.now()}`,
    name,
    role,
    rating,
    quote: quote.trim(),
    userEmail,
    createdAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    custom[existingIndex] = review;
  } else {
    custom.unshift(review);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // quota exceeded or SSR fallback
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('library_reviews_updated'));
  }

  return review;
}
