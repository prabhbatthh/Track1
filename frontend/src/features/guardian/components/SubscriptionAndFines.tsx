import { ChevronDown, DollarSign, History, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuth, type GuardianChild } from '@/providers/AuthProvider';

import { ChildPaymentHistoryModal } from './ChildPaymentHistoryModal';
import { GuardianAutopayApprovalModal } from './GuardianAutopayApprovalModal';

export interface SubscriptionAndFinesProps {
  children: GuardianChild[];
  onChanged: () => void;
}

export function SubscriptionAndFines({ children, onChanged }: SubscriptionAndFinesProps) {
  const { t } = useTranslation();
  const { payChildFines, renewChildSubscription } = useAuth();
  const [fineDetailsChildId, setFineDetailsChildId] = useState<string | null>(null);
  const [historyChildId, setHistoryChildId] = useState<string | null>(null);
  const [autopayChild, setAutopayChild] = useState<GuardianChild | null>(null);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [openDropdownChildId, setOpenDropdownChildId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownChildId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fineDetailsChild = children.find((child) => child.id === fineDetailsChildId) ?? null;
  const historyChild = children.find((child) => child.id === historyChildId) ?? null;

  async function payFine(child: GuardianChild) {
    setOpenDropdownChildId(null);
    setPendingChildId(child.id);
    try {
      await payChildFines(child.id);
      toast.success(
        t('guardian.subscription.finePaymentSuccess', {
          name: child.full_name,
        }),
      );
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('guardian.subscription.finePaymentFailed')));
    } finally {
      setPendingChildId(null);
    }
  }

  async function renewChild(child: GuardianChild) {
    setPendingChildId(child.id);
    try {
      await renewChildSubscription(child.id);
      toast.success(
        t('guardian.subscription.renewalSuccess', {
          name: child.full_name,
        }),
      );
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('guardian.subscription.renewalFailed')));
    } finally {
      setPendingChildId(null);
    }
  }

  return (
    <Card className="rounded-2xl border border-border/80 shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">{t('guardian.subscription.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        {children.length === 0 && (
          <EmptyState
            title={t('guardian.subscription.emptyTitle')}
            description={t('guardian.subscription.emptyDescription')}
          />
        )}
        {children.map((child) => {
          const hasFine = child.outstanding_fine > 0;
          const isPending = pendingChildId === child.id;
          const isDropdownOpen = openDropdownChildId === child.id;

          return (
            <div
              key={child.id}
              className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-purple-300/50 dark:hover:border-purple-800/50"
            >
              {/* Header Row: Child Name & History */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base text-foreground">{child.full_name}</span>
                  {hasFine && (
                    <button
                      type="button"
                      onClick={() => setFineDetailsChildId(child.id)}
                      className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      (View fine details)
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryChildId(child.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-300 hover:underline shrink-0"
                >
                  <History className="size-3.5" />
                  {t('guardian.subscription.viewPaymentHistory')}
                </button>
              </div>

              {/* Main Content Row: Info on Left, Clean 2 Buttons on Right */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {child.subscription_expires_on
                      ? t('guardian.subscription.expiresOn', {
                          date: formatDate(child.subscription_expires_on),
                        })
                      : t('guardian.subscription.noSubscription')}
                  </p>
                  <p className={`text-xs font-bold mt-0.5 ${hasFine ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {hasFine
                      ? `Fine owed: ${formatCurrency(child.outstanding_fine)}`
                      : 'No outstanding fine'}
                  </p>
                </div>

                {/* Right side: Exactly 2 Action Buttons */}
                <div className="flex items-center gap-2 relative">
                  {hasFine && (
                    <div className="relative" ref={isDropdownOpen ? dropdownRef : undefined}>
                      {/* Settle Fine Dropdown Trigger */}
                      <Button
                        size="sm"
                        className="whitespace-nowrap rounded-xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 text-white font-bold shadow-md hover:shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all gap-1.5 px-3.5 py-1.5 text-xs ring-2 ring-purple-500/30 dark:ring-purple-400/20"
                        onClick={() => setOpenDropdownChildId(isDropdownOpen ? null : child.id)}
                      >
                        <Sparkles className="size-3.5 text-amber-300 animate-pulse" />
                        <span>Settle Fine ({formatCurrency(child.outstanding_fine)})</span>
                        <ChevronDown className={`size-3.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </Button>

                      {/* Dropdown Menu */}
                      {isDropdownOpen && (
                        <div className="absolute right-0 mt-1.5 w-64 z-30 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 bg-popover/95 backdrop-blur-md p-2 shadow-2xl text-xs space-y-1.5 animate-in fade-in-50 zoom-in-95">
                          {/* Eye-Catching Animated Auto-Pay Option */}
                          <button
                            type="button"
                            onClick={() => {
                              setOpenDropdownChildId(null);
                              setAutopayChild(child);
                            }}
                            className="relative w-full flex items-start gap-2.5 rounded-xl p-2.5 text-left bg-gradient-to-r from-purple-600/10 via-indigo-600/15 to-purple-600/10 hover:from-purple-600/20 hover:via-indigo-600/25 hover:to-purple-600/20 dark:from-purple-950/70 dark:via-indigo-950/80 dark:to-purple-950/70 border border-purple-400/60 dark:border-purple-700/70 shadow-xs transition-all duration-200 group overflow-hidden"
                          >
                            {/* Ambient shimmer background layer */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

                            <div className="relative size-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm group-hover:scale-110 transition-transform">
                              <Sparkles className="size-4 text-purple-200 animate-pulse" />
                              <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full size-2.5 bg-amber-400"></span>
                              </span>
                            </div>

                            <div className="flex-1 space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-extrabold text-purple-950 dark:text-purple-100 group-hover:text-purple-700 dark:group-hover:text-purple-300">
                                  ⚡ Auto-Pay Fine
                                </span>
                                <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-1.5 py-0.2 text-[9px] font-black uppercase text-amber-800 dark:text-amber-300 tracking-wider shrink-0">
                                  ONLINE
                                </span>
                              </div>
                              <span className="text-[10px] text-purple-900/80 dark:text-purple-200/80 font-semibold block">
                                Review & approve policy limits
                              </span>
                            </div>
                          </button>

                          <div className="border-t border-border/60 my-1" />

                          {/* Tasteful Cash Payment Option */}
                          <button
                            type="button"
                            onClick={() => payFine(child)}
                            className="w-full flex items-start gap-2.5 rounded-xl p-2 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 border border-transparent hover:border-emerald-200/80 dark:hover:border-emerald-800/50 transition-all duration-200 group/cash"
                          >
                            <div className="size-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5 group-hover/cash:scale-110 transition-transform">
                              <DollarSign className="size-3.5 group-hover/cash:rotate-6 transition-transform" />
                            </div>
                            <div>
                              <span className="font-bold text-foreground group-hover/cash:text-emerald-700 dark:group-hover/cash:text-emerald-300 block transition-colors">
                                Request Cash Payment
                              </span>
                              <span className="text-[10px] text-muted-foreground font-medium block">
                                Pay in cash at the library desk
                              </span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant={hasFine ? 'outline' : 'primary'}
                    isLoading={isPending}
                    onClick={() => renewChild(child)}
                    className="whitespace-nowrap rounded-xl text-xs px-3.5 py-1.5 font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-xs hover:border-purple-400 dark:hover:border-purple-600"
                  >
                    {t('guardian.subscription.requestRenewal', 'Request renewal')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>

      <Modal
        open={fineDetailsChild !== null}
        onClose={() => setFineDetailsChildId(null)}
        title={
          fineDetailsChild
            ? `${t('guardian.subscription.fineDetails.title')} — ${fineDetailsChild.full_name}`
            : t('guardian.subscription.fineDetails.title')
        }
      >
        {fineDetailsChild && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t('guardian.subscription.fineDetails.reason')}</span>
              <span className="text-right font-medium text-foreground">
                {fineDetailsChild.fine_book_title
                  ? t('guardian.subscription.fineDetails.reasons.lateReturn')
                  : '—'}
                {fineDetailsChild.fine_book_title ? ` — ${fineDetailsChild.fine_book_title}` : ''}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t('guardian.subscription.fineDetails.amountDue')}</span>
              <span className="font-semibold text-danger">
                {formatCurrency(fineDetailsChild.outstanding_fine)}
              </span>
            </div>
            {fineDetailsChild.fine_due_date && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('guardian.subscription.fineDetails.payBy')}</span>
                <span className="font-medium text-foreground">
                  {formatDate(fineDetailsChild.fine_due_date)}
                </span>
              </div>
            )}
            <Button
              size="sm"
              isLoading={pendingChildId === fineDetailsChild.id}
              onClick={() => payFine(fineDetailsChild)}
            >
              {t('guardian.subscription.payFine')}
            </Button>
          </div>
        )}
      </Modal>

      <ChildPaymentHistoryModal
        childId={historyChildId}
        childName={historyChild?.full_name ?? ''}
        onClose={() => setHistoryChildId(null)}
      />

      <GuardianAutopayApprovalModal
        child={autopayChild}
        onClose={() => setAutopayChild(null)}
        onSuccess={() => {
          onChanged();
          setAutopayChild(null);
        }}
      />
    </Card>
  );
}
