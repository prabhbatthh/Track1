import { Bot, Sparkles, TrendingDown, CheckCircle2, ShieldCheck, PartyPopper, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { type PricingPlan } from '@/providers/AuthProvider';

export interface RecentCompletedSaving {
  id: string;
  planName: string;
  savingsAmount: number;
}

export interface AISavingsPanelProps {
  isAiRecommended: boolean;
  selectedPlan: PricingPlan;
  monthlyPlan: PricingPlan;
  isPaymentCompleted?: boolean;
  previousAiSavings?: number | null;
  recentCompletedSavings?: RecentCompletedSaving[];
  onOpenRecentSavingsModal?: () => void;
}

export function AISavingsPanel({
  isAiRecommended,
  selectedPlan,
  monthlyPlan,
  isPaymentCompleted = false,
  previousAiSavings = null,
  recentCompletedSavings = [],
  onOpenRecentSavingsModal,
}: AISavingsPanelProps) {
  const months = selectedPlan.months;
  const actualMonthlyPlanPrice = monthlyPlan.price;
  const actualSelectedPlanPrice = selectedPlan.price;

  const monthlyEquivalent = actualMonthlyPlanPrice * months;
  const savings = monthlyEquivalent - actualSelectedPlanPrice;
  const savingsPercentage =
    monthlyEquivalent > 0 ? Math.round((savings / monthlyEquivalent) * 100) : 0;

  return (
    <div
      data-testid="ai-savings-panel"
      className="relative overflow-hidden rounded-3xl border border-purple-300/90 bg-gradient-to-br from-purple-50/90 via-white to-purple-50/40 p-6 shadow-lg dark:border-purple-900/60 dark:from-purple-950/60 dark:via-zinc-950 dark:to-purple-950/20 text-left"
    >
      {/* Subtle Background Glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-purple-500/10 blur-2xl dark:bg-purple-500/20" />

      {/* Case 1: Payment successfully completed for AI recommended plan */}
      {isPaymentCompleted && isAiRecommended ? (
        <>
          <div className="flex items-center justify-between">
            <span
              data-testid="ai-recommended-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-white shadow-xs"
            >
              <PartyPopper className="size-3.5 text-amber-300 animate-bounce" />
              <span>🎉 AI HELPED YOU SAVE</span>
            </span>
            <div className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
              <Bot className="size-4" />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-xl font-black font-serif text-emerald-950 dark:text-emerald-100">
              🎉 AI helped you save
            </h3>
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mt-1">
              AI helped you save {formatCurrency(savings)} with your {selectedPlan.name}.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-300/80 bg-white/90 p-4 dark:border-emerald-800/70 dark:bg-emerald-950/60">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
              ACTUAL SAVINGS
            </span>
            <p className="text-4xl font-black text-emerald-700 dark:text-emerald-300 tracking-tight mt-0.5" data-testid="ai-savings-amount">
              {formatCurrency(savings)}
            </p>
          </div>

          <p className="mt-4 text-xs font-medium text-emerald-900 dark:text-emerald-200 leading-relaxed">
            You chose the {selectedPlan.name} instead of paying monthly. That's money you keep in your pocket.
          </p>
        </>
      ) : isAiRecommended ? (
        /* Case 2: AI Recommended flow (Before payment / Checkout stage) */
        <>
          <div className="flex items-center justify-between">
            <span
              data-testid="ai-recommended-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-700 to-indigo-700 px-3.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-white shadow-xs"
            >
              <Sparkles className="size-3.5 text-amber-300 animate-pulse" />
              <span>YOUR AI SAVINGS</span>
            </span>

            <div className="flex size-7 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              <Bot className="size-4" />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-xl font-black font-serif text-purple-950 dark:text-purple-50">
              Your AI savings
            </h3>
            <p className="text-xs font-semibold text-purple-800 dark:text-purple-300 mt-1">
              Potential saving: {formatCurrency(savings)} if you choose the {selectedPlan.name}.
            </p>
          </div>

          {/* Focal Savings Display */}
          {savings > 0 && (
            <div className="mt-4 rounded-2xl border border-purple-300/70 bg-gradient-to-r from-purple-600/10 via-indigo-600/10 to-purple-600/10 p-4 dark:border-purple-800/70 dark:from-purple-950/60 dark:to-indigo-950/60">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-900 dark:text-purple-300">
                  POTENTIAL SAVING
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <TrendingDown className="size-3" />
                  <span>{savingsPercentage}% LESS / MO</span>
                </span>
              </div>

              <p className="mt-1 text-4xl font-black text-purple-950 dark:text-purple-50 tracking-tight" data-testid="ai-savings-amount">
                {formatCurrency(savings)}
              </p>
            </div>
          )}

          {/* Line-by-Line Price Comparison */}
          <div className="mt-4 space-y-2 border-t border-purple-200/60 dark:border-purple-800/60 pt-3.5 text-xs">
            <div className="flex justify-between items-center text-muted-foreground font-medium">
              <span>Pay monthly ({months} × {formatCurrency(actualMonthlyPlanPrice)})</span>
              <span className="font-semibold line-through text-muted-foreground/80">
                {formatCurrency(monthlyEquivalent)}
              </span>
            </div>

            <div className="flex justify-between items-center font-bold text-foreground">
              <span>AI found ({selectedPlan.name})</span>
              <span className="text-purple-700 dark:text-purple-300 font-black text-sm">
                {formatCurrency(actualSelectedPlanPrice)}
              </span>
            </div>

            {savings > 0 && (
              <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300 font-extrabold bg-emerald-50/70 dark:bg-emerald-950/50 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
                <span>YOU SAVE</span>
                <span>{formatCurrency(savings)}</span>
              </div>
            )}
          </div>

          {/* Small Trust Message */}
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-purple-200/80 bg-white/80 p-3 dark:border-purple-900/50 dark:bg-zinc-900/90">
            <ShieldCheck className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="text-[11px] font-medium text-purple-950 dark:text-purple-200 leading-tight">
              AI compares your options to help you spend less. You always choose.
            </span>
          </div>
        </>
      ) : (
        /* Case 3: Manual selection of long-term plan */
        <>
          <div className="flex items-center justify-between">
            <span
              data-testid="yearly-value-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 px-3.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider border border-indigo-300/60 dark:border-indigo-800/60"
            >
              <CheckCircle2 className="size-3 text-indigo-600 dark:text-indigo-400" />
              <span>YEARLY VALUE</span>
            </span>

            <div className="flex size-7 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
              <TrendingDown className="size-4" />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-xl font-bold font-serif text-foreground">
              Plan Savings Breakdown
            </h3>
            <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 mt-1">
              {selectedPlan.name} saves {formatCurrency(savings)} compared with paying monthly.
            </p>
          </div>

          {savings > 0 && (
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/40">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 block">
                TOTAL SAVINGS
              </span>
              <p className="text-4xl font-black text-indigo-950 dark:text-indigo-50 tracking-tight mt-0.5" data-testid="ai-savings-amount">
                {formatCurrency(savings)}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-2 border-t border-border/60 pt-3.5 text-xs">
            <div className="flex justify-between items-center text-muted-foreground font-medium">
              <span>Pay monthly ({months} × {formatCurrency(actualMonthlyPlanPrice)})</span>
              <span className="font-semibold line-through text-muted-foreground/80">
                {formatCurrency(monthlyEquivalent)}
              </span>
            </div>

            <div className="flex justify-between items-center font-bold text-foreground">
              <span>{selectedPlan.name} (Upfront)</span>
              <span className="text-indigo-700 dark:text-indigo-300 font-extrabold text-sm">
                {formatCurrency(actualSelectedPlanPrice)}
              </span>
            </div>
          </div>

          {/* History notice if user rejected AI recommendation previously */}
          {previousAiSavings && previousAiSavings > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-purple-200/80 bg-purple-50/60 p-3 text-[11px] text-purple-950 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-200">
              <Sparkles className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>The best value AI found: {formatCurrency(previousAiSavings)} potential saving with 12 months.</span>
            </div>
          )}
        </>
      )}

      {/* Recent AI Savings Trigger Card */}
      <div className="mt-5 border-t border-purple-200/60 dark:border-purple-800/60 pt-4" data-testid="recent-ai-savings-trigger-card">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>YOUR RECENT AI SAVINGS</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-purple-900/70 dark:text-purple-300/70">
          See how AI has helped you save money.
        </p>
        <button
          type="button"
          onClick={onOpenRecentSavingsModal}
          data-testid="view-recent-savings-btn"
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100 transition-colors"
        >
          <span>View savings</span>
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

