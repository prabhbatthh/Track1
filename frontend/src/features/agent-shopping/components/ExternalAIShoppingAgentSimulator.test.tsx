import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ExternalAIShoppingAgentSimulator } from './ExternalAIShoppingAgentSimulator';
import * as agentCatalogApi from '@/features/agent-catalog/api';
import * as agentUpsellApi from '@/features/agent-upsell';

vi.mock('@/features/agent-catalog/api', () => ({
  fetchAgentCatalog: vi.fn(),
}));

vi.mock('@/features/agent-upsell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/agent-upsell')>();
  return {
    ...actual,
    evaluateUpsell: vi.fn(),
    createCheckoutProposal: vi.fn(),
    approveCheckoutProposal: vi.fn(),
  };
});

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    token: 'mock-token',
    fullName: 'Test Member',
    email: 'member@example.com',
    verifyRazorpayPayment: vi.fn().mockResolvedValue(true),
  }),
}));

const mockCatalogResponse = {
  merchant: {
    name: 'Library Reading Club',
    description: 'Premier Book Club Merchant',
    currency: 'INR',
    supported_capabilities: ['memberships', 'catalog', 'coupons'],
  },
  membership_plans: [
    { id: 'p1', plan_id: '1m', name: '1 Month Membership', months: 1, price: 999, currency: 'INR', availability: 'available', save_percent: 0 },
    { id: 'p2', plan_id: '3m', name: '3 Month Membership', months: 3, price: 2997, currency: 'INR', availability: 'available', save_percent: 15 },
    { id: 'p3', plan_id: '6m', name: '6 Month Membership', months: 6, price: 5994, currency: 'INR', availability: 'available', save_percent: 20 },
    { id: 'p4', plan_id: '12m', name: '12 Month Membership', months: 12, price: 8991, currency: 'INR', availability: 'available', save_percent: 32 },
  ],
  catalog: [],
  active_coupons: [],
  meta: {
    generated_at: '2026-08-26T13:00:00.000Z',
    total_books: 0,
    total_plans: 4,
    total_coupons: 0,
    schema_version: '1.0-agentic',
  },
};

describe('ExternalAIShoppingAgentSimulator — Bounded Agentic Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Fetches real catalog API and dynamically renders 3m, 6m, 12m membership plans', async () => {
    vi.mocked(agentCatalogApi.fetchAgentCatalog).mockResolvedValue(mockCatalogResponse);

    render(<ExternalAIShoppingAgentSimulator />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-discovery-status')).toBeInTheDocument();
    });

    expect(agentCatalogApi.fetchAgentCatalog).toHaveBeenCalledWith(100);
    expect(screen.getByTestId('dynamic-plan-card-3m')).toHaveTextContent('3 Month Membership');
    expect(screen.getByTestId('dynamic-plan-card-6m')).toHaveTextContent('6 Month Membership');
    expect(screen.getByTestId('dynamic-plan-card-12m')).toHaveTextContent('12 Month Membership');
  });

  it('2. Evaluates plans dynamically and updates recommendation without hardcoding to 12m', async () => {
    vi.mocked(agentCatalogApi.fetchAgentCatalog).mockResolvedValue(mockCatalogResponse);
    vi.mocked(agentUpsellApi.evaluateUpsell).mockResolvedValue({
      eligible: true,
      current_plan: { plan_id: '1m', name: '1 Month', months: 1, price: 999, currency: 'INR', save_percent: 0 },
      recommended_plan: { plan_id: '6m', name: '6 Month Membership', months: 6, price: 5994, currency: 'INR', save_percent: 20 },
      price_difference: 4995,
      savings_percent: 20,
      reason: 'AI recommends 6 Month Membership for optimal balance.',
      ai_generated: true,
    });

    render(<ExternalAIShoppingAgentSimulator currentPlanId="1m" />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-discovery-status')).toBeInTheDocument();
    });

    const evalBtn = screen.getByRole('button', { name: /Evaluate Plans with AI/i });
    fireEvent.click(evalBtn);

    await waitFor(() => {
      expect(screen.getByTestId('agent-recommendation-card')).toHaveTextContent(/6 Month Membership/i);
    });

    expect(screen.getByTestId('agent-recommendation-card')).toHaveTextContent(/optimal balance/i);
  });

  it('3. Prepares purchase proposal via API and enforces MANDATORY human approval gate', async () => {
    vi.mocked(agentCatalogApi.fetchAgentCatalog).mockResolvedValue(mockCatalogResponse);
    vi.mocked(agentUpsellApi.createCheckoutProposal).mockResolvedValue({
      proposal_id: 'prop_agent_6m_123',
      status: 'PENDING_APPROVAL',
      plan_id: '6m',
      plan_name: '6 Month Membership',
      duration_months: 6,
      original_price: 5994,
      final_price: 4795,
      savings_amount: 1199,
      savings_percent: 20,
      currency: 'INR',
      expires_at: '2026-08-26T14:00:00.000Z',
      approval_url: '/api/v1/agent/checkout/approve',
    });

    render(<ExternalAIShoppingAgentSimulator />);

    await waitFor(() => {
      expect(screen.getByTestId('catalog-discovery-status')).toBeInTheDocument();
    });

    // Click 6m plan card
    fireEvent.click(screen.getByTestId('dynamic-plan-card-6m'));

    // Step 4: Click Prepare Proposal
    const prepareBtn = screen.getByTestId('prepare-proposal-btn');
    fireEvent.click(prepareBtn);

    await waitFor(() => {
      expect(agentUpsellApi.createCheckoutProposal).toHaveBeenCalledWith({ plan_id: '6m' }, 'mock-token');
    });

    expect(screen.getByTestId('proposal-preview-card')).toHaveTextContent('prop_agent_6m_123');
    expect(screen.getByTestId('proposal-preview-card')).toHaveTextContent('PENDING_APPROVAL');

    // Step 5: Human Safety Gate — Open Approval Modal
    const approveGateBtn = screen.getByTestId('open-approval-modal-btn');
    fireEvent.click(approveGateBtn);

    await waitFor(() => {
      expect(screen.getByTestId('ai-approval-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('ai-approval-title')).toHaveTextContent(/AI Checkout Recommendation/i);
    expect(screen.getAllByText('6 Month Membership').length).toBeGreaterThan(0);
    expect(screen.getByTestId('ai-proposal-final-price')).toHaveTextContent('₹4,795');
  });
});
