export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatMonth(monthKey: string): string {
  return new Date(`${monthKey}-01`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

/** "2026-08-19" -> "Wed" */
export function formatWeekday(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
}

export function formatDate(iso: string): string;
export function formatDate(iso: string | null): string | null;
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
