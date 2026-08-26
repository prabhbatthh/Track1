import {
  AlertCircle,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { executeAutonomousAutopay, getAutopayDemoLoans, type AutopayAutonomousResponse } from '../api';

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
  const [childName, setChildName] = useState<string>('Child Member');

  const [simulatingScenario, setSimulatingScenario] = useState<'A' | 'B' | null>(null);
  const [loadingText, setLoadingText] = useState<string>('');
  const [result, setResult] = useState<SimulationResult | null>(null);

  async function fetchDemoLoans() {
    setLoadingDemo(true);
    try {
      const data = await getAutopayDemoLoans();
      setWithinCapLoanId(data.within_cap_loan_id);
      setOverCapLoanId(data.over_cap_loan_id);
      setPerTxCap(data.per_transaction_cap || 200);
      setMonthlyCap(data.monthly_spending_cap || 1000);
      if (data.child_name) setChildName(data.child_name);
    } catch {
      // Fallback IDs if endpoint is unavailable or mocked
      setWithinCapLoanId('demo-loan-within-150');
      setOverCapLoanId('demo-loan-over-250');
    } finally {
      setLoadingDemo(false);
    }
  }

  useEffect(() => {
    fetchDemoLoans();
  }, []);

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
        setResult({
          type: 'blocked',
          statusCode: 422,
          amount: 150,
          cap: perTxCap,
          reasonCode: 'TRANSACTION_CAP_EXCEEDED',
          detail: detail,
        });
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
      // Unexpected success for over-cap loan
      toast.info('Autonomous execution completed');
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const detail = getErrorMessage(err, 'Auto-Pay policy evaluation rejected: Transaction exceeds per-transaction cap');

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
          cap: perTxCap,
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

  return (
    <Card className="rounded-2xl border border-purple-300/70 dark:border-purple-900/60 bg-card shadow-sm overflow-hidden">
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
              Zero-click autonomous fine settlement simulator enforcing real server-side policy caps for{' '}
              <span className="font-semibold text-foreground">{childName}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-background/80 dark:bg-card/80 border border-purple-200 dark:border-purple-800/60 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-2xs">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">Cap:</span>
            <span className="font-bold text-foreground">{formatCurrency(perTxCap)} / tx</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-foreground">{formatCurrency(monthlyCap)} / mo</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 flex flex-col gap-6">
        {/* Banner note */}
        <div className="flex items-center gap-2 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/50 p-3 text-xs text-purple-900 dark:text-purple-200">
          <Sparkles className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="font-medium">
            <strong className="font-bold">Zero-Click Financial Execution:</strong> Payments within cap are settled autonomously via server-side simulated gateway without Razorpay popups, OTPs, or manual approval dialogs.
          </p>
        </div>

        {/* 2 Demo Scenarios Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Scenario A: Within Cap */}
          <div className="flex flex-col justify-between rounded-xl border border-emerald-300/70 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Scenario A — Within Cap
                </span>
                <Badge variant="success" className="text-[10px] font-bold">
                  AUTO-PAY ALLOWED
                </Badge>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-foreground">₹150 Fine</span>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
                  ₹150 ≤ {formatCurrency(perTxCap)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground font-medium">
                Within your {formatCurrency(perTxCap)} per-transaction limit. Autonomous settlement will execute without human interaction.
              </p>
            </div>

            <Button
              size="sm"
              isLoading={simulatingScenario === 'A'}
              disabled={simulatingScenario !== null || loadingDemo}
              onClick={handleSimulateWithinCap}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all gap-2 py-2 text-xs"
            >
              <Zap className="size-3.5" />
              <span>{simulatingScenario === 'A' ? loadingText || 'Processing…' : 'Simulate ₹150 Fine'}</span>
            </Button>
          </div>

          {/* Scenario B: Over Cap */}
          <div className="flex flex-col justify-between rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/30 dark:bg-rose-950/20 p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                  Scenario B — Over Cap
                </span>
                <Badge variant="danger" className="text-[10px] font-bold">
                  AUTO-PAY BLOCKED
                </Badge>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-foreground">₹250 Fine</span>
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-800">
                  ₹250 &gt; {formatCurrency(perTxCap)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground font-medium">
                Exceeds your {formatCurrency(perTxCap)} per-transaction limit. Policy evaluator will reject execution and dispatch alert.
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
                        Zero-click autonomous settlement succeeded within policy limit
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
                    <span className="text-[10px] text-muted-foreground font-semibold block">Settlement Type</span>
                    <span className="font-bold text-purple-700 dark:text-purple-300">autonomous_simulated</span>
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
                    <span className="bg-emerald-200/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">Within cap (₹150 ≤ ₹200)</span>
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
                    <span className="text-[10px] text-muted-foreground font-semibold block">Transaction Cap</span>
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
                    <span className="bg-rose-200/80 dark:bg-rose-900/60 px-2 py-0.5 rounded-md">Cap exceeded (₹250 &gt; ₹200)</span>
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
