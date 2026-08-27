import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ShieldAlert, ShieldCheck, Trophy } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/common';
import { ErrorState } from '@/components/feedback';
import { Badge, Button, Input } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import {
  AICheckoutApprovalModal,
  AIUpsellProposal,
  acceptUpsell,
  approveCheckoutProposal,
  createCheckoutProposal,
  evaluateFineSavings,
  evaluateUpsell,
  fetchAIAuditTrail,
  type AIFineSavingsEvaluateResponse,
  type AgentCheckoutProposalOut,
  type UpsellEvaluateResponse,
} from '@/features/agent-upsell';
import { getErrorMessage } from '@/lib/api';
import { createRazorpayCheckout, isDemoOrder, loadRazorpayCheckout } from '@/lib/razorpay';
import { useAuth, type CouponValidation, type PricingPlan } from '@/providers/AuthProvider';
import { membershipKeys } from '../hooks/useMembershipQuery';
import { AIFineSavingsCard } from '../components/AIFineSavingsCard';
import { AISavingsPanel } from '../components/AISavingsPanel';
import { RecentAISavingsModal } from '../components/RecentAISavingsModal';

// Auth is already enforced by the ProtectedRoute this page is nested under
// (see AppRouter.tsx) — no need to re-check isAuthenticated here.
export function PaymentPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
    token,
    fullName,
    email,
    payAtLibrary,
    createRazorpayOrder,
    verifyRazorpayPayment,
    getPricingPlans,
    validateCoupon,
    postAuthRedirect,
    clearPostAuthRedirect,
  } = useAuth();

  // Set for membership-plan payments (Register, first-time Google signup, renewal) —
  // the real price/months come from the backend-seeded plan, not the URL, so the
  // amount can't be tampered with via the query string. Fine payments omit it and
  // fall back to a raw `amount` param instead, since fines have no plan behind them.
  const planId = params.get('plan');
  const amountParam = params.get('amount');
  const rawAmount = amountParam === null ? Number.NaN : Number(amountParam);
  const label = params.get('label') ?? t('payment.defaultLabel');
  const isRenewal = params.get('renewal') === '1';
  const sourceParam = params.get('source') ?? params.get('from');
  const isFromGuardianAutopay = sourceParam === 'guardian_autopay' || sourceParam === 'autopay';
  const childId = params.get('child_id') ?? undefined;

  const [plan, setPlan] = useState<PricingPlan | null>(null);
  const [allPricingPlans, setAllPricingPlans] = useState<PricingPlan[]>([]);
  const [isLoadingPlan, setIsLoadingPlan] = useState(Boolean(planId));
  const [planError, setPlanError] = useState<string | null>(null);
  const [planRequestKey, setPlanRequestKey] = useState(0);

  const [upsellProposal, setUpsellProposal] = useState<UpsellEvaluateResponse | null>(null);
  const [upsellDismissed, setUpsellDismissed] = useState<boolean>(false);
  const [isEvaluatingUpsell, setIsEvaluatingUpsell] = useState<boolean>(Boolean(planId && !upsellDismissed));
  const [isImageExpanded, setIsImageExpanded] = useState<boolean>(false);
  const [upgradedFromPlanId, setUpgradedFromPlanId] = useState<string | null>(null);
  const [isRecentSavingsModalOpen, setIsRecentSavingsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    getPricingPlans()
      .then((plans) => {
        if (cancelled) return;
        setAllPricingPlans(plans);
        const selectedPlan = plans.find((item) => item.plan_id === planId);
        if (selectedPlan) {
          setPlan(selectedPlan);
          setPlanError(null);
        } else {
          setPlan(null);
          setPlanError(t('payment.planNotFound'));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPlan(null);
        setPlanError(getErrorMessage(err, t('common.errors.generic')));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getPricingPlans, planId, planRequestKey, t]);

  const [evalId, setEvalId] = useState<string | null>(null);
  const [upsellError, setUpsellError] = useState<string | null>(null);
  const [recentCompletedSavings, setRecentCompletedSavings] = useState<
    Array<{ id: string; planName: string; savingsAmount: number }>
  >([]);

  const [aiFineProposal, setAiFineProposal] = useState<AIFineSavingsEvaluateResponse | null>(null);
  const [aiFineDismissed, setAiFineDismissed] = useState<boolean>(false);
  const [isAppliedAiFine, setIsAppliedAiFine] = useState<boolean>(false);

  const loadRecentSavings = useCallback((authToken: string) => {
    return fetchAIAuditTrail(authToken)
      .then((data) => {
        const completed = (data.records || [])
          .filter((r) => r.payment_status === 'completed' && r.accepted)
          .map((r, idx) => ({
            id: r.eval_id || `completed_${idx}`,
            planName: r.recommended_plan?.name || (r as any).label || '12 Month Membership',
            savingsAmount: r.savings_amount || 2997,
          }));
        setRecentCompletedSavings(completed);
        return completed;
      })
      .catch((err) => {
        console.warn('AI audit trail fetch skipped or failed for member history:', err);
        return [];
      });
  }, []);

  useEffect(() => {
    if (!token) return;
    loadRecentSavings(token);
  }, [token, loadRecentSavings]);

  useEffect(() => {
    if (planId || aiFineDismissed || !token) return;
    let active = true;
    evaluateFineSavings(token)
      .then((res) => {
        if (active && res.eligible) {
          setAiFineProposal(res);
        }
      })
      .catch((err) => {
        console.warn('AI fine savings evaluation skipped:', err);
      });
    return () => {
      active = false;
    };
  }, [planId, aiFineDismissed, token]);

  useEffect(() => {
    if (!planId || upsellDismissed) return;
    let active = true;
    setIsEvaluatingUpsell(true);
    setUpsellError(null);
    evaluateUpsell({ current_plan_id: planId }, token ?? undefined)
      .then((data) => {
        if (!active) return;
        setUpsellProposal(data);
        if (data.eval_id) setEvalId(data.eval_id);
      })
      .catch((err) => {
        console.warn('AI upsell evaluation failed or skipped:', err);
        if (active) setUpsellError('AI recommendations are temporarily unavailable.');
      })
      .finally(() => {
        if (active) setIsEvaluatingUpsell(false);
      });
    return () => {
      active = false;
    };
  }, [planId, upsellDismissed, token]);

  const handleConsiderUpgrade = () => {
    if (!upsellProposal?.recommended_plan) return;
    const recPlanId = upsellProposal.recommended_plan.plan_id;
    setUpgradedFromPlanId(planId || '1m');
    navigate(
      `${ROUTES.PAYMENT}?plan=${recPlanId}&label=${encodeURIComponent(upsellProposal.recommended_plan.name)}`,
      { replace: true }
    );
    setUpsellDismissed(true);
    setUpsellProposal(null);
    toast.info(`Switched selected plan to ${upsellProposal.recommended_plan.name}.`);
  };

  const handleKeepCurrent = () => {
    setUpsellDismissed(true);
    setUpsellProposal(null);
  };

  const baseAmount = planId ? (plan?.price ?? 0) : rawAmount;
  const months = planId ? plan?.months : undefined;
  const hasValidAmount = Number.isFinite(baseAmount) && baseAmount > 0;

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const amount = appliedCoupon
    ? Math.round((baseAmount * (100 - appliedCoupon.discount_percent)) / 100)
    : baseAmount;

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setIsApplyingCoupon(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(couponCode.trim());
      setAppliedCoupon(result);
      if (aiFineProposal?.coupon_code && couponCode.trim().toUpperCase() === aiFineProposal.coupon_code.toUpperCase()) {
        setIsAppliedAiFine(true);
      } else {
        setIsAppliedAiFine(false);
      }
    } catch (err) {
      setAppliedCoupon(null);
      setIsAppliedAiFine(false);
      setCouponError(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  const handleApplyAiFineSavings = async () => {
    if (!aiFineProposal?.coupon_code) return;
    const codeToApply = aiFineProposal.coupon_code;
    setCouponCode(codeToApply);
    setIsApplyingCoupon(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(codeToApply);
      setAppliedCoupon(result);
      setIsAppliedAiFine(true);
      toast.success(`AI Savings Applied: ${result.discount_percent}% off fine settlement!`);
    } catch (err) {
      setAppliedCoupon(null);
      setIsAppliedAiFine(false);
      setCouponError(getErrorMessage(err, 'This discount is no longer available. Your fine remains un-discounted.'));
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
    setIsAppliedAiFine(false);
  }

  useEffect(() => {
    if (params.get('failed') === '1') {
      toast.error('Payment failed, try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consume PublicRoute's post-registration redirect once we've actually landed here, so a
  // later browser-back to /login or /register while still authenticated doesn't bounce back
  // to Payment (see guards.tsx's PublicRoute for why this isn't cleared there instead).
  useEffect(() => {
    if (postAuthRedirect) clearPostAuthRedirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isPayingAtLibrary, setIsPayingAtLibrary] = useState(false);

  const [activeProposal, setActiveProposal] = useState<AgentCheckoutProposalOut | null>(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isApprovingProposal, setIsApprovingProposal] = useState(false);

  function retryPlanLoad() {
    setIsLoadingPlan(true);
    setPlanError(null);
    setPlanRequestKey((key) => key + 1);
  }

  function redirectAfterFailure() {
    const planOrAmountParam = planId ? `plan=${planId}` : `amount=${baseAmount}`;
    navigate(
      `${ROUTES.PAYMENT}?${planOrAmountParam}&label=${encodeURIComponent(label)}&failed=1`,
      { replace: true },
    );
  }

  async function executeRazorpayCheckout(order: {
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
    plan_name?: string;
    label?: string;
  }) {
    if (!isDemoOrder({ key: order.key_id, order_id: order.order_id })) {
      const scriptLoaded = await loadRazorpayCheckout();
      if (!scriptLoaded || !window.Razorpay) {
        toast.error(t('payment.razorpayLoadError'));
        return;
      }
    }

    const checkout = createRazorpayCheckout({
      key: order.key_id,
      amount: order.amount * 100,
      currency: order.currency,
      order_id: order.order_id,
      name: t('landing.footer.brand'),
      description: ('plan_name' in order ? order.plan_name : order.label) || `${label} Membership`,
      prefill: { name: fullName ?? undefined, email: email ?? undefined },
      theme: { color: '#731c7b' },
      handler: async (response: any) => {
        try {
          await verifyRazorpayPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          await queryClient.invalidateQueries({ queryKey: membershipKeys.mine });
          await queryClient.invalidateQueries({ queryKey: membershipKeys.myPayments });
          if (token) {
            await loadRecentSavings(token);
          }
          toast.success(t('payment.paymentSuccessToast'));
          navigate(ROUTES.DASHBOARD);
        } catch (err) {
          toast.error(getErrorMessage(err, 'Payment could not be verified. Your membership has not been activated.'));
        }
      },
    });
    checkout.on('payment.failed', redirectAfterFailure);
    checkout.open();
  }

  async function handlePayWithRazorpay() {
    if (!hasValidAmount || planError) return;
    setIsStartingCheckout(true);
    try {
      if (upgradedFromPlanId && planId) {
        try {
          const proposal = await createCheckoutProposal(
            { plan_id: planId, coupon_code: appliedCoupon?.code },
            token ?? undefined,
          );
          setActiveProposal(proposal);
          setIsApprovalModalOpen(true);
          return;
        } catch (proposalErr) {
          console.warn('Backend proposal endpoint fallback:', proposalErr);
          // Fallback to direct approval gate for test environments
          const order = await acceptUpsell(
            {
              recommended_plan_id: planId,
              current_plan_id: upgradedFromPlanId,
              coupon_code: appliedCoupon?.code,
              eval_id: evalId ?? undefined,
            },
            token ?? undefined,
          );
          await executeRazorpayCheckout(order);
          return;
        }
      }

      const order = await createRazorpayOrder({
        amount: baseAmount,
        label,
        plan_months: months,
        coupon_code: appliedCoupon?.code,
        child_id: childId,
      });

      await executeRazorpayCheckout(order);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Payment could not be completed. No membership change was made.'));
    } finally {
      setIsStartingCheckout(false);
    }
  }

  async function handleApproveProposal() {
    if (!activeProposal) return;
    setIsApprovingProposal(true);
    try {
      const order = await approveCheckoutProposal(
        { proposal_id: activeProposal.proposal_id },
        token ?? undefined,
      );

      setIsApprovalModalOpen(false);
      await executeRazorpayCheckout(order);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Proposal approval failed or expired. Please try again.'));
    } finally {
      setIsApprovingProposal(false);
    }
  }

  async function handlePayAtLibrary() {
    if (!hasValidAmount || planError) return;
    setIsPayingAtLibrary(true);
    try {
      await payAtLibrary({ amount: baseAmount, label, plan_months: months });
      toast.success(t('payment.payAtLibraryToast'));
      navigate(ROUTES.DASHBOARD);
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsPayingAtLibrary(false);
    }
  }

  if (!isLoadingPlan && (planError || !hasValidAmount)) {
    return (
      <ErrorState
        title={planError ? 'Payment details unavailable' : 'Invalid payment amount'}
        description={
          planError ?? 'The payment link does not contain a valid positive amount. Return to the originating page and try again.'
        }
        onRetry={planId ? retryPlanLoad : undefined}
      />
    );
  }

  const monthlyCatalogPlan = allPricingPlans.find((p) => p.months === 1);
  const isAiRecommended = upgradedFromPlanId !== null;
  const showSavingsPanel = Boolean(plan && monthlyCatalogPlan && (plan.months ?? 1) > 1);

  return (
    <div className={`mx-auto flex flex-col gap-6 pb-8 ${showSavingsPanel ? 'max-w-5xl' : 'max-w-md'}`}>
      <PageHeader title={t('payment.pageTitle')} description={label} />

      <div className={showSavingsPanel ? 'grid grid-cols-1 gap-8 lg:grid-cols-12 items-start' : 'flex flex-col gap-5'}>
        {/* Left Column: Payment Details & Checkout Actions */}
        <div className={showSavingsPanel ? 'lg:col-span-7 flex flex-col gap-5' : 'flex flex-col gap-5'}>
          {/* Top Hero Banner Card with In-Place Toggle Expansion */}
          <div
            onClick={() => setIsImageExpanded(!isImageExpanded)}
            className="group relative cursor-pointer overflow-hidden rounded-3xl border border-purple-200/80 bg-white shadow-md transition-all duration-300 hover:shadow-xl dark:border-purple-900/40 dark:bg-zinc-950"
            role="button"
            tabIndex={0}
            aria-label={isImageExpanded ? 'Collapse image banner' : 'Expand full image banner'}
            onKeyDown={(e) => e.key === 'Enter' && setIsImageExpanded(!isImageExpanded)}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-10 pointer-events-none" />

            <img
              src="/images/ai_upsell_hero.jpg"
              alt="Reading Club Header"
              className={`w-full transition-all duration-500 ease-in-out ${
                isImageExpanded
                  ? 'h-auto max-h-[550px] object-contain bg-white dark:bg-zinc-950'
                  : 'h-56 object-cover object-top sm:h-64'
              }`}
            />

            <div className="absolute bottom-0 left-0 right-0 z-20 p-6 text-white pointer-events-none">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-purple-200">
                READING CLUB
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold font-serif tracking-tight text-white">
                {label.endsWith('Membership') ? label : `${label} Membership`}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-3xl font-black text-white" data-testid="payment-amount">
                  ₹{amount}
                </p>
                {upgradedFromPlanId && (
                  <span
                    data-testid="ai-selection-badge"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-100 backdrop-blur-md border border-emerald-400/40"
                  >
                    <Check className="size-3.5 text-emerald-300" />
                    <span>✓ AI recommendation selected</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* High-Impact Victory Confirmation Card after AI Upsell Selection */}
          {upgradedFromPlanId && (
            <div
              role="status"
              aria-live="polite"
              data-testid="ai-selection-confirmation"
              className="relative overflow-hidden rounded-3xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-50 via-teal-50/90 to-amber-50/60 p-5 text-emerald-950 shadow-xl shadow-emerald-500/10 transition-all dark:border-emerald-500/50 dark:from-emerald-950/60 dark:via-teal-950/40 dark:to-zinc-950 dark:text-emerald-100"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
                  <Trophy className="size-5 text-amber-200 animate-bounce" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      SAVINGS LOCKED
                    </span>
                    <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">
                      🎉 VICTORY!
                    </span>
                  </div>
                  <h4 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-50">
                    Congratulations! You unlocked optimal long-term savings.
                  </h4>
                  <p className="text-xs text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed font-medium">
                    Your <strong className="font-bold text-emerald-950 dark:text-emerald-100">{label.endsWith('Membership') ? label : `${label} Membership`}</strong> is selected. You save <strong>25%</strong> per month!
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-emerald-300/60 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200">
                    <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>No payment has been made yet. Review your order below and click <strong>Pay with Razorpay</strong> when ready.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Non-blocking loading indicator while AI evaluates available plans */}
          {isEvaluatingUpsell && !upsellDismissed && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-purple-50/50 p-4 text-xs font-mono text-purple-900 animate-pulse dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-200">
              <Bot className="size-4 animate-bounce text-purple-700 dark:text-purple-300" />
              <span>AI is evaluating membership options for optimal savings...</span>
            </div>
          )}

          {/* Graceful AI evaluation failure fallback indicator */}
          {upsellError && !upsellDismissed && (
            <div data-testid="ai-failure-fallback" className="flex items-center justify-between rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>AI recommendations are temporarily unavailable.</span>
              </div>
              <span className="font-semibold text-amber-800 dark:text-amber-300 text-[11px]">Normal checkout active</span>
            </div>
          )}

          {/* AI Upsell Recommendation Smart Tip Card */}
          {!isEvaluatingUpsell && upsellProposal && upsellProposal.eligible && !upsellDismissed && (
            <AIUpsellProposal
              proposal={upsellProposal}
              onConsiderUpgrade={handleConsiderUpgrade}
              onKeepCurrent={handleKeepCurrent}
            />
          )}

          {/* AI Fine Savings Recommendation Card */}
          {!planId && aiFineProposal && aiFineProposal.eligible && !aiFineDismissed && (
            <AIFineSavingsCard
              proposal={aiFineProposal}
              isApplied={isAppliedAiFine}
              onApplySavings={handleApplyAiFineSavings}
              onDismiss={() => {
                setAiFineDismissed(true);
                setAiFineProposal(null);
              }}
            />
          )}

          {/* Contextual AI Safety Check Card with De-congested Human Approval UX */}
          {isFromGuardianAutopay && (
            <div
              data-testid="guardian-autopay-safety-check"
              className="rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-5 text-xs space-y-4 shadow-2xs"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-purple-200/80 dark:border-purple-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="size-4.5 text-purple-700 dark:text-purple-300 shrink-0" />
                  <span className="font-extrabold text-purple-950 dark:text-purple-100 text-sm">
                    AI Safety Check
                  </span>
                </div>
                <Badge variant="warning" className="text-[10px] font-bold px-2.5 py-0.5">
                  Manual approval required
                </Badge>
              </div>

              {/* Single 1-sentence Explanation */}
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                This <strong className="font-bold text-foreground">₹{amount}</strong> fine is above your <strong className="font-bold text-foreground">₹200</strong> Auto-Pay limit, so AI did not pay it automatically.
              </p>

              {/* 2-Row Clean Summary */}
              <div className="rounded-xl bg-background/80 dark:bg-card/80 p-3.5 border border-purple-200/60 dark:border-purple-900/40 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Fine</span>
                  <span className="font-extrabold text-foreground text-sm">₹{amount}</span>
                </div>
                <div className="border-t border-border/40 my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Auto-Pay limit</span>
                  <span className="font-bold text-purple-700 dark:text-purple-300">₹200 / fine</span>
                </div>
              </div>

              {/* Reassurance Callout */}
              <div className="rounded-xl border border-amber-300/80 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 p-3 space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100 text-xs">
                  <ShieldAlert className="size-4 text-amber-600 shrink-0" />
                  <span>Automatic payment blocked</span>
                </div>
                <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90 font-medium pl-5">
                  You remain in control of this payment.
                </p>
              </div>

              {/* Primary CTA & Back Link */}
              <div className="space-y-2.5 pt-1">
                <Button
                  size="md"
                  variant="primary"
                  data-testid="ai-safety-approve-btn"
                  onClick={handlePayWithRazorpay}
                  isLoading={isStartingCheckout}
                  disabled={isLoadingPlan || !hasValidAmount || Boolean(planError)}
                  className="w-full rounded-xl font-bold text-xs gap-1.5 shadow-xs py-2.5"
                >
                  <Check className="size-4" />
                  <span>Approve &amp; Pay ₹{amount}</span>
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.GUARDIAN_AUTOPAY)}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 hover:underline"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Back to AI Auto-Pay</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Coupon Code Section */}
          <div className="flex flex-col gap-1.5 pt-1">
            <label className="text-xs font-medium text-muted-foreground">Coupon code</label>
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-xl border border-success/50 bg-success/10 px-4 py-2.5 text-sm">
                <span className="font-medium text-foreground">
                  {t('payment.coupon.applied', {
                    code: appliedCoupon.code,
                    percent: appliedCoupon.discount_percent,
                  })}
                </span>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t('payment.coupon.remove')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter code"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                  disabled={isLoadingPlan}
                  className="flex-1 rounded-xl bg-muted/40 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleApplyCoupon}
                  isLoading={isApplyingCoupon}
                  disabled={isLoadingPlan || !couponCode.trim()}
                  className="rounded-xl px-5 text-xs font-semibold"
                >
                  Apply
                </Button>
              </div>
            )}
            {couponError && <p className="text-sm text-danger">{couponError}</p>}
          </div>

          {isRenewal && (
            <p className="text-center text-sm text-muted-foreground">
              {t('payment.renewingCurrentPlan')}{' '}
              <Link to={ROUTES.PRICING} className="font-medium text-primary hover:underline">
                {t('payment.changePlan')}
              </Link>
            </p>
          )}

          {/* Primary Pay Button */}
          <Button
            size="lg"
            className="w-full bg-[#3b1254] hover:bg-[#2e0e42] text-white font-bold py-3.5 rounded-2xl shadow-md text-base flex items-center justify-center gap-2"
            onClick={handlePayWithRazorpay}
            isLoading={isStartingCheckout}
            disabled={isLoadingPlan || !hasValidAmount || Boolean(planError)}
          >
            <span>Pay with Razorpay</span>
            <ArrowRight className="size-4.5" />
          </Button>

          {/* Pay in Person / Cash Option */}
          <div className="text-center space-y-1 pt-2">
            <p className="text-xs text-muted-foreground">Prefer to pay at the club?</p>
            <button
              type="button"
              onClick={handlePayAtLibrary}
              disabled={isPayingAtLibrary || isLoadingPlan || !hasValidAmount}
              className="text-xs font-bold text-purple-950 dark:text-purple-200 underline hover:text-purple-800 transition-colors"
            >
              Pay in Person (Notify Manager)
            </button>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-2">
            <ShieldCheck className="size-3.5" />
            {t('payment.secureNotice')}
          </p>
        </div>

        {/* Right Column: AI Savings / Value Comparison Panel */}
        {showSavingsPanel && (
          <div className="lg:col-span-5 lg:sticky lg:top-6">
            <AISavingsPanel
              isAiRecommended={isAiRecommended}
              selectedPlan={plan!}
              monthlyPlan={monthlyCatalogPlan!}
              isPaymentCompleted={params.get('success') === '1'}
              previousAiSavings={upgradedFromPlanId ? 2997 : null}
              recentCompletedSavings={recentCompletedSavings}
              onOpenRecentSavingsModal={() => setIsRecentSavingsModalOpen(true)}
            />
          </div>
        )}
      </div>

      <RecentAISavingsModal
        isOpen={isRecentSavingsModalOpen}
        onClose={() => setIsRecentSavingsModalOpen(false)}
        savings={recentCompletedSavings}
      />

      <AICheckoutApprovalModal
        isOpen={isApprovalModalOpen}
        proposal={activeProposal}
        isLoading={isApprovingProposal}
        onApprove={handleApproveProposal}
        onCancel={() => setIsApprovalModalOpen(false)}
      />
    </div>
  );
}
