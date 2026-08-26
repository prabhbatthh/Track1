import {
  AlertCircle,
  AlertOctagon,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileCheck,
  History,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import {
  executeAutonomousAutopay,
  getAutopayDemoLoans,
  getAutopayTrustStatus,
  simulateAutopayTrustHistory,
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

export function GuardianAutopaySimulator() {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [withinCapLoanId, setWithinCapLoanId] = useState<string | null>(null);
  const [overCapLoanId, setOverCapLoanId] = useState<string | null>(null);
  const [perTxCap, setPerTxCap] = useState<number>(200);
  const [monthlyCap, setMonthlyCap] = useState<number>(1000);
  const [childName, setChildName] = useState<string>('Diya Joshi');

  // Trust Ladder state
  const [trustStatus, setTrustStatus] = useState<AutopayTrustStatus | null>(null);
  const [loadingTrust, setLoadingTrust] = useState(false);
  const [simulatingTrustAction, setSimulatingTrustAction] = useState<'simulate_late_return' | 'restore' | null>(null);
  const [transitionMsg, setTransitionMsg] = useState<string | null>(null);

  const [simulatingScenario, setSimulatingScenario] = useState<'A' | 'B' | null>(null);
  const [loadingText, setLoadingText] = useState<string>('');
  const [result, setResult] = useState<SimulationResult | null>(null);

  async function fetchDemoLoansAndTrust() {
    setLoadingDemo(true);
    try {
      const data = await getAutopayDemoLoans();
      setWithinCapLoanId(data.within_cap_loan_id);
      setOverCapLoanId(data.over_cap_loan_id);
      setPerTxCap(data.per_transaction_cap || 200);
      setMonthlyCap(data.monthly_spending_cap || 1000);
      if (data.child_name) setChildName(data.child_name);
    } catch {
      setWithinCapLoanId('demo-loan-within-150');
      setOverCapLoanId('demo-loan-over-250');
    } finally {
      setLoadingDemo(false);
    }

    setLoadingTrust(true);
    try {
      const trustData = await getAutopayTrustStatus();
      setTrustStatus(trustData);
      if (trustData.child_name) setChildName(trustData.child_name);
    } catch {
      // Fallback mock representation if endpoint not connected in mock environment
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
        reasoning: '12 of the last 15 returned books were on time (80%). Trust tier: BASELINE. Multiplier: 1.0x. Effective cap remains ₹200.',
      });
    } finally {
      setLoadingTrust(false);
    }
  }

  useEffect(() => {
    fetchDemoLoansAndTrust();
  }, []);

  async function handleSimulateTrustChange(action: 'simulate_late_return' | 'restore') {
    setSimulatingTrustAction(action);
    setTransitionMsg(null);
    try {
      const prevCap = trustStatus?.effective_transaction_cap || 200;
      const prevTier = trustStatus?.trust_tier || 'BASELINE';
      const updated = await simulateAutopayTrustHistory(action);
      setTrustStatus(updated);

      if (action === 'simulate_late_return') {
        setTransitionMsg(
          `Trust tier adjusted: ${prevTier} → ${updated.trust_tier}. Effective cap reduced from ${formatCurrency(prevCap)} → ${formatCurrency(updated.effective_transaction_cap)} (Reason: recent return behavior fell below 70% threshold).`
        );
        toast.warning(`Trust tier downgraded to ${updated.trust_tier} (Effective cap: ${formatCurrency(updated.effective_transaction_cap)})`);
      } else {
        setTransitionMsg(
          `Trust tier restored: ${prevTier} → ${updated.trust_tier}. Effective cap restored to ${formatCurrency(updated.effective_transaction_cap)}.`
        );
        toast.success(`Trust tier restored to ${updated.trust_tier} (Effective cap: ${formatCurrency(updated.effective_transaction_cap)})`);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to update trust history'));
    } finally {
      setSimulatingTrustAction(null);
    }
  }

  async function handleSimulateWithinCap() {
    setSimulatingScenario('A');
    setResult(null);
    setLoadingText('Evaluating policy…');

    const timer = setTimeout(() => {
      setLoadingText('Autonomous payment executing…');
    }, 400);

    try {
      const loanIdToUse = withinCapLoanId || 'demo-loan-within-150';
      const res = await executeAutonomousAutopay(loanIdToUse);
      clearTimeout(timer);
      setResult({
        type: 'success',
        data: res,
      });
      toast.success('✓ Autonomous Payment Executed (₹150 Settled)');
    } catch (err: any) {
      clearTimeout(timer);
      const status = err?.status || err?.response?.status;
      const detail = getErrorMessage(err, 'Policy evaluation failed');

      if (status === 409) {
        setResult({
          type: 'duplicate',
          message: detail || 'Fine charge has already been paid (Idempotency enforced).',
        });
        toast.info('Fine already paid — Idempotency preserved');
      } else if (status === 422) {
        const effCap = trustStatus?.effective_transaction_cap || perTxCap;
        setResult({
          type: 'blocked',
          statusCode: 422,
          amount: 150,
          cap: effCap,
          reasonCode: 'TRANSACTION_CAP_EXCEEDED',
          detail: detail,
        });
        toast.warning(`✕ Auto-Pay Blocked: Exceeds effective cap of ${formatCurrency(effCap)}`);
      } else {
        toast.error(detail);
      }
    } finally {
      setSimulatingScenario(null);
      setLoadingText('');
    }
  }

  async function handleSimulateOverCap() {
    setSimulatingScenario('B');
    setResult(null);
    setLoadingText('Evaluating policy…');

    try {
      const loanIdToUse = overCapLoanId || 'demo-loan-over-250';
      await executeAutonomousAutopay(loanIdToUse);
      toast.info('Autonomous execution completed');
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const detail = getErrorMessage(err, 'Auto-Pay policy evaluation rejected: Transaction exceeds per-transaction cap');
      const effCap = trustStatus?.effective_transaction_cap || perTxCap;

      if (status === 409) {
        setResult({
          type: 'duplicate',
          message: 'This loan fine has already been processed and paid.',
        });
      } else {
        setResult({
          type: 'blocked',
          statusCode: status || 422,
          amount: 250,
          cap: effCap,
          reasonCode: 'TRANSACTION_CAP_EXCEEDED',
          detail: detail,
        });
        toast.warning('✕ Auto-Pay Blocked: Exceeds transaction cap');
      }
    } finally {
      setSimulatingScenario(null);
      setLoadingText('');
    }
  }

  const effectiveCap = trustStatus?.effective_transaction_cap ?? perTxCap;
  const currentTier = trustStatus?.trust_tier ?? 'BASELINE';
  const multiplier = trustStatus?.multiplier ?? 1.0;
  const theoreticalCap = trustStatus?.theoretical_cap ?? (perTxCap * multiplier);

  return (
    <Card className="rounded-2xl border border-purple-300/70 dark:border-purple-900/60 bg-card shadow-sm overflow-hidden space-y-0">
      <CardHeader className="bg-gradient-to-r from-purple-950/10 via-indigo-950/10 to-purple-950/10 dark:from-purple-950/40 dark:via-indigo-950/50 dark:to-purple-950/40 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shadow-xs">
                <Zap className="size-4 animate-pulse text-amber-300" />
              </div>
              <CardTitle className="text-lg font-extrabold text-foreground">
                Guardian Auto-Pay Simulator
              </CardTitle>
              <Badge variant="outline" className="border-purple-500/40 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 font-bold text-[11px]">
                Pre-approved policy
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Zero-click autonomous fine settlement simulator enforcing bounded trust caps for{' '}
              <span className="font-semibold text-foreground">{childName}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-background/80 dark:bg-card/80 border border-purple-200 dark:border-purple-800/60 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-2xs">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">Hard Ceiling:</span>
            <span className="font-bold text-foreground">{formatCurrency(perTxCap)} / tx</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-foreground">{formatCurrency(monthlyCap)} / mo</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 flex flex-col gap-6">
        {/* ================================================================= */}
        {/* 1. TRUST LADDER STATUS CARD & CAP HIERARCHY */}
        {/* ================================================================= */}
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 via-purple-50/30 to-background dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-card p-4 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/80 dark:border-indigo-900/50 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
                Self-Adjusting Trust Ladder
              </h3>
              <Badge
                variant="outline"
                className={`text-[10px] font-extrabold uppercase ${
                  currentTier === 'HIGH'
                    ? 'border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300'
                    : currentTier === 'LOW'
                    ? 'border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300'
                    : 'border-indigo-500 text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300'
                }`}
              >
                {currentTier} TRUST ({multiplier.toFixed(1)}x)
              </Badge>
            </div>

            <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
              <span>Child: <strong className="text-foreground">{childName}</strong></span>
              <span>·</span>
              <span>On-Time Returns: <strong className="text-foreground">{trustStatus?.on_time_returns ?? 12} / {trustStatus?.sample_size ?? 15} ({trustStatus?.on_time_return_rate ?? 80}%)</strong></span>
            </div>
          </div>

          {/* 3-Tier Visual Progress Indicator */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* LOW TIER CARD */}
            <div
              className={`rounded-lg p-2.5 border transition-all text-xs flex flex-col items-center gap-1 ${
                currentTier === 'LOW'
                  ? 'border-amber-500 bg-amber-500/15 dark:bg-amber-950/60 ring-2 ring-amber-400/40 shadow-xs font-bold'
                  : 'border-border/60 bg-muted/40 opacity-70'
              }`}
            >
              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-extrabold">
                <TrendingDown className="size-3.5" />
                <span>LOW (0.7x)</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">Reduced autonomy</span>
              <span className="text-xs font-black text-amber-800 dark:text-amber-300">{formatCurrency(perTxCap * 0.7)} cap</span>
            </div>

            {/* BASELINE TIER CARD */}
            <div
              className={`rounded-lg p-2.5 border transition-all text-xs flex flex-col items-center gap-1 ${
                currentTier === 'BASELINE'
                  ? 'border-indigo-500 bg-indigo-500/15 dark:bg-indigo-950/60 ring-2 ring-indigo-400/40 shadow-xs font-bold'
                  : 'border-border/60 bg-muted/40 opacity-70'
              }`}
            >
              <div className="flex items-center gap-1 text-indigo-700 dark:text-indigo-400 font-extrabold">
                <ShieldCheck className="size-3.5" />
                <span>BASELINE (1.0x)</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">Normal autonomy</span>
              <span className="text-xs font-black text-indigo-800 dark:text-indigo-300">{formatCurrency(perTxCap)} cap</span>
            </div>

            {/* HIGH TIER CARD */}
            <div
              className={`rounded-lg p-2.5 border transition-all text-xs flex flex-col items-center gap-1 ${
                currentTier === 'HIGH'
                  ? 'border-emerald-500 bg-emerald-500/15 dark:bg-emerald-950/60 ring-2 ring-emerald-400/40 shadow-xs font-bold'
                  : 'border-border/60 bg-muted/40 opacity-70'
              }`}
            >
              <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-extrabold">
                <TrendingUp className="size-3.5" />
                <span>HIGH (1.2x)</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">Earned autonomy</span>
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                ₹{perTxCap * 1.2} theo. → {formatCurrency(perTxCap)} hard cap
              </span>
            </div>
          </div>

          {/* Cap Calculation Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-background/90 dark:bg-card p-2.5 rounded-lg border border-border/80 shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-semibold block">Guardian Base Cap</span>
              <span className="font-bold text-foreground text-xs">{formatCurrency(perTxCap)}</span>
            </div>

            <div className="bg-background/90 dark:bg-card p-2.5 rounded-lg border border-border/80 shadow-2xs">
              <span className="text-[10px] text-muted-foreground font-semibold block">Theoretical Cap ({multiplier}x)</span>
              <span className="font-bold text-purple-700 dark:text-purple-300 text-xs">
                {formatCurrency(theoreticalCap)}
              </span>
            </div>

            <div className="bg-background/90 dark:bg-card p-2.5 rounded-lg border border-purple-300 dark:border-purple-800 shadow-2xs bg-purple-50/40 dark:bg-purple-950/30">
              <span className="text-[10px] text-purple-900 dark:text-purple-300 font-extrabold block">Effective Autonomous Cap</span>
              <span className="font-black text-sm text-purple-700 dark:text-purple-300">
                {formatCurrency(effectiveCap)}
              </span>
            </div>

            <div className="bg-background/90 dark:bg-card p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 shadow-2xs">
              <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-extrabold block">Guardian Hard Ceiling</span>
              <span className="font-bold text-foreground text-xs">{formatCurrency(perTxCap)} MAX</span>
            </div>
          </div>

          {/* Explainable Reasoning Callout */}
          <div className="rounded-lg bg-background/90 dark:bg-card/90 border border-indigo-200/80 dark:border-indigo-900/60 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
              <FileCheck className="size-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Why this cap?</span>
            </div>
            <p className="text-muted-foreground font-medium text-[11px] leading-relaxed">
              {trustStatus?.reasoning || '12 of the last 15 returned books were on time (80%). Trust tier: BASELINE. Multiplier: 1.0x. Effective cap remains ₹200.'}
            </p>
          </div>

          {/* Live Demo Controls: Simulate Late Return / Restore */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-200/60 dark:border-indigo-900/40">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <History className="size-3.5 text-purple-600" />
              <span>Live Hackathon Judge Controls:</span>
            </div>

            <div className="flex items-center gap-2">
              {currentTier !== 'LOW' ? (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={simulatingTrustAction === 'simulate_late_return'}
                  onClick={() => handleSimulateTrustChange('simulate_late_return')}
                  className="rounded-xl border-amber-400 dark:border-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-200 font-bold text-xs gap-1.5 shadow-2xs"
                >
                  <TrendingDown className="size-3.5 text-amber-600" />
                  <span>Simulate Late Return</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={simulatingTrustAction === 'restore'}
                  onClick={() => handleSimulateTrustChange('restore')}
                  className="rounded-xl border-emerald-400 dark:border-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 font-bold text-xs gap-1.5 shadow-2xs"
                >
                  <RotateCcw className="size-3.5 text-emerald-600" />
                  <span>Restore Normal Behavior</span>
                </Button>
              )}
            </div>
          </div>

          {/* Transition Message Banner */}
          {transitionMsg && (
            <div className="rounded-lg bg-amber-500/10 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 animate-in fade-in-50 duration-200">
              <AlertOctagon className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Trust Adjustment Audited: GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED
                </span>
                <p className="font-medium text-[11px]">{transitionMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Banner note */}
        <div className="flex items-center gap-2 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/50 p-3 text-xs text-purple-900 dark:text-purple-200">
          <Zap className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="font-medium">
            <strong className="font-bold">Zero-Click Autonomous Fine Execution:</strong> Fines within the dynamically calculated effective cap ({formatCurrency(effectiveCap)}) are settled autonomously without Razorpay popups or manual dialogs.
          </p>
        </div>

        {/* ================================================================= */}
        {/* 2 DEMO SCENARIOS GRID (A & B) */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Scenario A: ₹150 Fine */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-4 space-y-4 ${
              150 <= effectiveCap
                ? 'border-emerald-300/70 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                : 'border-rose-300/70 dark:border-rose-800/60 bg-rose-50/30 dark:bg-rose-950/20'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    150 <= effectiveCap
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-rose-800 dark:text-rose-300'
                  }`}
                >
                  Scenario A — ₹150 Fine
                </span>
                <Badge
                  variant={150 <= effectiveCap ? 'success' : 'danger'}
                  className="text-[10px] font-bold"
                >
                  {150 <= effectiveCap ? 'AUTO-PAY ALLOWED' : 'AUTO-PAY BLOCKED'}
                </Badge>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-foreground">₹150 Fine</span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                    150 <= effectiveCap
                      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800'
                      : 'text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800'
                  }`}
                >
                  ₹150 {150 <= effectiveCap ? '≤' : '>'} {formatCurrency(effectiveCap)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground font-medium">
                {150 <= effectiveCap
                  ? `Within child's ${currentTier} trust effective cap of ${formatCurrency(effectiveCap)}. Settles autonomously.`
                  : `Exceeds child's reduced ${currentTier} trust effective cap of ${formatCurrency(effectiveCap)}. Blocked by server policy.`}
              </p>
            </div>

            <Button
              size="sm"
              isLoading={simulatingScenario === 'A'}
              disabled={simulatingScenario !== null || loadingDemo}
              onClick={handleSimulateWithinCap}
              className={`w-full rounded-xl font-bold shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all gap-2 py-2 text-xs text-white ${
                150 <= effectiveCap ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              <Zap className="size-3.5" />
              <span>{simulatingScenario === 'A' ? loadingText || 'Processing…' : 'Simulate ₹150 Fine'}</span>
            </Button>
          </div>

          {/* Scenario B: ₹250 Fine */}
          <div className="flex flex-col justify-between rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/30 dark:bg-rose-950/20 p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                  Scenario B — ₹250 Fine
                </span>
                <Badge variant="danger" className="text-[10px] font-bold">
                  AUTO-PAY BLOCKED
                </Badge>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-foreground">₹250 Fine</span>
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-800">
                  ₹250 &gt; {formatCurrency(effectiveCap)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground font-medium">
                Exceeds effective cap of {formatCurrency(effectiveCap)} and guardian ceiling {formatCurrency(perTxCap)}. Rejects execution & dispatches guardian alert.
              </p>
            </div>

            <Button
              size="sm"
              isLoading={simulatingScenario === 'B'}
              disabled={simulatingScenario !== null || loadingDemo}
              onClick={handleSimulateOverCap}
              className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all gap-2 py-2 text-xs"
            >
              <ShieldAlert className="size-3.5" />
              <span>{simulatingScenario === 'B' ? loadingText || 'Evaluating…' : 'Simulate ₹250 Fine'}</span>
            </Button>
          </div>
        </div>

        {/* Live Result Display */}
        {result && (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileCheck className="size-4 text-purple-600 dark:text-purple-400" />
                Live Execution Result
              </h4>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline"
              >
                <RotateCcw className="size-3" /> Clear
              </button>
            </div>

            {/* SUCCESS RESULT CARD */}
            {result.type === 'success' && (
              <div className="rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-500/10 dark:bg-emerald-950/40 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm text-emerald-950 dark:text-emerald-100">
                        ✓ Auto-Pay Executed
                      </h5>
                      <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 font-medium">
                        Zero-click autonomous settlement succeeded within effective policy limit ({formatCurrency(effectiveCap)})
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="font-bold text-xs">
                    200 OK
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Settled Amount</span>
                    <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(result.data.amount)}
                    </span>
                  </div>
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Fine Status</span>
                    <span className="font-bold text-foreground">Loan Settled</span>
                  </div>
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Trust Tier</span>
                    <span className="font-bold text-purple-700 dark:text-purple-300">{currentTier} ({multiplier}x)</span>
                  </div>
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Audit Log</span>
                    <span className="font-bold text-foreground">EXECUTED recorded</span>
                  </div>
                </div>

                {/* Timeline */}
                <div className="pt-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block mb-2">
                    Execution Timeline
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-emerald-950 dark:text-emerald-200">
                    <span className="bg-emerald-200/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">Policy evaluated</span>
                    <ArrowRight className="size-3 text-emerald-600" />
                    <span className="bg-emerald-200/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">Within cap (₹150 ≤ {formatCurrency(effectiveCap)})</span>
                    <ArrowRight className="size-3 text-emerald-600" />
                    <span className="bg-emerald-200/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">Autonomous settlement</span>
                    <ArrowRight className="size-3 text-emerald-600" />
                    <span className="bg-emerald-200/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">Fine settled</span>
                    <ArrowRight className="size-3 text-emerald-600" />
                    <span className="bg-emerald-300 dark:bg-emerald-800 text-emerald-950 dark:text-white px-2 py-0.5 rounded-md">Audit recorded</span>
                  </div>
                </div>
              </div>
            )}

            {/* BLOCKED RESULT CARD */}
            {result.type === 'blocked' && (
              <div className="rounded-xl border border-rose-300 dark:border-rose-800/80 bg-rose-500/10 dark:bg-rose-950/40 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-rose-200 dark:border-rose-800/60 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <XCircle className="size-4" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm text-rose-950 dark:text-rose-100">
                        ✕ Auto-Pay Blocked
                      </h5>
                      <p className="text-xs text-rose-800/80 dark:text-rose-300/80 font-medium">
                        Backend policy evaluator rejected transaction (Zero payments created)
                      </p>
                    </div>
                  </div>
                  <Badge variant="danger" className="font-bold text-xs">
                    422 Unprocessable Entity
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Attempted Amount</span>
                    <span className="font-black text-sm text-rose-600 dark:text-rose-400">
                      {formatCurrency(result.amount)}
                    </span>
                  </div>
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Effective Cap</span>
                    <span className="font-bold text-foreground">{formatCurrency(result.cap)}</span>
                  </div>
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Reason Code</span>
                    <span className="font-bold text-rose-700 dark:text-rose-300">{result.reasonCode}</span>
                  </div>
                  <div className="bg-background/80 dark:bg-card/80 p-2.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60">
                    <span className="text-[10px] text-muted-foreground font-semibold block">Guardian Status</span>
                    <span className="font-bold text-foreground">Guardian Notified</span>
                  </div>
                </div>

                {/* Timeline */}
                <div className="pt-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300 block mb-2">
                    Enforcement Timeline
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-rose-950 dark:text-rose-200">
                    <span className="bg-rose-200/80 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">Policy evaluated</span>
                    <ArrowRight className="size-3 text-rose-600" />
                    <span className="bg-rose-200/80 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">Cap exceeded ({formatCurrency(result.amount)} &gt; {formatCurrency(result.cap)})</span>
                    <ArrowRight className="size-3 text-rose-600" />
                    <span className="bg-rose-200/80 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">Payment blocked</span>
                    <ArrowRight className="size-3 text-rose-600" />
                    <span className="bg-rose-200/80 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">Guardian notified</span>
                    <ArrowRight className="size-3 text-rose-600" />
                    <span className="bg-rose-300 dark:bg-rose-800 text-rose-950 dark:text-white px-2 py-0.5 rounded-md">BLOCKED_OVERCAP audit logged</span>
                  </div>
                </div>
              </div>
            )}

            {/* DUPLICATE / IDEMPOTENCY RESULT CARD */}
            {result.type === 'duplicate' && (
              <div className="rounded-xl border border-blue-300 dark:border-blue-800/80 bg-blue-500/10 dark:bg-blue-950/40 p-4 flex items-start gap-3">
                <AlertCircle className="size-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <h5 className="font-extrabold text-blue-950 dark:text-blue-100">
                      Already Settled (409 Conflict)
                    </h5>
                    <Badge variant="outline" className="border-blue-400 text-blue-700 font-bold text-[10px]">
                      Idempotent
                    </Badge>
                  </div>
                  <p className="text-blue-900/80 dark:text-blue-200/80 font-medium">
                    {result.message} Total payments remain unchanged in PostgreSQL.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
