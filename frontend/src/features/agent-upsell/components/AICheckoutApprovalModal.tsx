import { Bot, CheckCircle2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { AgentCheckoutProposalOut } from '../types';

interface AICheckoutApprovalModalProps {
  isOpen: boolean;
  proposal: AgentCheckoutProposalOut | null;
  isLoading: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

export function AICheckoutApprovalModal({
  isOpen,
  proposal,
  isLoading,
  onApprove,
  onCancel,
}: AICheckoutApprovalModalProps) {
  if (!isOpen || !proposal) return null;

  return (
    <div
      data-testid="ai-approval-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md transition-all animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-approval-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-purple-200/80 bg-white p-6 shadow-2xl transition-all dark:border-purple-900/50 dark:bg-zinc-950 sm:p-7">
        {/* Top Decorative Sparkle Background Glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 blur-3xl" />

        {/* Modal Close Icon */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
          aria-label="Close approval modal"
        >
          <X className="size-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-700 to-indigo-800 text-white shadow-lg shadow-purple-900/30">
            <Bot className="size-6 text-purple-200 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-purple-600 dark:text-purple-400" />
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300">
                CONSUMER AI SAFETY GATE
              </span>
            </div>
            <h3
              id="ai-approval-title"
              data-testid="ai-approval-title"
              className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl"
            >
              AI Checkout Recommendation
            </h3>
          </div>
        </div>

        {/* Proposal Summary Card */}
        <div className="mt-5 rounded-2xl border border-purple-100 bg-purple-50/50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 sm:p-5">
          <div className="flex items-center justify-between border-b border-purple-200/60 pb-3 dark:border-purple-800/40">
            <div>
              <p className="text-xs font-semibold text-purple-900/80 dark:text-purple-300">
                MEMBERSHIP PLAN
              </p>
              <h4 className="text-lg font-black text-purple-950 dark:text-purple-100">
                {proposal.plan_name}
              </h4>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="size-3.5" />
              <span>{proposal.savings_percent}% OFF</span>
            </span>
          </div>

          {/* Pricing Breakdown */}
          <div className="mt-4 flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Original baseline price:</span>
              <span data-testid="ai-proposal-original-price" className="font-semibold line-through">
                ₹{proposal.original_price.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1 font-medium">
                <Sparkles className="size-3.5" /> AI calculated savings:
              </span>
              <span data-testid="ai-proposal-savings" className="font-extrabold">
                -₹{proposal.savings_amount.toLocaleString()}
              </span>
            </div>

            {proposal.coupon_code && (
              <div className="flex items-center justify-between text-purple-700 dark:text-purple-300">
                <span>Applied Coupon:</span>
                <span
                  data-testid="ai-proposal-coupon"
                  className="rounded-md bg-purple-200/60 px-2 py-0.5 font-mono text-xs font-bold dark:bg-purple-900/60"
                >
                  {proposal.coupon_code}
                </span>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-3 shadow-inner dark:bg-zinc-900 border border-purple-200/80 dark:border-purple-900/60">
              <span className="font-extrabold text-foreground text-base">Final payable amount:</span>
              <span
                data-testid="ai-proposal-final-price"
                className="text-2xl font-black text-purple-900 dark:text-purple-200"
              >
                ₹{proposal.final_price.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Explicit Consent Explanation Note */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-purple-200/70 bg-purple-50/40 p-3.5 text-xs text-purple-950 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-200">
          <ShieldCheck className="size-4 shrink-0 text-purple-700 dark:text-purple-400" />
          <p className="leading-relaxed font-medium">
            AI has prepared this purchase for you. Nothing will be charged until you approve and complete payment.
          </p>
        </div>

        {/* Modal Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="ai-cancel-btn"
            className="w-full sm:w-auto rounded-xl px-5 text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onApprove}
            isLoading={isLoading}
            data-testid="ai-approve-btn"
            className="w-full sm:w-auto bg-[#3b1254] hover:bg-[#2e0e42] text-white font-extrabold rounded-xl px-6 py-2.5 text-sm shadow-md flex items-center justify-center gap-2"
          >
            <span>Approve & Continue to Payment</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
