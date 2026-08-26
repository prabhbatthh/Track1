import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as guardianApi from '../api';
import { GuardianAutopaySimulator } from './GuardianAutopaySimulator';
import * as razorpayLib from '@/lib/razorpay';

vi.mock('../api', () => ({
  getAutopayDemoLoans: vi.fn().mockResolvedValue({
    within_cap_loan_id: 'loan_within_150',
    within_cap_amount: 150,
    over_cap_loan_id: 'loan_over_250',
    over_cap_amount: 250,
    child_id: 'child_123',
    child_name: 'Alex Smith',
    per_transaction_cap: 200,
    monthly_spending_cap: 1000,
  }),
  executeAutonomousAutopay: vi.fn(),
  approveAutopayCharge: vi.fn(),
}));

vi.mock('@/lib/razorpay', () => ({
  loadRazorpayCheckout: vi.fn(),
}));

describe('GuardianAutopaySimulator — Zero-Click Autonomous Execution UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test A: Clicking Simulate ₹150 Fine calls autonomous endpoint and renders successful settlement state', async () => {
    vi.mocked(guardianApi.executeAutonomousAutopay).mockResolvedValueOnce({
      success: true,
      payment_id: 'pay_auto_12345',
      razorpay_payment_id: 'pay_sim_999',
      razorpay_order_id: 'order_sim_888',
      amount: 150,
      loan_id: 'loan_within_150',
      member_id: 'child_123',
      guardian_id: 'guardian_123',
      label: 'Guardian Auto-Pay Fine Settlement: Demo Book',
    });

    render(<GuardianAutopaySimulator />);

    const btn150 = await screen.findByRole('button', { name: /Simulate ₹150 Fine/i });
    expect(btn150).toBeInTheDocument();

    fireEvent.click(btn150);

    await waitFor(() => {
      expect(guardianApi.executeAutonomousAutopay).toHaveBeenCalledWith('loan_within_150');
    });

    // Renders Auto-Pay Executed success banner
    expect(await screen.findByText(/✓ Auto-Pay Executed/i)).toBeInTheDocument();
    expect(screen.getByText(/autonomous_simulated/i)).toBeInTheDocument();
    expect(screen.getByText(/EXECUTED recorded/i)).toBeInTheDocument();
  });

  it('Test B: Clicking Simulate ₹250 Fine handles backend 422 policy rejection and renders Auto-Pay Blocked state', async () => {
    const error422: any = new Error('Auto-Pay policy evaluation rejected: Transaction amount exceeds cap');
    error422.status = 422;

    vi.mocked(guardianApi.executeAutonomousAutopay).mockRejectedValueOnce(error422);

    render(<GuardianAutopaySimulator />);

    const btn250 = await screen.findByRole('button', { name: /Simulate ₹250 Fine/i });
    expect(btn250).toBeInTheDocument();

    fireEvent.click(btn250);

    await waitFor(() => {
      expect(guardianApi.executeAutonomousAutopay).toHaveBeenCalledWith('loan_over_250');
    });

    // Renders Auto-Pay Blocked error banner
    expect(await screen.findByText(/✕ Auto-Pay Blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/422 Unprocessable Entity/i)).toBeInTheDocument();
    expect(screen.getByText(/TRANSACTION_CAP_EXCEEDED/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Guardian Notified/i)[0]).toBeInTheDocument();
  });

  it('Test C: Verifies that simulator actions do NOT invoke manual Razorpay checkout or approval flow', async () => {
    vi.mocked(guardianApi.executeAutonomousAutopay).mockResolvedValueOnce({
      success: true,
      payment_id: 'pay_auto_12345',
      razorpay_payment_id: 'pay_sim_999',
      razorpay_order_id: 'order_sim_888',
      amount: 150,
      loan_id: 'loan_within_150',
      member_id: 'child_123',
      guardian_id: 'guardian_123',
      label: 'Guardian Auto-Pay Fine Settlement: Demo Book',
    });

    render(<GuardianAutopaySimulator />);

    const btn150 = await screen.findByRole('button', { name: /Simulate ₹150 Fine/i });
    fireEvent.click(btn150);

    await waitFor(() => {
      expect(guardianApi.executeAutonomousAutopay).toHaveBeenCalled();
    });

    // PROOF: Zero manual Razorpay approval calls
    expect(guardianApi.approveAutopayCharge).not.toHaveBeenCalled();
    expect(razorpayLib.loadRazorpayCheckout).not.toHaveBeenCalled();
  });
});
