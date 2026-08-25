import { Banknote, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AnimatedNumber, PageHeader } from '@/components/common';
import { ErrorState } from '@/components/feedback';
import { Badge, Button, Card, CardContent, Input, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { loadRazorpayCheckout } from '@/lib/razorpay';
import { useAuth, type CouponValidation, type PricingPlan } from '@/providers/AuthProvider';

// Auth is already enforced by the ProtectedRoute this page is nested under
// (see AppRouter.tsx) — no need to re-check isAuthenticated here.
export function PaymentPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
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

  const [plan, setPlan] = useState<PricingPlan | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(Boolean(planId));
  const [planError, setPlanError] = useState<string | null>(null);
  const [planRequestKey, setPlanRequestKey] = useState(0);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    getPricingPlans()
      .then((plans) => {
        if (cancelled) return;
        const selectedPlan = plans.find((item) => item.plan_id === planId);
        setPlan(selectedPlan ?? null);
        if (!selectedPlan) setPlanError('This membership plan is unavailable.');
      })
      .catch((error) => {
        if (!cancelled) setPlanError(getErrorMessage(error, t('common.errors.generic')));
      })
      .finally(() => !cancelled && setIsLoadingPlan(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, planRequestKey]);

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
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
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

  async function handlePayWithRazorpay() {
    if (!hasValidAmount || planError) return;
    setIsStartingCheckout(true);
    try {
      const scriptLoaded = await loadRazorpayCheckout();
      if (!scriptLoaded || !window.Razorpay) {
        toast.error(t('payment.razorpayLoadError'));
        return;
      }

      // The base (pre-discount) amount is sent — the backend re-validates the coupon,
      // redeems it, and charges the discounted total, so it's never client-trusted.
      const order = await createRazorpayOrder({
        amount: baseAmount,
        label,
        plan_months: months,
        coupon_code: appliedCoupon?.code,
      });

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount * 100,
        currency: order.currency,
        order_id: order.order_id,
        name: t('landing.footer.brand'),
        description: order.label,
        prefill: { name: fullName ?? undefined, email: email ?? undefined },
        theme: { color: '#731c7b' },
        handler: async (response) => {
          try {
            await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success(t('payment.paymentSuccessToast'));
            navigate(ROUTES.DASHBOARD);
          } catch (err) {
            toast.error(getErrorMessage(err, t('common.errors.generic')));
          }
        },
      });
      checkout.on('payment.failed', redirectAfterFailure);
      checkout.open();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsStartingCheckout(false);
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

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <PageHeader title={t('payment.pageTitle')} description={label} />

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8">
          <p className="text-sm text-muted-foreground">{t('payment.amountDue')}</p>
          {isLoadingPlan ? (
            <Loader />
          ) : (
            <div className="flex items-baseline gap-2">
              {appliedCoupon && (
                <span className="text-lg text-muted-foreground line-through">₹{baseAmount}</span>
              )}
              <span className="text-2xl font-semibold text-foreground">₹</span>
              <AnimatedNumber
                value={amount}
                className="text-4xl font-extrabold text-foreground"
                data-testid="payment-amount"
              />
            </div>
          )}
          <Badge variant="outline">{label}</Badge>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1.5">
        {appliedCoupon ? (
          <div className="flex items-center justify-between rounded-md border border-success/50 bg-success/10 px-3 py-2 text-sm">
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
              placeholder={t('payment.coupon.placeholder')}
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              disabled={isLoadingPlan}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleApplyCoupon}
              isLoading={isApplyingCoupon}
              disabled={isLoadingPlan || !couponCode.trim()}
            >
              {t('payment.coupon.apply')}
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

      <Button
        size="lg"
        className="w-full"
        onClick={handlePayWithRazorpay}
        isLoading={isStartingCheckout}
        disabled={isLoadingPlan || !hasValidAmount || Boolean(planError)}
      >
        {t('payment.payWithRazorpay')}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {t('auth.login.or')}
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Banknote className="size-4" />
            {t('payment.payAtLibraryTitle')}
          </p>
          <p className="text-sm text-muted-foreground">{t('payment.payAtLibraryDescription')}</p>
          {appliedCoupon && (
            <p className="text-xs text-muted-foreground">
              Coupons apply to online checkout only. Cash requests use the original amount of ₹{baseAmount}.
            </p>
          )}
          <Button
            variant="outline"
            onClick={handlePayAtLibrary}
            isLoading={isPayingAtLibrary}
            disabled={isLoadingPlan || !hasValidAmount || Boolean(planError)}
          >
            {t('payment.contactManager')}
          </Button>
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        {t('payment.secureNotice')}
      </p>
    </div>
  );
}
