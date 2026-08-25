export function formatCurrency(amount: number): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatMonth(monthKey: string): string {
  if (!monthKey) return '';
  const d = new Date(`${monthKey}-01`);
  if (Number.isNaN(d.getTime())) return String(monthKey);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

/** "2026-08-19" -> "Wed" */
export function formatWeekday(dateKey: string): string {
  if (!dateKey) return '';
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateKey);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function formatDate(iso: string): string;
export function formatDate(iso: string | null | undefined): string | null;
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
