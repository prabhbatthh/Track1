import { Sparkles, Star } from 'lucide-react';

import { Button } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

import type { UpsellEvaluateResponse } from '../types';

export interface AIUpsellProposalProps {
  proposal: UpsellEvaluateResponse;
  onConsiderUpgrade: () => void;
  onKeepCurrent?: () => void;
}

export function AIUpsellProposal({
  proposal,
  onConsiderUpgrade,
  onKeepCurrent,
}: AIUpsellProposalProps) {
  if (!proposal.eligible || !proposal.current_plan || !proposal.recommended_plan) {
    return null;
  }

  const { current_plan, recommended_plan, price_difference, savings_percent, reason } = proposal;
  const annualSavings = price_difference && price_difference > 0 ? price_difference : null;

  const rationaleText =
    reason ||
    `Upgrading from ${current_plan.name} (${formatCurrency(current_plan.price)}) to ${recommended_plan.name} (${formatCurrency(recommended_plan.price)}) saves you ${savings_percent ?? 25}% per month with longer uninterrupted access.`;

  return (
    <div
      role="region"
      aria-label="AI Membership Smart Tip"
      className="relative overflow-hidden rounded-2xl border border-purple-200/90 bg-[#f6edfc] p-5 text-left transition-all dark:border-purple-900/60 dark:bg-purple-950/40 shadow-xs"
    >
      {/* Top Header Bar with AI Sparkles */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3b1254] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
          <Sparkles className="size-3 text-purple-200" /> {proposal.ai_generated !== false ? 'AI SMART TIP' : 'SMART TIP'}
        </span>

        <div className="flex size-7 items-center justify-center rounded-full border border-purple-300/80 bg-white/80 text-purple-800 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-200">
          <Star className="size-3.5 fill-purple-800 dark:fill-purple-200" />
        </div>
      </div>

      {/* Heading */}
      <h3 className="mt-3 text-xl font-bold font-serif text-purple-950 dark:text-purple-100">
        Upgrade & Save {savings_percent ? `${savings_percent}%` : ''}
      </h3>

      {/* Deal Text */}
      <p className="mt-1.5 text-xs text-purple-900/90 dark:text-purple-200/90 leading-relaxed">
        Get the {recommended_plan.months}-month membership for just{' '}
        <span className="font-extrabold text-purple-950 dark:text-purple-50 text-sm">
          {formatCurrency(recommended_plan.price)}
        </span>
        {savings_percent && savings_percent > 0 ? (
          <>. Save <span className="font-bold text-purple-950 dark:text-purple-50">{savings_percent}%</span> instantly.</>
        ) : annualSavings ? (
          <>. Save <span className="font-bold text-purple-950 dark:text-purple-50">{formatCurrency(annualSavings)}</span>.</>
        ) : (
          '.'
        )}
      </p>

      {/* AI Rationale Box */}
      <div className="mt-3 rounded-xl border border-purple-200/80 bg-white/80 p-3 dark:border-purple-800/50 dark:bg-purple-900/40">
        <p className="text-[11px] font-medium text-purple-950 dark:text-purple-100 leading-relaxed italic">
          "{rationaleText}"
        </p>
      </div>

      {/* Button */}
      <div className="mt-4 flex flex-col gap-2">
        <Button
          onClick={onConsiderUpgrade}
          className="w-full justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4a156b] via-[#5c1b85] to-[#3b1254] py-3.5 text-xs font-bold text-white shadow-lg shadow-purple-900/25 hover:shadow-purple-900/40 hover:scale-[1.01] transition-all ring-2 ring-purple-400/40 dark:ring-purple-500/50"
        >
          <span>Upgrade to {recommended_plan.months} Months</span>
          <Sparkles className="size-3.5 text-purple-200" />
        </Button>

        {onKeepCurrent && (
          <button
            type="button"
            onClick={onKeepCurrent}
            className="text-[11px] text-center font-medium text-purple-800/80 hover:text-purple-950 dark:text-purple-300 dark:hover:text-purple-100 transition-colors py-1"
          >
            Keep current plan
          </button>
        )}
      </div>
    </div>
  );
}
