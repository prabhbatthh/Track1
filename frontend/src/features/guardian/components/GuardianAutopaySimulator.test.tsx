import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as guardianApi from '../api';
import { GuardianAutopaySimulator } from './GuardianAutopaySimulator';
import * as razorpayLib from '@/lib/razorpay';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGetGuardianChildren = vi.fn().mockResolvedValue([
  { id: 'child_123', full_name: 'Saanvi Bose', outstanding_fine: 400 }
]);

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    getGuardianChildren: mockGetGuardianChildren,
  }),
}));

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
    reasoning: '12 of the last 15 returned books were on time (80%). Safe baseline limit applied based on borrowing track record.',
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
  updateAutopayPolicy: vi.fn(),
  resetAutopayDemoLoans: vi.fn(),
  getAutopayActivityHistory: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock('@/lib/razorpay', () => ({
  loadRazorpayCheckout: vi.fn(),
}));

describe('GuardianAutopaySimulator — Production Guardian Control UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders clean Guardian Header, linked child, spending limit cards, and why-this-limit callout', async () => {
    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/AI Guardian Auto-Pay/i)).toBeInTheDocument();
    expect(screen.getByText(/Let AI handle eligible fines automatically while keeping you in control/i)).toBeInTheDocument();
    expect(screen.getByText(/Diya Joshi/i)).toBeInTheDocument();
    expect(screen.getByText(/Single Fine Limit/i)).toBeInTheDocument();
    expect(screen.getByText(/Monthly Spending Limit/i)).toBeInTheDocument();
    expect(screen.getByText(/Why this limit\?/i)).toBeInTheDocument();
  });

  it('1b. Displays "No returns yet" for Saanvi Bose when child has zero sample_size / return history', async () => {
    vi.mocked(guardianApi.getAutopayDemoLoans).mockResolvedValueOnce({
      within_cap_loan_id: 'loan_within_150',
      within_cap_amount: 150,
      over_cap_loan_id: 'loan_over_250',
      over_cap_amount: 250,
      child_id: 'child_123',
      child_name: 'Saanvi Bose',
      per_transaction_cap: 200,
      monthly_spending_cap: 1000,
    });
    vi.mocked(guardianApi.getAutopayTrustStatus).mockResolvedValueOnce({
      child_id: 'child_123',
      child_name: 'Saanvi Bose',
      trust_tier: 'BASELINE',
      on_time_return_rate: 0,
      on_time_returns: 0,
      total_returns: 0,
      sample_size: 0,
      multiplier: 1.0,
      guardian_per_transaction_cap: 200,
      theoretical_cap: 200,
      effective_transaction_cap: 200,
      reasoning: 'No completed return history yet. BASELINE (1.0x) is applied as the safe starting default (not a penalty).',
    });

    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/Saanvi Bose/i)).toBeInTheDocument();
    expect(screen.getByText(/safe starting default/i)).toBeInTheDocument();

    // Expand collapsible section to verify "No returns yet"
    const accordionBtn = screen.getByRole('button', { name: /How AI Trust & Safety Works/i });
    fireEvent.click(accordionBtn);

    expect(await screen.findByText(/No returns yet/i)).toBeInTheDocument();
    expect(screen.getByText(/BASELINE TRUST/i)).toBeInTheDocument();
  });

  it('2. Renders "How Auto-Pay Protects You" rule summary cards', async () => {
    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/How Auto-Pay Protects You/i)).toBeInTheDocument();
    expect(screen.getByText(/Within your limit/i)).toBeInTheDocument();
    expect(screen.getByText(/Above your limit/i)).toBeInTheDocument();
  });

  it('3. Renders Recent Auto-Pay Activity feed section', async () => {
    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/Recent Auto-Pay Activity/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
  });

  it('4. Allows toggling Auto-Pay master switch (ON/OFF)', async () => {
    render(<GuardianAutopaySimulator />);

    const pauseBtn = await screen.findByRole('button', { name: /Pause Auto-Pay/i });
    expect(pauseBtn).toBeInTheDocument();

    fireEvent.click(pauseBtn);

    expect(screen.getByText(/AUTO-PAY PAUSED/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable Auto-Pay/i })).toBeInTheDocument();
  });

  it('5. Renders Outstanding Fines card with "Review & Pay Fines" button when fine > 0 and navigates without calling autonomous payment', async () => {
    mockGetGuardianChildren.mockResolvedValueOnce([
      { id: 'child_123', full_name: 'Saanvi Bose', outstanding_fine: 400 },
    ]);

    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/Outstanding Fines/i)).toBeInTheDocument();
    expect(await screen.findByText(/₹400/i)).toBeInTheDocument();

    const reviewBtn = screen.getByRole('button', { name: /Review & Pay Fines/i });
    expect(reviewBtn).toBeInTheDocument();

    fireEvent.click(reviewBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/payment?amount=400&label=Fine%20owed%3A%20%E2%82%B9400&source=guardian_autopay&child_id=child_123');
    expect(guardianApi.executeAutonomousAutopay).not.toHaveBeenCalled();
  });

  it('6. Displays "You\'re all caught up" and no active payment button when outstanding fine is 0', async () => {
    mockGetGuardianChildren.mockResolvedValueOnce([
      { id: 'child_123', full_name: 'Saanvi Bose', outstanding_fine: 0 },
    ]);

    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/Outstanding Fines/i)).toBeInTheDocument();
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.getByText(/All Fines Settled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review & Pay Fines/i })).not.toBeInTheDocument();
  });

  it('7. Fetches and renders backend activity items (Guardian approved payment, Automatically paid, Payment blocked)', async () => {
    vi.spyOn(guardianApi, 'getAutopayActivityHistory').mockResolvedValueOnce({
      items: [
        {
          id: 'act_1',
          type: 'guardian_approved',
          title: 'Guardian approved payment',
          badge: 'Manual approval',
          description: 'Paid after AI limit review',
          amount: 400,
          child_name: 'Saanvi Bose',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'act_2',
          type: 'autonomous_paid',
          title: 'Automatically paid',
          badge: 'AI Auto-Pay',
          description: 'Paid via AI Auto-Pay',
          amount: 150,
          child_name: 'Saanvi Bose',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    render(<GuardianAutopaySimulator />);

    expect(await screen.findByText(/Guardian approved payment/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Manual approval/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Automatically paid/i)).toBeInTheDocument();
    expect(screen.getAllByText(/AI Auto-Pay/i).length).toBeGreaterThan(0);
  });
});
