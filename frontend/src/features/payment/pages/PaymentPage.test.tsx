import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentPage } from './PaymentPage';
import * as agentUpsellApi from '@/features/agent-upsell';

vi.mock('@/features/agent-upsell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/agent-upsell')>();
  return {
    ...actual,
    evaluateUpsell: vi.fn(),
    evaluateFineSavings: vi.fn().mockResolvedValue({ eligible: false }),
    acceptUpsell: vi.fn(),
    createCheckoutProposal: vi.fn(),
    approveCheckoutProposal: vi.fn(),
    fetchAIAuditTrail: vi.fn().mockResolvedValue({ records: [] }),
  };
});

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    token: 'mock-token',
    fullName: 'Test User',
    email: 'test@example.com',
    payAtLibrary: vi.fn(),
    createRazorpayOrder: vi.fn(),
    verifyRazorpayPayment: vi.fn(),
    getPricingPlans: vi.fn().mockResolvedValue([
      { plan_id: '1m', name: '1 Month Membership', months: 1, price: 999, currency: 'INR', save_percent: 0 },
      { plan_id: '12m', name: '12 Month Membership', months: 12, price: 8991, currency: 'INR', save_percent: 25 },
    ]),
    validateCoupon: vi.fn(),
    postAuthRedirect: null,
    clearPostAuthRedirect: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'payment.pageTitle') return 'Payment Checkout';
      if (key === 'payment.defaultLabel') return '1 Month';
      if (key === 'payment.coupon.applied') return `Coupon ${options?.code} applied (${options?.percent}% off)`;
      return key;
    },
  }),
}));

const mockUpsellProposal = {
  eligible: true,
  current_plan: { plan_id: '1m', name: '1 Month Membership', months: 1, price: 999, currency: 'INR', save_percent: 0 },
  recommended_plan: { plan_id: '12m', name: '12 Month Membership', months: 12, price: 8991, currency: 'INR', save_percent: 25 },
  price_difference: 7992,
  savings_percent: 25,
  reason: 'Upgrading to 12 Month Membership saves you 25% per month.',
  ai_generated: true,
};

function renderWithQueryClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('PaymentPage — AI Upsell Selection & Consent Gate UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AI upsell proposal when eligible', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/AI FOUND A BETTER DEAL/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/SAVE/i).length).toBeGreaterThan(0);
  });

  it('shows confirmation notification and indicator when user selects recommendation without initiating payment', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Upgrade & Save/i)).toBeInTheDocument();
    });

    const upgradeBtn = screen.getByText(/Upgrade & Save/i);
    fireEvent.click(upgradeBtn);

    // Confirmation message appears
    await waitFor(() => {
      expect(screen.getByTestId('ai-selection-confirmation')).toBeInTheDocument();
    });

    const confirmationCard = screen.getByTestId('ai-selection-confirmation');
    expect(confirmationCard).toHaveTextContent(/Congratulations/i);
    expect(confirmationCard).toHaveTextContent(/No payment has been made yet/i);
    expect(screen.getByTestId('ai-selection-badge')).toBeInTheDocument();

    // PROOF THAT SELECTING THE RECOMMENDATION DOES NOT INITIATE PAYMENT:
    expect(agentUpsellApi.acceptUpsell).not.toHaveBeenCalled();
  });

  it('triggers checkout proposal and explicit approval gate ONLY when user clicks Pay with Razorpay after selecting recommendation', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);
    vi.mocked(agentUpsellApi.createCheckoutProposal).mockResolvedValue({
      proposal_id: 'prop_test_123',
      status: 'PENDING_APPROVAL',
      plan_id: '12m',
      plan_name: '12 Month Membership',
      duration_months: 12,
      original_price: 8991,
      final_price: 8092,
      savings_amount: 3896,
      savings_percent: 32,
      currency: 'INR',
      expires_at: '2026-08-26T14:00:00.000Z',
      approval_url: '/api/v1/agent/checkout/approve',
    });
    vi.mocked(agentUpsellApi.approveCheckoutProposal).mockResolvedValue({
      proposal_id: 'prop_test_123',
      status: 'APPROVED',
      order_id: 'order_test_123',
      amount: 8092,
      currency: 'INR',
      key_id: 'rzp_test_123',
      plan_id: '12m',
      plan_name: '12 Month Membership',
      source: 'agent_checkout',
    });
    vi.mocked(agentUpsellApi.acceptUpsell).mockResolvedValue({
      order_id: 'order_123',
      amount: 8991,
      currency: 'INR',
      key_id: 'rzp_test_123',
      plan_id: '12m',
      plan_name: '12 Month Membership',
      source: 'ai_upsell',
    });

    // Mock window.Razorpay
    window.Razorpay = vi.fn().mockImplementation(() => ({
      open: vi.fn(),
      on: vi.fn(),
    }));

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Upgrade & Save/i)).toBeInTheDocument();
    });

    // Step 1: Select recommendation
    fireEvent.click(screen.getByText(/Upgrade & Save/i));
    expect(agentUpsellApi.acceptUpsell).not.toHaveBeenCalled();
    expect(agentUpsellApi.approveCheckoutProposal).not.toHaveBeenCalled();

    // Step 2: Click "Pay with Razorpay" -> Creates Proposal and opens Approval Modal
    const payBtn = screen.getByRole('button', { name: /Pay with Razorpay/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByTestId('ai-approval-modal')).toBeInTheDocument();
    });

    // Step 3: Explicit Human Approval in Modal
    const approveBtn = screen.getByTestId('ai-approve-btn');
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(agentUpsellApi.approveCheckoutProposal).toHaveBeenCalledWith(
        { proposal_id: 'prop_test_123' },
        'mock-token'
      );
    });
  });

  it('renders AISavingsPanel with AI RECOMMENDED attribution when upgraded via AI proposal', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Upgrade & Save/i)).toBeInTheDocument();
    });

    // Click AI upgrade
    fireEvent.click(screen.getByText(/Upgrade & Save/i));

    // Verify AI Savings panel renders with AI RECOMMENDED badge
    await waitFor(() => {
      expect(screen.getByTestId('ai-savings-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('ai-recommended-badge')).toHaveTextContent(/(AI RECOMMENDED|YOUR AI SAVINGS)/i);
    expect(screen.getByTestId('ai-savings-amount')).toHaveTextContent(/₹2,997/);
  });

  it('renders AISavingsPanel with YEARLY VALUE PLAN attribution when manually navigating to /payment?plan=12m', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue({
      eligible: false,
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?plan=12m&label=12%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-savings-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('yearly-value-badge')).toHaveTextContent(/YEARLY VALUE/i);
    expect(screen.queryByTestId('ai-recommended-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-savings-amount')).toHaveTextContent(/₹2,997/);
  });

  it('renders AI Safety Check callout with explicit Approve & Pay CTA when navigated from Guardian Auto-Pay review flow (?source=guardian_autopay)', async () => {
    vi.mocked(agentUpsellApi.evaluateFineSavings).mockResolvedValue({
      eligible: false,
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?amount=400&label=Fine%20owed%3A%20%E2%82%B9400&source=guardian_autopay']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('guardian-autopay-safety-check')).toBeInTheDocument();
    });

    expect(screen.getByText(/AI Safety Check/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual approval required/i)).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        return (
          element?.tagName.toLowerCase() === 'p' &&
          element.textContent?.includes('fine is above your') === true &&
          element.textContent?.includes('Auto-Pay limit') === true
        );
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/Automatic payment blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/You remain in control of this payment/i)).toBeInTheDocument();

    const approveBtn = screen.getByTestId('ai-safety-approve-btn');
    expect(approveBtn).toBeInTheDocument();
    expect(approveBtn).toHaveTextContent(/Approve & Pay ₹400/i);
  });

  it('does NOT render AI Safety Check callout on normal membership payment flows', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue({
      eligible: false,
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/1 Month Membership/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('guardian-autopay-safety-check')).not.toBeInTheDocument();
  });
});
