import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AISavingsPanel } from './AISavingsPanel';
import { RecentAISavingsModal } from './RecentAISavingsModal';
import type { PricingPlan } from '@/providers/AuthProvider';

const mockMonthlyPlan: PricingPlan = {
  plan_id: '1m',
  name: '1 Month Membership',
  months: 1,
  price: 999,
  currency: 'INR',
  save_percent: 0,
};

const mock3MPlan: PricingPlan = {
  plan_id: '3m',
  name: '3 Month Membership',
  months: 3,
  price: 2697,
  currency: 'INR',
  save_percent: 10,
};

const mock12MPlan: PricingPlan = {
  plan_id: '12m',
  name: '12 Month Membership',
  months: 12,
  price: 8991,
  currency: 'INR',
  save_percent: 25,
};

describe('AISavingsPanel & RecentAISavingsModal — Consumer AI Trust UX', () => {
  it('1. Renders Recent AI Savings as a compact trigger card with View savings button (not inline list)', () => {
    const onOpen = vi.fn();
    render(
      <AISavingsPanel
        isAiRecommended={true}
        selectedPlan={mock12MPlan}
        monthlyPlan={mockMonthlyPlan}
        onOpenRecentSavingsModal={onOpen}
      />
    );

    expect(screen.getByTestId('recent-ai-savings-trigger-card')).toBeInTheDocument();
    expect(screen.getByText(/YOUR RECENT AI SAVINGS/i)).toBeInTheDocument();
    expect(screen.getByText(/See how AI has helped you save money/i)).toBeInTheDocument();

    const viewBtn = screen.getByTestId('view-recent-savings-btn');
    expect(viewBtn).toBeInTheDocument();

    fireEvent.click(viewBtn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('2. RecentAISavingsModal displays maximum 3 completed AI savings', () => {
    const recentCompleted = [
      { id: 'save_1', planName: '12 Month Membership', savingsAmount: 2997 },
      { id: 'save_2', planName: '6 Month Membership', savingsAmount: 1497 },
      { id: 'save_3', planName: '3 Month Membership', savingsAmount: 300 },
      { id: 'save_4', planName: 'Extra Membership', savingsAmount: 100 },
    ];

    render(
      <RecentAISavingsModal
        isOpen={true}
        onClose={vi.fn()}
        savings={recentCompleted}
      />
    );

    expect(screen.getByText(/Your Recent AI Savings/i)).toBeInTheDocument();
    expect(screen.getByText(/See the latest ways AI helped you save/i)).toBeInTheDocument();

    const items = screen.getAllByTestId('recent-savings-modal-item');
    expect(items.length).toBe(3);
    expect(items[0]).toHaveTextContent(/12 Month Membership/i);
    expect(items[0]).toHaveTextContent(/Saved ₹2,997/i);
    expect(items[1]).toHaveTextContent(/6 Month Membership/i);
    expect(items[1]).toHaveTextContent(/Saved ₹1,497/i);
    expect(items[2]).toHaveTextContent(/3 Month Membership/i);
    expect(items[2]).toHaveTextContent(/Saved ₹300/i);
  });

  it('3. RecentAISavingsModal renders friendly empty state when no completed savings exist', () => {
    render(
      <RecentAISavingsModal
        isOpen={true}
        onClose={vi.fn()}
        savings={[]}
      />
    );

    expect(screen.getByTestId('recent-savings-modal-empty')).toHaveTextContent(
      /AI will show your savings here after you complete a purchase/i
    );
  });

  it('4. Dynamically calculates savings for 3-month recommendation (3 × 999 = 2997 vs 2697 -> ₹300 savings)', () => {
    render(
      <AISavingsPanel
        isAiRecommended={true}
        selectedPlan={mock3MPlan}
        monthlyPlan={mockMonthlyPlan}
      />
    );

    // Dynamic price breakdown: 3 × ₹999 = ₹2,997 -> 3M price ₹2,697 -> Save ₹300
    expect(screen.getByTestId('ai-savings-amount')).toHaveTextContent(/₹300/);
    expect(screen.getByText(/Pay monthly \(3 × ₹999\)/i)).toBeInTheDocument();
    expect(screen.getByText(/₹2,997/)).toBeInTheDocument();
  });

  it('5. Ensures NO double ✨ sparkles are rendered anywhere in the text strings', () => {
    const { container } = render(
      <AISavingsPanel
        isAiRecommended={true}
        selectedPlan={mock12MPlan}
        monthlyPlan={mockMonthlyPlan}
      />
    );

    // Verify text content does not contain literal '✨ ✨'
    expect(container.textContent).not.toContain('✨ ✨');
  });
});
