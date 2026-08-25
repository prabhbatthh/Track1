import type { SeatSlot } from '@/providers/AuthProvider';

export type RowOccupancy = 'available' | 'partial' | 'full';

export const ROW_OCCUPANCY_DOT: Record<RowOccupancy, string> = {
  available: 'bg-success',
  partial: 'bg-warning',
  full: 'bg-danger',
};

// Live, derived from the same schedule already fetched for the seat grid — not a
// separate call or a second source of truth. A seat missing from the response counts as
// occupied here too, same "unknown is never available" rule the grid itself uses.
export function rowOccupancy(seats: SeatSlot[] | null, labels: string[]): RowOccupancy {
  if (!seats) return 'full';
  const occupied = labels.filter((label) => {
    const seat = seats.find((s) => s.seat_label === label);
    return !seat || seat.status !== 'available';
  }).length;
  if (occupied === 0) return 'available';
  if (occupied === labels.length) return 'full';
  return 'partial';
}
