import { ArrowRight, BookOpen, Calendar, CheckCircle2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button, Modal } from '@/components/ui';
import { apiPost, getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { loadRazorpayCheckout, type RazorpayPaymentResponse } from '@/lib/razorpay';
import type { GuardianChild } from '@/providers/AuthProvider';

import { approveAutopayCharge, getAutopayPolicy, type AutopayPolicy } from '../api';

export interface GuardianAutopayApprovalModalProps {
  child: GuardianChild | null;
  chargeId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function GuardianAutopayApprovalModal({
  child,
  chargeId,
  onClose,
  onSuccess,
}: GuardianAutopayApprovalModalProps) {
  const [policy, setPolicy] = useState<AutopayPolicy | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (!child) return;
    setIsLoadingPolicy(true);
    getAutopayPolicy(child.id)
      .then((data) => setPolicy(data))
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setIsLoadingPolicy(false));
  }, [child]);

  if (!child) return null;

  const fineAmount = child.outstanding_fine;
  const bookTitle = child.fine_book_title || 'Overdue Book Return Fine';

  async function handleApproveAndPay() {
    if (!child || isApproving) return;

    setIsApproving(true);

    try {
      const scriptLoaded = await loadRazorpayCheckout();
      if (!scriptLoaded || !window.Razorpay) {
        toast.error('Failed to load payment checkout SDK');
        setIsApproving(false);
        return;
      }

      // 1. Call server-authoritative approval endpoint (CONSENT GATE)
      const approval = await approveAutopayCharge({
        member_id: child.id,
        charge_id: chargeId || child.id,
      });

      // 2. Open Razorpay checkout popup ONLY after server approval
      const checkout = new window.Razorpay({
        key: approval.key_id,
        amount: approval.amount * 100, // paise
        currency: approval.currency,
        name: 'Community Library Platform',
        description: approval.label,
        order_id: approval.razorpay_order_id,
        handler: async (response: RazorpayPaymentResponse) => {
          try {
            await apiPost('/payments/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success('🎉 Fine settled successfully via Auto-Pay!');
            onSuccess();
            onClose();
          } catch (err) {
            toast.error(getErrorMessage(err, 'Payment verification failed'));
          } finally {
            setIsApproving(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.info('Payment checkout closed');
            setIsApproving(false);
          },
        },
      });

      checkout.open();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Auto-Pay approval failed'));
      setIsApproving(false);
    }
  }

  return (
    <Modal
      open={child !== null}
      onClose={onClose}
      title="Guardian Auto-Pay Fine Approval"
    >
      <div className="flex flex-col gap-4 text-sm" data-testid="guardian-autopay-modal">
        {/* Header Banner Card with Ambient Glow */}
        <div className="relative overflow-hidden flex items-center gap-3 rounded-2xl border border-purple-300/80 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 p-4 text-white shadow-lg">
          <div className="absolute -right-6 -top-6 size-24 rounded-full bg-purple-500/30 blur-2xl pointer-events-none" />
          
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-600/80 border border-purple-400/50 text-white shadow-md">
            <Sparkles className="size-5 text-amber-300 animate-pulse" />
          </div>

          <div className="relative space-y-0.5">
            <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-amber-300 block">
              🛡️ GUARDIAN POLICY-PROTECTED AUTO-PAY
            </span>
            <p className="text-sm font-bold text-purple-100">
              Review & approve this payment for <span className="underline decoration-purple-400 decoration-2 underline-offset-2">{child.full_name}</span>
            </p>
          </div>
        </div>

        {/* Proposed Charge Hero Card */}
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-purple-50/40 dark:to-purple-950/20 p-4 shadow-xs space-y-2.5 transition-all duration-200 hover:border-purple-300/80 dark:hover:border-purple-700/60 hover:shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <BookOpen className="size-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="truncate">{bookTitle}</span>
          </div>

          <div className="flex justify-between items-baseline gap-2 pt-1 border-t border-border/50">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Proposed Amount</span>
            <span
              className="text-3xl font-black bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent"
              data-testid="autopay-proposed-amount"
            >
              {formatCurrency(fineAmount)}
            </span>
          </div>
        </div>

        {/* Policy Governance Card */}
        <div className="rounded-2xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/60 to-emerald-50/80 p-3.5 text-emerald-950 space-y-2.5 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 dark:text-emerald-100 shadow-xs transition-all duration-200 hover:border-emerald-400/90 dark:hover:border-emerald-700/80 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Auto-Pay Policy Governance</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-600/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>ENFORCED</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
            {/* Metric 1: Per Transaction Cap */}
            <div className="flex flex-col gap-0.5 rounded-xl border border-emerald-200/90 bg-white/70 dark:bg-emerald-950/60 dark:border-emerald-800/60 p-2 text-center transition-all duration-200 hover:border-emerald-400 group/metric shadow-2xs">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-800/80 dark:text-emerald-300/80 uppercase">
                <Zap className="size-3 text-emerald-600 group-hover/metric:scale-110 transition-transform" />
                <span>Per-Tx Cap</span>
              </div>
              <span className="font-black text-sm text-emerald-900 dark:text-emerald-100">
                {formatCurrency(policy?.per_transaction_cap ?? 200)}
              </span>
            </div>

            {/* Metric 2: Monthly Spending Cap */}
            <div className="flex flex-col gap-0.5 rounded-xl border border-emerald-200/90 bg-white/70 dark:bg-emerald-950/60 dark:border-emerald-800/60 p-2 text-center transition-all duration-200 hover:border-emerald-400 group/metric shadow-2xs">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-800/80 dark:text-emerald-300/80 uppercase">
                <Calendar className="size-3 text-emerald-600 group-hover/metric:scale-110 transition-transform" />
                <span>Monthly Cap</span>
              </div>
              <span className="font-black text-sm text-emerald-900 dark:text-emerald-100">
                {formatCurrency(policy?.monthly_spending_cap ?? 1000)}
              </span>
            </div>

            {/* Metric 3: Allowed Charges */}
            <div className="flex flex-col gap-0.5 rounded-xl border border-emerald-200/90 bg-white/70 dark:bg-emerald-950/60 dark:border-emerald-800/60 p-2 text-center transition-all duration-200 hover:border-emerald-400 group/metric shadow-2xs">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-800/80 dark:text-emerald-300/80 uppercase">
                <ShieldCheck className="size-3 text-emerald-600 group-hover/metric:scale-110 transition-transform" />
                <span>Allowed</span>
              </div>
              <span className="font-black text-[11px] leading-tight text-emerald-900 dark:text-emerald-100 truncate">
                Fines Only
              </span>
            </div>
          </div>
        </div>

        {/* Consent Boundary Guarantee Box */}
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-400/80 bg-gradient-to-r from-amber-50/90 to-yellow-50/80 p-3.5 text-amber-950 dark:border-amber-900/50 dark:from-amber-950/40 dark:to-yellow-950/30 dark:text-amber-200 shadow-xs transition-all duration-200 hover:border-amber-500/80 hover:shadow-sm">
          <ShieldCheck className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs font-medium leading-relaxed">
            <strong>Nothing will be charged until you approve.</strong> Click below to validate policy limits and initiate checkout.
          </p>
        </div>

        {/* High-Impact CTA Button */}
        <Button
          onClick={handleApproveAndPay}
          isLoading={isApproving || isLoadingPolicy}
          data-testid="autopay-approve-and-pay-btn"
          className="w-full justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 hover:from-purple-800 hover:to-indigo-700 py-3.5 text-base font-extrabold text-white shadow-xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all ring-2 ring-purple-400/30"
        >
          <Sparkles className="size-4 text-amber-300 animate-pulse" />
          <span>Approve & Pay {formatCurrency(fineAmount)}</span>
          <ArrowRight className="size-4 text-purple-200" />
        </Button>
      </div>
    </Modal>
  );
}
