import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, type LoanRecord } from '@/providers/AuthProvider';

import { LateReturnFines } from './LateReturnFines';

function makeEntry(overrides: Partial<LoanRecord>): LoanRecord {
  return {
    id: 'loan-1',
    book_id: 'book-1',
    book_title: 'Dune',
    member_id: 'member-1',
    member_name: 'Jordan Reader',
    borrowed_at: new Date().toISOString(),
    due_date: new Date().toISOString(),
    returned_at: null,
    days_late: 3,
    fine_amount: 150,
    fine_paid: false,
    status: 'overdue',
    ...overrides,
  };
}

describe('LateReturnFines', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists an unpaid overdue-return entry', () => {
    render(
      <AuthProvider>
        <LateReturnFines entries={[makeEntry({})]} onChanged={vi.fn()} />
      </AuthProvider>,
    );

    expect(screen.getByText('Dune')).toBeInTheDocument();
    expect(screen.getByText('₹150')).toBeInTheDocument();
  });

  it('drops an entry from the list once its fine is marked paid', () => {
    render(
      <AuthProvider>
        <LateReturnFines entries={[makeEntry({ fine_paid: true })]} onChanged={vi.fn()} />
      </AuthProvider>,
    );

    expect(screen.queryByText('Dune')).not.toBeInTheDocument();
  });
});
