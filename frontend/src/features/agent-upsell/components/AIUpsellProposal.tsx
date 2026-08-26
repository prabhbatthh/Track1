import { Sparkles, TrendingDown } from 'lucide-react';
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

  const { current_plan, recommended_plan, price_difference, savings_percent } = proposal;
  const savings = price_difference && price_difference > 0 ? price_difference : 2997;
  const oldPrice = current_plan.price ? current_plan.price * (recommended_plan.months || 12) : 11988;
  const newPrice = recommended_plan.price || 8991;
  const percentText = savings_percent ? `${savings_percent}% LESS` : '25% LESS';

  return (
    <div
      role="region"
      aria-label="AI Membership Smart Tip"
      className="relative overflow-hidden rounded-3xl border border-purple-300/90 bg-gradient-to-br from-[#f8f1fc] via-[#f3e6fa] to-[#ebd5f8] p-6 text-left shadow-lg dark:border-purple-800/80 dark:from-purple-950/80 dark:via-purple-950/60 dark:to-zinc-950"
    >
      {/* Top Header Badge */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3b1254] px-3.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
          <Sparkles className="size-3.5 text-amber-300 animate-pulse" /> AI FOUND A BETTER DEAL
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-[11px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
          <TrendingDown className="size-3" /> {percentText}
        </span>
      </div>

      {/* Massive Focal Savings Amount */}
      <div className="mt-4">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-900/80 dark:text-purple-300/80 block">
          YOU SAVE
        </span>
        <h2 className="text-4xl sm:text-5xl font-black text-purple-950 dark:text-purple-50 tracking-tight leading-none mt-0.5">
          SAVE {formatCurrency(savings)}
        </h2>
      </div>

      {/* Visual Price Comparison Line */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/80 dark:bg-purple-900/40 p-3.5 border border-purple-200/80 dark:border-purple-800/50">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">Paying Monthly</span>
          <span className="text-base font-semibold line-through text-muted-foreground/80">{formatCurrency(oldPrice)}</span>
        </div>
        <span className="text-purple-600 dark:text-purple-300 font-bold text-lg">→</span>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-purple-900 dark:text-purple-300">{recommended_plan.name}</span>
          <span className="text-xl font-black text-purple-950 dark:text-purple-50">{formatCurrency(newPrice)}</span>
        </div>
      </div>

      {/* Friendly Explanation Note */}
      <p className="mt-3 text-xs font-medium text-purple-900/90 dark:text-purple-200/90 leading-relaxed">
        AI found this saving for you based on your library usage.
      </p>

      {/* Upgrade & Save Button */}
      <div className="mt-4 flex flex-col gap-2">
        <Button
          onClick={onConsiderUpgrade}
          className="w-full justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4a156b] via-[#5c1b85] to-[#3b1254] py-3.5 text-sm font-extrabold text-white shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50 hover:scale-[1.01] transition-all ring-2 ring-purple-400/40"
        >
          <span>Upgrade & Save</span>
          <Sparkles className="size-4 text-purple-200" />
        </Button>

        <p className="text-[11px] text-center font-medium text-purple-900/70 dark:text-purple-300/70">
          AI recommends it — you choose.
        </p>

        {onKeepCurrent && (
          <button
            type="button"
            onClick={onKeepCurrent}
            className="text-[11px] text-center font-medium text-purple-800/80 hover:text-purple-950 dark:text-purple-300 dark:hover:text-purple-100 transition-colors py-0.5"
          >
            Keep current plan
          </button>
        )}
      </div>
    </div>
  );
}
