import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type LoanRecord } from '@/providers/AuthProvider';

import { ActiveLoans } from './ActiveLoans';

function makeLoan(overrides: Partial<LoanRecord>): LoanRecord {
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

describe('ActiveLoans', () => {
  it('shows the fine amount for an overdue, unpaid loan', () => {
    render(
      <ActiveLoans loans={[makeLoan({})]} onReturn={vi.fn()} onRemind={vi.fn()} />,
    );

    expect(screen.getByText('₹150')).toBeInTheDocument();
  });

  it('hides the fine amount once an overdue loan has been marked paid', () => {
    render(
      <ActiveLoans loans={[makeLoan({ fine_paid: true })]} onReturn={vi.fn()} onRemind={vi.fn()} />,
    );

    expect(screen.queryByText('₹150')).not.toBeInTheDocument();
  });
});
