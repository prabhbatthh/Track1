import { Check, CheckCircle2, ShieldCheck, Sparkles, Tag } from 'lucide-react';
import type { AIFineSavingsEvaluateResponse } from '@/features/agent-upsell';
import { formatCurrency } from '@/lib/format';

export interface AIFineSavingsCardProps {
  proposal: AIFineSavingsEvaluateResponse;
  isApplied: boolean;
  onApplySavings: () => void;
  onDismiss: () => void;
}

export function AIFineSavingsCard({
  proposal,
  isApplied,
  onApplySavings,
  onDismiss,
}: AIFineSavingsCardProps) {
  if (!proposal.eligible || !proposal.coupon_code) return null;

  if (isApplied) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="ai-fine-savings-applied-card"
        className="relative overflow-hidden rounded-3xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-50 via-teal-50/90 to-amber-50/60 p-5 text-emerald-950 shadow-xl shadow-emerald-500/10 transition-all dark:border-emerald-500/50 dark:from-emerald-950/60 dark:via-teal-950/40 dark:to-zinc-950 dark:text-emerald-100"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
            <CheckCircle2 className="size-6 text-emerald-200" />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                AI SAVINGS APPLIED
              </span>
              <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow-xs">
                SAVINGS LOCKED
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-50 mt-0.5">
              {proposal.discount_percent}% Member Discount Applied ({proposal.coupon_code})
            </h4>
            <p className="text-xs text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed font-medium">
              You save <strong>{formatCurrency(proposal.savings_amount)}</strong> on this fine. Payment reduced from {formatCurrency(proposal.fine_amount)} to <strong>{formatCurrency(proposal.discounted_amount)}</strong>.
            </p>
            <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-emerald-300/60 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Click <strong>Pay with Razorpay</strong> below to complete your fine settlement.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="ai-fine-savings-card"
      className="relative overflow-hidden rounded-3xl border border-purple-300/80 bg-gradient-to-br from-purple-50/90 via-indigo-50/60 to-white p-5 text-purple-950 shadow-lg shadow-purple-500/10 transition-all dark:border-purple-800/60 dark:from-purple-950/60 dark:via-indigo-950/40 dark:to-zinc-950 dark:text-purple-100"
    >
      <div className="flex items-start gap-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30">
          <Sparkles className="size-5 text-purple-200 animate-pulse" />
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[11px] font-bold text-purple-800 dark:text-purple-300">
              <Tag className="size-3 text-purple-600 dark:text-purple-400" />
              ✨ AI SMART SAVINGS
            </span>
            <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">
              Save {formatCurrency(proposal.savings_amount)}
            </span>
          </div>

          <h4 className="text-sm font-extrabold text-purple-950 dark:text-purple-50">
            I found a way to reduce your fine.
          </h4>

          <p className="text-xs text-purple-900/90 dark:text-purple-200/90 leading-relaxed font-medium">
            {proposal.rationale || `You're eligible for an active member fine discount (${proposal.discount_percent}% off).`}
          </p>

          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex items-baseline gap-2 rounded-xl bg-purple-100/80 px-3 py-1.5 text-xs font-bold text-purple-950 dark:bg-purple-900/40 dark:text-purple-100">
              <span className="line-through text-purple-400 dark:text-purple-400 font-normal">
                {formatCurrency(proposal.fine_amount)}
              </span>
              <span className="text-emerald-700 dark:text-emerald-300 font-black text-sm">
                {formatCurrency(proposal.discounted_amount)}
              </span>
            </div>
            <span className="text-[11px] font-extrabold text-purple-700 dark:text-purple-300">
              ({proposal.discount_percent}% off)
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onApplySavings}
              data-testid="apply-ai-fine-savings-btn"
              className="rounded-xl bg-purple-900 px-4 py-2 text-xs font-extrabold text-white shadow-md hover:bg-purple-800 transition-colors dark:bg-purple-700 dark:hover:bg-purple-600"
            >
              Apply {formatCurrency(proposal.savings_amount)} Savings
            </button>
            <button
              type="button"
              onClick={onDismiss}
              data-testid="dismiss-ai-fine-savings-btn"
              className="rounded-xl px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100/60 dark:text-purple-300 dark:hover:bg-purple-900/40 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
