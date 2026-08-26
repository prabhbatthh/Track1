import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AICheckoutApprovalModal } from './AICheckoutApprovalModal';
import type { AgentCheckoutProposalOut } from '../types';

const mockProposal: AgentCheckoutProposalOut = {
  proposal_id: 'prop_123456789',
  status: 'PENDING_APPROVAL',
  plan_id: '12m',
  plan_name: '12 Month Membership',
  duration_months: 12,
  original_price: 8991,
  final_price: 8092,
  savings_amount: 3896,
  savings_percent: 32,
  currency: 'INR',
  coupon_code: 'WELCOME10',
  expires_at: '2026-08-26T13:30:00.000Z',
  approval_url: '/api/v1/agent/checkout/approve',
};

describe('AICheckoutApprovalModal — Consumer Consent Gate', () => {
  it('renders modal with locked prices, savings, coupon, and explicit consent copy', () => {
    render(
      <AICheckoutApprovalModal
        isOpen={true}
        proposal={mockProposal}
        isLoading={false}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('ai-approval-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ai-approval-title')).toHaveTextContent(/AI Checkout Recommendation/i);
    expect(screen.getByText('12 Month Membership')).toBeInTheDocument();
    expect(screen.getByTestId('ai-proposal-original-price')).toHaveTextContent('₹8,991');
    expect(screen.getByTestId('ai-proposal-savings')).toHaveTextContent('-₹3,896');
    expect(screen.getByTestId('ai-proposal-final-price')).toHaveTextContent('₹8,092');
    expect(screen.getByTestId('ai-proposal-coupon')).toHaveTextContent('WELCOME10');
    expect(
      screen.getByText(/AI has prepared this purchase for you. Nothing will be charged until you approve/i)
    ).toBeInTheDocument();
  });

  it('triggers onApprove when user explicitly clicks Approve & Continue to Payment', () => {
    const handleApprove = vi.fn();
    render(
      <AICheckoutApprovalModal
        isOpen={true}
        proposal={mockProposal}
        isLoading={false}
        onApprove={handleApprove}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('ai-approve-btn'));
    expect(handleApprove).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when user clicks Cancel', () => {
    const handleCancel = vi.fn();
    render(
      <AICheckoutApprovalModal
        isOpen={true}
        proposal={mockProposal}
        isLoading={false}
        onApprove={vi.fn()}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(screen.getByTestId('ai-cancel-btn'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('renders modal dynamically for 3 Month Membership proposal', () => {
    const mock3mProposal: AgentCheckoutProposalOut = {
      proposal_id: 'prop_3m_999',
      status: 'PENDING_APPROVAL',
      plan_id: '3m',
      plan_name: '3 Month Membership',
      duration_months: 3,
      original_price: 2997,
      final_price: 2547,
      savings_amount: 450,
      savings_percent: 15,
      currency: 'INR',
      coupon_code: 'SUMMER15',
      expires_at: '2026-08-26T13:30:00.000Z',
      approval_url: '/api/v1/agent/checkout/approve',
    };

    render(
      <AICheckoutApprovalModal
        isOpen={true}
        proposal={mock3mProposal}
        isLoading={false}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('3 Month Membership')).toBeInTheDocument();
    expect(screen.getByTestId('ai-proposal-original-price')).toHaveTextContent('₹2,997');
    expect(screen.getByTestId('ai-proposal-savings')).toHaveTextContent('-₹450');
    expect(screen.getByTestId('ai-proposal-final-price')).toHaveTextContent('₹2,547');
    expect(screen.getByTestId('ai-proposal-coupon')).toHaveTextContent('SUMMER15');
  });

  it('renders modal dynamically for 6 Month Membership proposal', () => {
    const mock6mProposal: AgentCheckoutProposalOut = {
      proposal_id: 'prop_6m_888',
      status: 'PENDING_APPROVAL',
      plan_id: '6m',
      plan_name: '6 Month Membership',
      duration_months: 6,
      original_price: 5994,
      final_price: 4795,
      savings_amount: 1199,
      savings_percent: 20,
      currency: 'INR',
      coupon_code: null,
      expires_at: '2026-08-26T13:30:00.000Z',
      approval_url: '/api/v1/agent/checkout/approve',
    };

    render(
      <AICheckoutApprovalModal
        isOpen={true}
        proposal={mock6mProposal}
        isLoading={false}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('6 Month Membership')).toBeInTheDocument();
    expect(screen.getByTestId('ai-proposal-original-price')).toHaveTextContent('₹5,994');
    expect(screen.getByTestId('ai-proposal-savings')).toHaveTextContent('-₹1,199');
    expect(screen.getByTestId('ai-proposal-final-price')).toHaveTextContent('₹4,795');
    expect(screen.queryByTestId('ai-proposal-coupon')).not.toBeInTheDocument();
  });
});

