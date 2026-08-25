import { Crown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ProgressBar } from '@/components/common';
import { Badge, Button, Card, CardContent, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/constants/routes';

export interface MemberSubscriptionProps {
  className?: string;
  planLabel: string;
  /** No active plan yet (first-time member) when omitted. */
  expiresOn?: string;
  /** Raw ISO dates, used only to compute the elapsed-time progress bar. */
  purchasedAtIso?: string;
  expiresAtIso?: string;
  isActive?: boolean;
  outstandingFine: string;
  fineReasonKey?: string;
  fineBookTitle?: string;
  fineDueDate?: string;
  fineDailyPenalty?: string;
  fineEscalatedAmount?: string;
}

function elapsedPercent(purchasedAtIso?: string, expiresAtIso?: string): number | null {
  if (!purchasedAtIso || !expiresAtIso) return null;
  const start = new Date(purchasedAtIso).getTime();
  const end = new Date(expiresAtIso).getTime();
  const total = end - start;
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, ((Date.now() - start) / total) * 100));
}

// Mirrors the guardian's SubscriptionAndFines card, but for the signed-in
// member's own plan. Renew goes straight to Payment for the existing plan
// (Payment offers a "Change Plan" link back to Pricing for anyone who wants
// a different one); with no active plan yet there's nothing to renew, so
// that case still goes to Pricing to pick a first plan.
export function MemberSubscription({
  className,
  planLabel,
  expiresOn,
  purchasedAtIso,
  expiresAtIso,
  isActive,
  outstandingFine,
  fineReasonKey,
  fineBookTitle,
  fineDueDate,
  fineDailyPenalty,
  fineEscalatedAmount,
}: MemberSubscriptionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showFineDetails, setShowFineDetails] = useState(false);
  const hasFine = outstandingFine !== '₹0';
  const percent = elapsedPercent(purchasedAtIso, expiresAtIso);

  function payFine() {
    const amount = Number(outstandingFine.replace(/[^\d.]/g, ''));
    navigate(
      `${ROUTES.PAYMENT}?amount=${amount}&label=${encodeURIComponent(t('dashboard.subscription.fineOwed', { amount: outstandingFine }))}`,
    );
  }

  function renewOrViewPlans() {
    if (!expiresOn) {
      navigate(ROUTES.PRICING);
      return;
    }
    const label = t('dashboard.subscription.renewalPaymentLabel', { plan: planLabel });
    // Renewal always renews at the 1-month plan/price, regardless of the member's
    // original plan length — same simplification as before, now sourced from the
    // backend plan by id instead of a hardcoded price constant.
    navigate(`${ROUTES.PAYMENT}?plan=1m&label=${encodeURIComponent(label)}&renewal=1`);
  }

  return (
    <Card className={cn('overflow-hidden border-none bg-ink text-ink-foreground', className)}>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-ink-muted">{t('dashboard.subscription.title')}</p>
          {expiresOn && (
            <Badge className="border border-white/10 bg-white/6 text-ink-foreground">
              {isActive
                ? t('dashboard.subscription.statusActive')
                : t('dashboard.subscription.statusInactive')}
            </Badge>
          )}
        </div>

        <div>
          <p className="text-2xl font-semibold">{planLabel}</p>
          <p className="text-sm text-ink-muted">
            {expiresOn
              ? t('dashboard.subscription.expiresOn', { date: expiresOn })
              : t('dashboard.subscription.noPlan')}
          </p>
        </div>

        {percent !== null && (
          <ProgressBar
            percent={percent}
            trackClassName="bg-white/10"
            fillClassName="bg-ink-foreground"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <p className="text-ink-muted">{t('dashboard.subscription.outstandingFine')}</p>
            <p className={hasFine ? 'font-semibold text-red-300' : 'font-semibold'}>
              {outstandingFine}
            </p>
            {hasFine && (
              <button
                type="button"
                onClick={() => setShowFineDetails(true)}
                className="text-xs font-medium text-ink-foreground underline underline-offset-2 hover:no-underline"
              >
                {t('dashboard.subscription.viewFineDetails')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {hasFine && (
              <Button
                size="sm"
                variant="outline"
                className="border-white/10 bg-white/6 text-ink-foreground hover:bg-white/10"
                onClick={payFine}
              >
                {t('dashboard.subscription.payFine')}
              </Button>
            )}
            <Button
              size="sm"
              className="bg-ink-foreground text-ink hover:bg-ink-foreground/90"
              leadingIcon={<Crown className="size-4" />}
              onClick={renewOrViewPlans}
            >
              {expiresOn ? t('dashboard.subscription.renew') : t('dashboard.subscription.viewPlans')}
            </Button>
          </div>
        </div>
      </CardContent>

      <Modal
        open={showFineDetails}
        onClose={() => setShowFineDetails(false)}
        title={t('dashboard.subscription.fineDetails.title')}
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('dashboard.subscription.fineDetails.reason')}</span>
            <span className="text-right font-medium text-foreground">
              {fineReasonKey ? t(`dashboard.subscription.fineDetails.reasons.${fineReasonKey}`) : '—'}
              {fineBookTitle ? ` — ${fineBookTitle}` : ''}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('dashboard.subscription.fineDetails.amountDue')}</span>
            <span className="font-semibold text-danger">{outstandingFine}</span>
          </div>
          {fineDueDate && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t('dashboard.subscription.fineDetails.payBy')}</span>
              <span className="font-medium text-foreground">{fineDueDate}</span>
            </div>
          )}
          {fineDailyPenalty && fineEscalatedAmount && (
            <div className="rounded-md bg-danger/10 p-3 text-danger">
              {t('dashboard.subscription.fineDetails.escalationNotice', {
                daily: fineDailyPenalty,
                escalated: fineEscalatedAmount,
              })}
            </div>
          )}
          <Button size="sm" onClick={payFine}>
            {t('dashboard.subscription.payFine')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
