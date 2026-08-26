import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AIUpsellProposal } from './AIUpsellProposal';
import type { UpsellEvaluateResponse } from '../types';

const mockEligibleProposal: UpsellEvaluateResponse = {
  eligible: true,
  current_plan: {
    plan_id: '1m',
    name: '1 Month Membership',
    months: 1,
    price: 999,
    currency: 'INR',
    save_percent: 0,
  },
  recommended_plan: {
    plan_id: '12m',
    name: '12 Month Membership',
    months: 12,
    price: 8991,
    currency: 'INR',
    save_percent: 25,
  },
  price_difference: 7992,
  savings_percent: 25,
  reason: 'Upgrading to 12 Month Membership saves you 25% per month with extended access.',
  ai_generated: true,
};

const mockFallbackProposal: UpsellEvaluateResponse = {
  ...mockEligibleProposal,
  ai_generated: false,
  reason: 'Standard savings rationale from server.',
};

const mockIneligibleProposal: UpsellEvaluateResponse = {
  eligible: false,
  reason: 'You are currently on our highest tier.',
  ai_generated: false,
};

describe('AIUpsellProposal Component (Clean Consumer Design)', () => {
  it('renders clean consumer AI proposal card with focal savings', () => {
    const onConsiderUpgrade = vi.fn();

    render(
      <AIUpsellProposal
        proposal={mockEligibleProposal}
        onConsiderUpgrade={onConsiderUpgrade}
      />
    );

    // AI badge & focal savings heading
    expect(screen.getByText(/AI FOUND A BETTER DEAL/i)).toBeInTheDocument();
    expect(screen.getByText(/SAVE ₹7,992/i)).toBeInTheDocument();
    expect(screen.getByText(/AI found this saving for you based on your library usage/i)).toBeInTheDocument();
  });

  it('renders AI FOUND A BETTER DEAL badge when proposal is eligible', () => {
    render(
      <AIUpsellProposal
        proposal={mockFallbackProposal}
        onConsiderUpgrade={vi.fn()}
      />
    );

    expect(screen.getByText(/AI FOUND A BETTER DEAL/i)).toBeInTheDocument();
  });

  it('renders nothing when eligible is false', () => {
    const { container } = render(
      <AIUpsellProposal
        proposal={mockIneligibleProposal}
        onConsiderUpgrade={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('triggers onConsiderUpgrade callback when user clicks Upgrade & Save button', () => {
    const onConsiderUpgrade = vi.fn();
    render(
      <AIUpsellProposal
        proposal={mockEligibleProposal}
        onConsiderUpgrade={onConsiderUpgrade}
      />
    );

    const upgradeButton = screen.getByRole('button', { name: /Upgrade & Save/i });
    fireEvent.click(upgradeButton);

    expect(onConsiderUpgrade).toHaveBeenCalledTimes(1);
  });
});
