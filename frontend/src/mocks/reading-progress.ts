export interface ProgressBook {
  id: string;
  title: string;
  /** Omitted for real backend data — the Book table doesn't track authors yet. */
  author?: string;
  percentComplete: number;
}

export const currentlyReadingBooks: ProgressBook[] = [
  { id: 'atomic-habits', title: 'Atomic Habits', author: 'James Clear', percentComplete: 62 },
  { id: 'sapiens', title: 'Sapiens', author: 'Yuval Noah Harari', percentComplete: 28 },
];

export const completedBooks: ProgressBook[] = [
  { id: 'deep-work', title: 'Deep Work', author: 'Cal Newport', percentComplete: 100 },
  {
    id: 'norwegian-wood',
    title: 'Norwegian Wood',
    author: 'Haruki Murakami',
    percentComplete: 100,
  },
  {
    id: 'a-short-history',
    title: 'A Short History of Nearly Everything',
    author: 'Bill Bryson',
    percentComplete: 100,
  },
];

export const wantToReadBooks: ProgressBook[] = [
  { id: 'the-overstory', title: 'The Overstory', author: 'Richard Powers', percentComplete: 0 },
  { id: 'cant-hurt-me', title: "Can't Hurt Me", author: 'David Goggins', percentComplete: 0 },
];

export const readingGoal = {
  target: 40,
  current: 34,
  year: 2026,
};

export const readingStreak = {
  currentStreakDays: 12,
  longestStreakDays: 27,
};
