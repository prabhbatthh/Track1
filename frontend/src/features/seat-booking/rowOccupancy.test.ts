import { describe, expect, it } from 'vitest';

import type { SeatSlot } from '@/providers/AuthProvider';

import { rowOccupancy } from './rowOccupancy';

function makeSeat(label: string, status: SeatSlot['status']): SeatSlot {
  return {
    seat_label: label,
    status,
    booking_id: null,
    booked_by_avatar_url: null,
  };
}

const ROW_A = ['A1', 'A2', 'A3', 'A4'];

describe('rowOccupancy', () => {
  it('is "available" when every seat in the row is free', () => {
    const seats = ROW_A.map((label) => makeSeat(label, 'available'));
    expect(rowOccupancy(seats, ROW_A)).toBe('available');
  });

  it('is "full" when every seat in the row is taken', () => {
    const seats = ROW_A.map((label) => makeSeat(label, 'reserved'));
    expect(rowOccupancy(seats, ROW_A)).toBe('full');
  });

  it('is "partial" when only some seats in the row are taken', () => {
    const seats = [
      makeSeat('A1', 'available'),
      makeSeat('A2', 'reserved'),
      makeSeat('A3', 'available'),
      makeSeat('A4', 'booked_by_me'),
    ];
    expect(rowOccupancy(seats, ROW_A)).toBe('partial');
  });

  it('treats a seat missing from the schedule as occupied, never available', () => {
    const seats = [makeSeat('A1', 'available'), makeSeat('A2', 'available'), makeSeat('A3', 'available')];
    // A4 has no matching record at all.
    expect(rowOccupancy(seats, ROW_A)).toBe('partial');
  });

  it('treats a null schedule (still loading/errored) as fully occupied, not available', () => {
    expect(rowOccupancy(null, ROW_A)).toBe('full');
  });
});
