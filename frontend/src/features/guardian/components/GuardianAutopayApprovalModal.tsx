import { ArrowRight, BookOpen, Bot, CheckCircle2, ChevronRight, Info, Lock, Pencil, Save, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button, Modal } from '@/components/ui';
import { apiPost, getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { loadRazorpayCheckout, type RazorpayPaymentResponse } from '@/lib/razorpay';
import type { GuardianChild } from '@/providers/AuthProvider';

import { approveAutopayCharge, getAutopayPolicy, updateAutopayPolicy, type AutopayPolicy } from '../api';

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
  const [isEditingCaps, setIsEditingCaps] = useState(false);
  const [isSavingCaps, setIsSavingCaps] = useState(false);
  const [perTxCapInput, setPerTxCapInput] = useState<number>(200);
  const [monthlyCapInput, setMonthlyCapInput] = useState<number>(1000);

  useEffect(() => {
    if (!child) return;
    setIsLoadingPolicy(true);
    getAutopayPolicy(child.id)
      .then((data) => {
        setPolicy(data);
        setPerTxCapInput(data.per_transaction_cap);
        setMonthlyCapInput(data.monthly_spending_cap);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setIsLoadingPolicy(false));
  }, [child]);

  if (!child) return null;

  const fineAmount = child.outstanding_fine;
  const bookTitle = child.fine_book_title || 'Overdue Book Return Fine';
  const perTxCap = policy?.per_transaction_cap ?? 200;
  const exceedsLimit = fineAmount > perTxCap;

  async function handleSaveCaps() {
    if (!child || isSavingCaps) return;
    setIsSavingCaps(true);
    try {
      const updated = await updateAutopayPolicy(child.id, {
        per_transaction_cap: Number(perTxCapInput),
        monthly_spending_cap: Number(monthlyCapInput),
      });
      setPolicy(updated);
      setIsEditingCaps(false);
      toast.success('🎉 Safety limit updated successfully!');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update safety limit'));
    } finally {
      setIsSavingCaps(false);
    }
  }

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
      className="max-w-md sm:max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-border"
    >
      <div className="flex flex-col text-sm bg-card p-6 gap-6" data-testid="guardian-autopay-modal">
        {/* 🍏 TOP HERO PRICE SECTION (APPLE-PAY STYLE) */}
        <div className="flex flex-col items-center text-center space-y-1 pt-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            LIBRARY FINE PAYMENT
          </span>
          <span
            className="text-5xl font-black text-foreground tracking-tight"
            data-testid="autopay-proposed-amount"
          >
            {formatCurrency(fineAmount)}
          </span>
          <p className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
            <BookOpen className="size-3.5 text-purple-600 dark:text-purple-400" />
            <span>{bookTitle}</span>
          </p>
        </div>

        {/* 📋 APPLE-PAY STYLE ROW-BASED ITEM DETAILS */}
        <div className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-muted/20 overflow-hidden">
          {/* Row 1: Child Beneficiary */}
          <div className="flex items-center justify-between p-3.5 text-xs">
            <span className="text-muted-foreground font-medium">Child Account</span>
            <span className="font-bold text-foreground">{child.full_name}</span>
          </div>

          {/* Row 2: Payment Method */}
          <div className="flex items-center justify-between p-3.5 text-xs">
            <span className="text-muted-foreground font-medium">Payment Gateway</span>
            <span className="font-bold text-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-purple-600" />
              Razorpay Auto-Pay
            </span>
          </div>

          {/* Row 3: Safety Guardrail */}
          <div className="flex items-center justify-between p-3.5 text-xs">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
              <span className="text-muted-foreground font-medium">Safety Limit</span>
            </div>

            {isEditingCaps ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={perTxCapInput}
                  onChange={(e) => setPerTxCapInput(Number(e.target.value))}
                  className="w-20 rounded-lg border border-purple-300 bg-background px-2 py-0.5 text-xs font-bold text-foreground text-right"
                />
                <button
                  type="button"
                  onClick={handleSaveCaps}
                  className="px-2 py-0.5 rounded-md bg-purple-700 text-white font-bold text-[10px]"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingCaps(true)}
                className="font-bold text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1"
              >
                <span>{formatCurrency(perTxCap)} / fine</span>
                <Pencil className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Warning Banner */}
        {exceedsLimit && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300/80 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 text-xs">
            <Info className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Notice:</strong> Fine ({formatCurrency(fineAmount)}) exceeds your current limit ({formatCurrency(perTxCap)}). Click <strong>Safety Limit</strong> row above to adjust limit.
            </p>
          </div>
        )}

        {/* AI Safety Guarantee Note */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium text-center">
          <Bot className="size-4 text-purple-600 shrink-0" />
          <span>AI is strictly blocked from auto-executing payments without your click.</span>
        </div>

        {/*  APPLE-PAY STYLE BLACK / DEEP-PURPLE CTA BUTTON */}
        <div className="space-y-2">
          <Button
            onClick={handleApproveAndPay}
            isLoading={isApproving || isLoadingPolicy}
            data-testid="autopay-approve-and-pay-btn"
            className="w-full justify-center gap-2 rounded-2xl bg-foreground text-background hover:bg-foreground/90 py-4 text-base font-black shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
          >
            <span>Pay {formatCurrency(fineAmount)} with Razorpay</span>
            <ArrowRight className="size-4" />
          </Button>

          <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground font-medium">
            <Lock className="size-3 text-emerald-600" />
            <span>Nothing will be charged until you approve. Verified SSL Gateway.</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
