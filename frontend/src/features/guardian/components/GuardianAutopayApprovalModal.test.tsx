import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuardianChild } from '@/providers/AuthProvider';
import * as guardianApi from '../api';
import { GuardianAutopayApprovalModal } from './GuardianAutopayApprovalModal';
import * as razorpayLib from '@/lib/razorpay';

vi.mock('../api', () => ({
  getAutopayPolicy: vi.fn().mockResolvedValue({
    id: 'pol_123',
    guardian_id: 'g_123',
    member_id: 'm_123',
    enabled: true,
    per_transaction_cap: 200,
    monthly_spending_cap: 1000,
    allowed_charge_types: ['fine'],
  }),
  approveAutopayCharge: vi.fn().mockResolvedValue({
    razorpay_order_id: 'order_test_autopay_999',
    amount: 150,
    currency: 'INR',
    key_id: 'rzp_test_key_123',
    member_id: 'm_123',
    charge_id: 'loan_123',
    label: 'Auto-Pay Fine Settlement: Test Book',
  }),
}));

vi.mock('@/lib/razorpay', () => ({
  loadRazorpayCheckout: vi.fn(),
}));

describe('GuardianAutopayApprovalModal — Explicit Consent Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(razorpayLib.loadRazorpayCheckout).mockResolvedValue(true);
    window.Razorpay = vi.fn().mockImplementation(() => ({
      open: vi.fn(),
    })) as unknown as typeof window.Razorpay;
  });

  const dummyChild: GuardianChild = {
    id: 'm_123',
    full_name: 'Little Alex',
    email: 'alex@example.com',
    currently_reading: [],
    completed: [],
    outstanding_fine: 150,
    fine_book_title: 'Harry Potter & the Philosopher Stone',
    fine_due_date: '2026-08-01T00:00:00Z',
    subscription_expires_on: null,
  };

  it('renders modal with proposed payment copy and policy caps WITHOUT calling approval or Razorpay', async () => {
    render(
      <GuardianAutopayApprovalModal
        child={dummyChild}
        chargeId="loan_123"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Modal opens & renders text
    expect(screen.getByTestId('guardian-autopay-modal')).toBeInTheDocument();
    expect(screen.getByTestId('autopay-proposed-amount')).toHaveTextContent('₹150');
    expect(screen.getByText(/Nothing will be charged until you approve/i)).toBeInTheDocument();

    // PROOF: Opening/viewing modal creates 0 Razorpay orders & makes 0 approval API calls
    expect(guardianApi.approveAutopayCharge).not.toHaveBeenCalled();
    expect(razorpayLib.loadRazorpayCheckout).not.toHaveBeenCalled();
  });

  it('triggers approval API and opens Razorpay checkout ONLY when user clicks Approve & Pay', async () => {
    render(
      <GuardianAutopayApprovalModal
        child={dummyChild}
        chargeId="loan_123"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const approveBtn = await screen.findByTestId('autopay-approve-and-pay-btn');
    await waitFor(() => expect(approveBtn).not.toBeDisabled());

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(guardianApi.approveAutopayCharge).toHaveBeenCalledWith({
        member_id: 'm_123',
        charge_id: 'loan_123',
      });
    });

    await waitFor(() => {
      expect(razorpayLib.loadRazorpayCheckout).toHaveBeenCalled();
    });
  });

  it('does NOT open Razorpay checkout if backend approval is rejected', async () => {
    vi.mocked(guardianApi.approveAutopayCharge).mockRejectedValueOnce(
      new Error('Auto-Pay approval rejected: Transaction amount exceeds cap')
    );

    render(
      <GuardianAutopayApprovalModal
        child={dummyChild}
        chargeId="loan_123"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const approveBtn = await screen.findByTestId('autopay-approve-and-pay-btn');
    await waitFor(() => expect(approveBtn).not.toBeDisabled());

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(guardianApi.approveAutopayCharge).toHaveBeenCalled();
    });

    expect(window.Razorpay).not.toHaveBeenCalled();
  });
});
