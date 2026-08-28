import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  FileCheck,
  History,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { formatCurrency } from '@/lib/format';
import { useAuth, type GuardianChild } from '@/providers/AuthProvider';
import {
  getAutopayActivityHistory,
  getAutopayDemoLoans,
  getAutopayTrustStatus,
  type AutopayActivityItem,
  type AutopayAutonomousResponse,
  type AutopayTrustStatus,
} from '../api';

export interface SimulationResultSuccess {
  type: 'success';
  data: AutopayAutonomousResponse;
}

export interface SimulationResultBlocked {
  type: 'blocked';
  statusCode: number;
  amount: number;
  cap: number;
  reasonCode: string;
  detail: string;
}

export interface SimulationResultDuplicate {
  type: 'duplicate';
  message: string;
}

export type SimulationResult =
  | SimulationResultSuccess
  | SimulationResultBlocked
  | SimulationResultDuplicate;

const ITEMS_PER_PAGE = 5;

export function GuardianAutopaySimulator() {
  const navigate = useNavigate();
  const { getGuardianChildren } = useAuth();
  const [realChildren, setRealChildren] = useState<GuardianChild[]>([]);

  const [perTxCap, setPerTxCap] = useState<number>(200);
  const [monthlyCap, setMonthlyCap] = useState<number>(1000);
  const [childName, setChildName] = useState<string>('Diya Joshi');
  const [autoPayEnabled, setAutoPayEnabled] = useState<boolean>(true);

  // Trust Ladder state
  const [trustStatus, setTrustStatus] = useState<AutopayTrustStatus | null>(null);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [showTrustDetails, setShowTrustDetails] = useState<boolean>(false);

  const [activityItems, setActivityItems] = useState<AutopayActivityItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchActivityHistory = async () => {
    try {
      const res = await getAutopayActivityHistory();
      setActivityItems(res.items || []);
      setCurrentPage(1);
    } catch {
      setActivityItems([]);
    }
  };

  useEffect(() => {
    fetchActivityHistory();
  }, []);

  useEffect(() => {
    if (getGuardianChildren) {
      getGuardianChildren().then(setRealChildren).catch(() => setRealChildren([]));
    }
  }, [getGuardianChildren]);

  const totalOutstandingFine = useMemo(() => {
    if (realChildren.length > 0) {
      return realChildren.reduce((sum, c) => sum + (c.outstanding_fine || 0), 0);
    }
    return 0;
  }, [realChildren]);

  const childrenWithFinesCount = useMemo(() => {
    return realChildren.filter((c) => (c.outstanding_fine || 0) > 0).length;
  }, [realChildren]);

  async function fetchDemoLoansAndTrust() {
    try {
      const data = await getAutopayDemoLoans();
      setPerTxCap(data.per_transaction_cap || 200);
      setMonthlyCap(data.monthly_spending_cap || 1000);
      if (data.child_name) setChildName(data.child_name);
    } catch {
      setPerTxCap(200);
      setMonthlyCap(1000);
    }

    try {
      const trustData = await getAutopayTrustStatus();
      setTrustStatus(trustData);
      if (trustData.child_name) setChildName(trustData.child_name);
    } catch {
      setTrustStatus({
        child_id: 'child-123',
        child_name: 'Diya Joshi',
        trust_tier: 'BASELINE',
        on_time_return_rate: 80.0,
        on_time_returns: 12,
        total_returns: 15,
        sample_size: 15,
        multiplier: 1.0,
        guardian_per_transaction_cap: 200,
        theoretical_cap: 200,
        effective_transaction_cap: 200,
        reasoning: '12 of the last 15 returned books were on time (80%). Safe baseline limit applied based on borrowing track record.',
      });
    }
  }

  useEffect(() => {
    fetchDemoLoansAndTrust();
  }, []);

  async function handleToggleAutoPay() {
    const nextState = !autoPayEnabled;
    setAutoPayEnabled(nextState);
    toast.success(nextState ? 'Auto-Pay enabled' : 'Auto-Pay paused');
  }

  const effectiveCap = trustStatus?.effective_transaction_cap ?? perTxCap;
  const currentTier = trustStatus?.trust_tier ?? 'BASELINE';
  const multiplier = trustStatus?.multiplier ?? 1.0;

  const onTimeReturns = trustStatus?.on_time_returns ?? 0;
  const totalReturns = trustStatus?.sample_size ?? trustStatus?.total_returns ?? 0;
  const onTimeRate = trustStatus?.on_time_return_rate ?? (totalReturns > 0 ? Math.round((onTimeReturns / totalReturns) * 100) : 100);

  // Activity Pagination
  const totalPages = Math.max(1, Math.ceil(activityItems.length / ITEMS_PER_PAGE));
  const paginatedActivityItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return activityItems.slice(start, start + ITEMS_PER_PAGE);
  }, [activityItems, currentPage]);

  return (
    <Card className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden space-y-0">
      {/* ================================================================= */}
      {/* 1. PAGE HEADER & CHILD CONTEXT & MASTER TOGGLE */}
      {/* ================================================================= */}
      <CardHeader className="bg-gradient-to-r from-purple-950/10 via-indigo-950/10 to-purple-950/10 dark:from-purple-950/40 dark:via-indigo-950/50 dark:to-purple-950/40 border-b border-border/60 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shadow-xs">
                <Zap className="size-4 text-amber-300" />
              </div>
              <CardTitle className="text-xl font-extrabold text-foreground">
                AI Guardian Auto-Pay
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Let AI handle eligible fines automatically while keeping you in control.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-background/80 dark:bg-card/80 border border-border/80 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-2xs">
              <span className="text-muted-foreground">Linked Child:</span>
              <span className="font-bold text-foreground">{childName}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleAutoPay}
              className={`rounded-xl font-bold text-xs gap-1.5 ${
                autoPayEnabled
                  ? 'border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              <Zap className="size-3.5" />
              <span>{autoPayEnabled ? 'Pause Auto-Pay' : 'Enable Auto-Pay'}</span>
            </Button>

            <Badge
              variant={autoPayEnabled ? 'success' : 'warning'}
              className="font-extrabold text-[11px] px-2.5 py-1"
            >
              {autoPayEnabled ? 'AUTO-PAY ACTIVE' : 'AUTO-PAY PAUSED'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 flex flex-col gap-6">
        {/* ================================================================= */}
        {/* 2. GUARDIAN-FOCUSED "AI TRUST STATUS" CARD */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-purple-300/80 dark:border-purple-800/80 bg-gradient-to-br from-purple-50/60 via-background to-indigo-50/60 dark:from-purple-950/30 dark:via-background dark:to-indigo-950/30 p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-200/60 dark:border-purple-900/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles className="size-4 text-amber-300" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground tracking-tight">
                  AI Trust Status for {childName}
                </h3>
                <p className="text-[11px] text-muted-foreground font-medium">
                  Based on {childName}&apos;s recent return behavior
                </p>
              </div>
            </div>

            <Badge
              className={`font-black text-xs px-3 py-1 uppercase rounded-lg shadow-2xs ${
                currentTier === 'HIGH'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : currentTier === 'LOW'
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              {currentTier} TIER
            </Badge>
          </div>

          {/* Main Guardian Tier & Multiplier Display */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-background/90 dark:bg-card/90 p-4 rounded-xl border border-border/80 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-3xl font-black ${
                    currentTier === 'HIGH'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : currentTier === 'LOW'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-purple-700 dark:text-purple-300'
                  }`}
                >
                  {currentTier}
                </span>
                <span className="text-sm font-bold text-muted-foreground">
                  ({multiplier}× Trust Multiplier)
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {childName} currently qualifies for <span className="font-bold text-foreground">{currentTier}</span> trust based on recent return behavior.
              </p>
              <div className="text-[11px] font-semibold text-muted-foreground pt-0.5">
                {totalReturns > 0
                  ? `${onTimeReturns} / ${totalReturns} recent returns on time · ${onTimeRate}%`
                  : '1 / 1 recent returns on time · 100%'}
              </div>
            </div>

            <div className="text-right p-3 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 shrink-0 space-y-0.5">
              <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300 block">
                Auto-Pay limit: {formatCurrency(effectiveCap)} / fine
              </span>
              <span className="text-[10px] text-muted-foreground font-medium block">
                Server safety ceiling always applies.
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. OUTSTANDING FINES ACTION CARD */}
        {/* ================================================================= */}
        <div className="rounded-xl border border-purple-200/80 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-purple-950 dark:text-purple-200">
                Outstanding Fines
              </span>
              {totalOutstandingFine > 0 && (
                <Badge variant="warning" className="text-[10px] font-bold">
                  {childrenWithFinesCount > 0
                    ? `${childrenWithFinesCount} child fine${childrenWithFinesCount > 1 ? 's' : ''} require review`
                    : 'Action required'}
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">
                {formatCurrency(totalOutstandingFine)}
              </span>
              {totalOutstandingFine > 0 ? (
                <span className="text-xs font-medium text-muted-foreground">
                  Fines above your Auto-Pay limit (or pending approval) require your review and manual payment.
                </span>
              ) : (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  You&apos;re all caught up! No fines currently require payment.
                </span>
              )}
            </div>
          </div>

          {totalOutstandingFine > 0 ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const childWithFine = realChildren.find((c) => (c.outstanding_fine || 0) > 0);
                const targetChildId = childWithFine?.id ?? trustStatus?.child_id;
                const label = `Fine owed: ₹${totalOutstandingFine}`;
                const childParam = targetChildId ? `&child_id=${targetChildId}` : '';
                navigate(`${ROUTES.PAYMENT}?amount=${totalOutstandingFine}&label=${encodeURIComponent(label)}&source=guardian_autopay${childParam}`);
              }}
              className="rounded-xl font-bold text-xs gap-1.5 shadow-xs shrink-0"
            >
              <span>Review &amp; Pay Fines</span>
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold shrink-0">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>All Fines Settled</span>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 4. PRIMARY AUTO-PAY CONTROLS (SPENDING LIMIT CARDS) */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-2">
            <span className="text-xs font-semibold text-purple-900 dark:text-purple-300 block">
              Single Fine Limit
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-purple-950 dark:text-purple-100">
                {formatCurrency(effectiveCap)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">per fine</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium pt-1">
              AI can automatically pay fines up to {formatCurrency(effectiveCap)} per transaction.
            </p>
          </div>

          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-2">
            <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 block">
              Monthly Spending Limit
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-indigo-950 dark:text-indigo-100">
                {formatCurrency(monthlyCap)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">per month</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium pt-1">
              Maximum automatic payments this month: {formatCurrency(monthlyCap)}
            </p>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 4.5. WHY THIS LIMIT? EXPLANATION CALLOUT */}
        {/* ================================================================= */}
        <div className="rounded-xl bg-background/90 dark:bg-card/90 border border-indigo-200/80 dark:border-indigo-900/60 p-4 text-xs space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-indigo-950 dark:text-indigo-200">
            <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400" />
            <span>Why this limit?</span>
          </div>
          <p className="text-muted-foreground font-medium text-xs leading-relaxed pl-6">
            {trustStatus && trustStatus.sample_size === 0
              ? 'No completed return history yet. BASELINE (1.0x) is applied as the safe starting default (not a penalty).'
              : trustStatus?.reasoning || 'Safe baseline limit applied based on borrowing track record.'}
          </p>
        </div>

        {/* ================================================================= */}
        {/* 5. HOW AUTO-PAY PROTECTS YOU (RULES SUMMARY CARDS) */}
        {/* ================================================================= */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            How Auto-Pay Protects You
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CARD A: Within Limit */}
            <div className="rounded-xl border border-emerald-300/70 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Within your limit
                </span>
                <Badge variant="success" className="text-[10px] font-extrabold">
                  Fines up to {formatCurrency(effectiveCap)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                AI can settle them automatically without requiring manual approval or payment steps.
              </p>
            </div>

            {/* CARD B: Above Limit */}
            <div className="rounded-xl border border-amber-300/70 dark:border-amber-800/60 bg-amber-50/30 dark:bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Above your limit
                </span>
                <Badge variant="warning" className="text-[10px] font-extrabold">
                  Fines over {formatCurrency(effectiveCap)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                AI blocks the automatic payment and alerts you immediately for manual review.
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 6. RECENT AUTO-PAY ACTIVITY WITH PAGINATION */}
        {/* ================================================================= */}
        <div className="space-y-3 border-t border-border/60 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History className="size-4 text-purple-600 dark:text-purple-400" />
              Recent Auto-Pay Activity
            </h3>
            {result && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline"
              >
                <RotateCcw className="size-3" /> Clear Activity
              </button>
            )}
          </div>

          {activityItems.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-2.5">
                {paginatedActivityItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                      item.type === 'autonomous_paid'
                        ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : item.type === 'guardian_approved'
                        ? 'border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20'
                        : 'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {item.type === 'autonomous_paid' ? (
                        <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : item.type === 'guardian_approved' ? (
                        <UserCheck className="size-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-foreground">
                            {item.title}
                          </span>
                          {item.type === 'autonomous_paid' ? (
                            <Badge variant="success" className="text-[10px] font-bold">
                              {item.badge}
                            </Badge>
                          ) : item.type === 'guardian_approved' ? (
                            <Badge variant="info" className="text-[10px] font-bold">
                              {item.badge}
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] font-bold">
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground font-medium">
                          {item.child_name} · Fine payment
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 font-normal">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-extrabold text-sm text-foreground">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Compact Pagination Controls */}
              {activityItems.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                    className="h-8 px-3 rounded-lg text-xs font-semibold"
                  >
                    <ChevronLeft className="size-3.5 mr-1" />
                    Previous
                  </Button>
                  <span className="font-semibold text-muted-foreground">
                    Page <span className="font-bold text-foreground">{currentPage}</span> of{' '}
                    <span className="font-bold text-foreground">{totalPages}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-8 px-3 rounded-lg text-xs font-semibold"
                  >
                    Next
                    <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          ) : result ? (
            <div className="space-y-3">
              {result.type === 'success' && (
                <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 p-4 flex items-start gap-3">
                  <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-emerald-950 dark:text-emerald-100">
                        Fine automatically paid: {formatCurrency(result.data.amount)}
                      </span>
                      <Badge variant="success" className="text-[10px] font-bold">
                        Paid via Auto-Pay
                      </Badge>
                    </div>
                    <p className="text-muted-foreground font-medium">
                      Fine settled for {childName} within single fine limit of {formatCurrency(effectiveCap)}.
                    </p>
                  </div>
                </div>
              )}

              {result.type === 'blocked' && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                  <ShieldAlert className="size-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-amber-950 dark:text-amber-100">
                        Payment blocked: {formatCurrency(result.amount)} fine
                      </span>
                      <Badge variant="warning" className="text-[10px] font-bold">
                        Blocked &amp; Notified
                      </Badge>
                    </div>
                    <p className="text-muted-foreground font-medium">
                      Exceeds single fine limit of {formatCurrency(result.cap)}. Automatic payment blocked and alert sent to guardian.
                    </p>
                  </div>
                </div>
              )}

              {result.type === 'duplicate' && (
                <div className="rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/30 p-4 flex items-start gap-3">
                  <AlertCircle className="size-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <span className="font-extrabold text-blue-950 dark:text-blue-100">
                      Already Settled
                    </span>
                    <p className="text-muted-foreground font-medium">
                      {result.message}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 p-5 text-center text-xs space-y-1">
              <p className="font-bold text-foreground">No recent activity</p>
              <p className="text-muted-foreground font-medium">
                Auto-payments, approved payments, and blocked payments will appear here.
              </p>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 7. COLLAPSIBLE "HOW AI TRUST & SAFETY WORKS" */}
        {/* ================================================================= */}
        <div className="border-t border-border/60 pt-5">
          <button
            type="button"
            onClick={() => setShowTrustDetails(!showTrustDetails)}
            className="flex items-center justify-between w-full p-4 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-all text-left group"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-bold text-xs text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                How AI Trust &amp; Safety Works
              </span>
            </div>
            {showTrustDetails ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>

          {showTrustDetails && (
            <div className="mt-3 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 space-y-4 text-xs animate-in fade-in-50 duration-200">
              <div className="space-y-2">
                <h4 className="font-bold text-indigo-950 dark:text-indigo-200">
                  Trust Safety Principles
                </h4>
                <ul className="list-disc list-inside space-y-1.5 text-muted-foreground font-medium leading-relaxed">
                  <li>Children start with a safe BASELINE default limit when there is insufficient return history.</li>
                  <li>Responsible book return habits maintain or improve trust standing.</li>
                  <li>Your configured spending boundary remains the hard maximum limit.</li>
                  <li>AI cannot exceed allowed spending limits; payments outside your boundary are blocked immediately.</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-indigo-200/60 dark:border-indigo-900/40 pt-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Child:</span>
                  <span className="font-bold text-foreground">{childName}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">On-Time Returns:</span>
                  <span className="font-bold text-foreground">
                    {trustStatus && trustStatus.sample_size > 0
                      ? `${trustStatus.on_time_returns} / ${trustStatus.sample_size} (${trustStatus.on_time_return_rate}%)`
                      : 'No returns yet'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Trust Tier:</span>
                  <Badge variant="outline" className="border-indigo-500 text-indigo-700 bg-indigo-50 dark:bg-indigo-950 font-bold text-[10px]">
                    {currentTier} TRUST
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
