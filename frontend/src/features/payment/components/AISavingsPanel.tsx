import { Bot, Sparkles, TrendingDown, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import { type PricingPlan } from '@/providers/AuthProvider';

export interface AISavingsPanelProps {
  isAiRecommended: boolean;
  selectedPlan: PricingPlan;
  monthlyPlan: PricingPlan;
}

export function AISavingsPanel({
  isAiRecommended,
  selectedPlan,
  monthlyPlan,
}: AISavingsPanelProps) {
  const { t } = useTranslation();

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
      className="relative overflow-hidden rounded-3xl border border-purple-200/90 bg-gradient-to-br from-purple-50/80 via-white to-purple-50/40 p-6 shadow-lg dark:border-purple-900/60 dark:from-purple-950/40 dark:via-zinc-950 dark:to-purple-950/20"
    >
      {/* Subtle Background Glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-purple-500/10 blur-2xl dark:bg-purple-500/20" />

      {/* Header Badge & Title */}
      <div className="flex items-center justify-between">
        {isAiRecommended ? (
          <span
            data-testid="ai-recommended-badge"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-700 to-indigo-700 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-xs"
          >
            <Sparkles className="size-3 text-amber-300 animate-pulse" />
            <span>AI RECOMMENDED</span>
          </span>
        ) : (
          <span
            data-testid="yearly-value-badge"
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider border border-indigo-300/60 dark:border-indigo-800/60"
          >
            <CheckCircle2 className="size-3 text-indigo-600 dark:text-indigo-400" />
            <span>YEARLY VALUE PLAN</span>
          </span>
        )}

        <div className="flex size-7 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
          <Bot className="size-4" />
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-bold font-serif text-foreground">
          {isAiRecommended ? 'AI Savings' : 'Plan Savings Breakdown'}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAiRecommended
            ? 'AI found a better-value membership for you.'
            : 'Value comparison for long-term membership.'}
        </p>
      </div>

      {/* Focal Savings Display */}
      {savings > 0 && (
        <div className="mt-5 rounded-2xl border border-purple-300/70 bg-gradient-to-r from-purple-600/10 via-indigo-600/10 to-purple-600/10 p-4 dark:border-purple-800/70 dark:from-purple-950/60 dark:to-indigo-950/60">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total Savings</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
              <TrendingDown className="size-3" />
              <span>{savingsPercentage}% LESS / MO</span>
            </span>
          </div>

          <p className="mt-1 text-3xl font-black text-purple-950 dark:text-purple-100 tracking-tight" data-testid="ai-savings-amount">
            {formatCurrency(savings)}
          </p>

          <span className="text-[11px] text-purple-900/80 dark:text-purple-300/80 font-medium mt-0.5 block">
            Saved compared to paying month-by-month for {months} months
          </span>
        </div>
      )}

      {/* Comparison Line Items */}
      <div className="mt-5 space-y-2.5 border-t border-border/60 pt-4 text-xs">
        <div className="flex justify-between items-center text-muted-foreground">
          <span>Monthly alternative ({months} × {formatCurrency(actualMonthlyPlanPrice)})</span>
          <span className="font-semibold line-through text-muted-foreground/80">
            {formatCurrency(monthlyEquivalent)}
          </span>
        </div>

        <div className="flex justify-between items-center font-bold text-foreground">
          <span>{selectedPlan.name} (Upfront)</span>
          <span className="text-purple-700 dark:text-purple-300 font-extrabold text-sm">
            {formatCurrency(actualSelectedPlanPrice)}
          </span>
        </div>

        {savings > 0 && (
          <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/60 dark:bg-emerald-950/40 p-2 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
            <span>Net Money Kept in Your Pocket</span>
            <span>{formatCurrency(savings)}</span>
          </div>
        )}
      </div>

      {/* Explanation Banner */}
      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-purple-200/80 bg-white/80 p-3 text-[11px] text-purple-950 dark:border-purple-900/50 dark:bg-zinc-900/90 dark:text-purple-200 leading-relaxed font-medium">
        {isAiRecommended ? (
          <>
            <Sparkles className="size-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <span>
              Based on your library usage, AI recommended the {selectedPlan.name} instead of paying monthly.
            </span>
          </>
        ) : (
          <>
            <ShieldCheck className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Longer-term membership lock in guaranteed lower pricing per month compared to monthly renewals.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
