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
    child_name: 'Diya Joshi',
    per_transaction_cap: 200,
    monthly_spending_cap: 1000,
  }),
  getAutopayTrustStatus: vi.fn().mockResolvedValue({
    child_id: 'child_123',
    child_name: 'Diya Joshi',
    trust_tier: 'BASELINE',
    on_time_return_rate: 80.0,
    on_time_returns: 12,
    total_returns: 15,
    sample_size: 15,
    multiplier: 1.0,
    guardian_per_transaction_cap: 200,
    theoretical_cap: 200,
    effective_transaction_cap: 200,
    reasoning: '12 of the last 15 returned books were on time (80%). Trust tier: BASELINE. Multiplier: 1.0x. Effective cap remains ₹200.',
  }),
  simulateAutopayTrustHistory: vi.fn().mockResolvedValue({
    child_id: 'child_123',
    child_name: 'Diya Joshi',
    trust_tier: 'LOW',
    on_time_return_rate: 50.0,
    on_time_returns: 5,
    total_returns: 10,
    sample_size: 10,
    multiplier: 0.7,
    guardian_per_transaction_cap: 200,
    theoretical_cap: 140,
    effective_transaction_cap: 140,
    reasoning: '5 of the last 10 returned books were on time (50%). Trust tier: LOW. Multiplier: 0.7x. Effective cap reduced to ₹140.',
  }),
  executeAutonomousAutopay: vi.fn(),
  approveAutopayCharge: vi.fn(),
}));

vi.mock('@/lib/razorpay', () => ({
  loadRazorpayCheckout: vi.fn(),
}));

describe('GuardianAutopaySimulator — Trust Ladder & Autonomous Execution UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders Trust Status card with linked child and baseline metrics', async () => {
    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/Self-Adjusting Trust Ladder/i)).toBeInTheDocument();
    expect(await screen.findByText(/BASELINE TRUST \(1.0x\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Why this cap\?/i)).toBeInTheDocument();
    expect(screen.getByText(/12 of the last 15 returned books were on time/i)).toBeInTheDocument();
  });

  it('2. HIGH tier displays correct multiplier (1.2x), theoretical cap (₹240), and hard ceiling (₹200)', async () => {
    vi.mocked(guardianApi.getAutopayTrustStatus).mockResolvedValueOnce({
      child_id: 'child_123',
      child_name: 'Diya Joshi',
      trust_tier: 'HIGH',
      on_time_return_rate: 100.0,
      on_time_returns: 15,
      total_returns: 15,
      sample_size: 15,
      multiplier: 1.2,
      guardian_per_transaction_cap: 200,
      theoretical_cap: 240,
      effective_transaction_cap: 200,
      reasoning: '15 of the last 15 returned books were on time (100%). Trust tier: HIGH. Multiplier: 1.2x. Theoretical cap: ₹240. Guardian hard ceiling limits autonomous payments to ₹200.',
    });

    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/HIGH TRUST \(1.2x\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/240/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/200/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Guardian hard ceiling limits autonomous payments to ₹200/i)).toBeInTheDocument();
  });

  it('3. LOW tier displays reduced effective cap (₹140)', async () => {
    vi.mocked(guardianApi.getAutopayTrustStatus).mockResolvedValueOnce({
      child_id: 'child_123',
      child_name: 'Diya Joshi',
      trust_tier: 'LOW',
      on_time_return_rate: 50.0,
      on_time_returns: 5,
      total_returns: 10,
      sample_size: 10,
      multiplier: 0.7,
      guardian_per_transaction_cap: 200,
      theoretical_cap: 140,
      effective_transaction_cap: 140,
      reasoning: '5 of the last 10 returned books were on time (50%). Trust tier: LOW. Multiplier: 0.7x. Effective cap reduced to ₹140.',
    });

    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/LOW TRUST \(0.7x\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/₹140/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Effective cap reduced to ₹140/i)).toBeInTheDocument();
  });

  it('4. Simulate Late Return button calls backend endpoint rather than calculating locally', async () => {
    render(<GuardianAutopaySimulator />);

    const btnLate = await screen.findByRole('button', { name: /Simulate Late Return/i });
    expect(btnLate).toBeInTheDocument();

    fireEvent.click(btnLate);

    await waitFor(() => {
      expect(guardianApi.simulateAutopayTrustHistory).toHaveBeenCalledWith('simulate_late_return');
    });

    expect(await screen.findByText(/Trust Adjustment Audited: GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED/i)).toBeInTheDocument();
    expect(screen.getByText(/Effective cap reduced from ₹200 → ₹140/i)).toBeInTheDocument();
  });

  it('5. Test A: Clicking Simulate ₹150 Fine calls autonomous endpoint and renders successful settlement state', async () => {
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

    expect(await screen.findByText(/✓ Auto-Pay Executed/i)).toBeInTheDocument();
    expect(screen.getByText(/EXECUTED recorded/i)).toBeInTheDocument();
  });

  it('6. Test B: Clicking Simulate ₹250 Fine handles backend 422 policy rejection and renders Auto-Pay Blocked state', async () => {
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

    expect(await screen.findByText(/✕ Auto-Pay Blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/422 Unprocessable Entity/i)).toBeInTheDocument();
    expect(screen.getByText(/TRANSACTION_CAP_EXCEEDED/i)).toBeInTheDocument();
  });

  it('7. Verifies that trust & simulator actions do NOT invoke manual Razorpay checkout or approval flow', async () => {
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
