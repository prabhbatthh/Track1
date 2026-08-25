import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { PaymentPage } from './PaymentPage';
import * as agentUpsellApi from '@/features/agent-upsell/api';

vi.mock('@/features/agent-upsell/api', () => ({
  evaluateUpsell: vi.fn(),
  acceptUpsell: vi.fn(),
}));

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

describe('PaymentPage — AI Upsell Selection & Consent Gate UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AI upsell proposal when eligible', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);

    render(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/AI SMART TIP/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Upgrade & Save/i)).toBeInTheDocument();
  });

  it('shows confirmation notification and indicator when user selects recommendation without initiating payment', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);

    render(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Upgrade to 12 Months/i)).toBeInTheDocument();
    });

    const upgradeBtn = screen.getByText(/Upgrade to 12 Months/i);
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

  it('triggers acceptUpsell ONLY when user explicitly clicks Pay with Razorpay after selecting recommendation', async () => {
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue(mockUpsellProposal);
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

    render(
      <MemoryRouter initialEntries={['/payment?plan=1m&label=1%20Month']}>
        <Routes>
          <Route path="/payment" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Upgrade to 12 Months/i)).toBeInTheDocument();
    });

    // Step 1: Select recommendation
    fireEvent.click(screen.getByText(/Upgrade to 12 Months/i));
    expect(agentUpsellApi.acceptUpsell).not.toHaveBeenCalled();

    // Step 2: Explicit Consent — Click "Pay with Razorpay"
    const payBtn = screen.getByRole('button', { name: /Pay with Razorpay/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(agentUpsellApi.acceptUpsell).toHaveBeenCalledWith(
        { recommended_plan_id: '12m', current_plan_id: '1m', coupon_code: undefined },
        'mock-token'
      );
    });
  });
});
