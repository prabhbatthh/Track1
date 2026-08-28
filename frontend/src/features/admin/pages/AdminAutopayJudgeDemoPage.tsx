import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  Zap,
  XCircle,
} from 'lucide-react';

import {
  getAdminAutopayDemoAuditTrail,
  getAdminAutopayDemoOverview,
  runAdminAutopayDemoMonthlySpendSimulation,
  runAdminAutopayDemoScenario,
  runAdminAutopayDemoTrustSimulation,
  updateAdminAutopayDemoPolicy,
  type AdminAutopayDemoAuditTrailItem,
  type AdminAutopayDemoOverviewResponse,
  type AdminAutopayDemoSimulateResponse,
  type AdminAutopayDemoTrustSimulateResponse,
} from '../api/autopayDemoApi';

export function AdminAutopayJudgeDemoPage() {
  const [overview, setOverview] = useState<AdminAutopayDemoOverviewResponse | null>(null);
  const [auditItems, setAuditItems] = useState<AdminAutopayDemoAuditTrailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simulatingTrust, setSimulatingTrust] = useState<string | null>(null);
  const [simulatingMonthlySpend, setSimulatingMonthlySpend] = useState<string | null>(null);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [lastResult, setLastResult] = useState<AdminAutopayDemoSimulateResponse | null>(null);
  const [lastTrustResult, setLastTrustResult] = useState<AdminAutopayDemoTrustSimulateResponse | null>(null);
  const [showFullAuditLog, setShowFullAuditLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverviewAndAudit = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, auditData] = await Promise.all([
        getAdminAutopayDemoOverview(),
        getAdminAutopayDemoAuditTrail(),
      ]);
      setOverview(overviewData);
      setAuditItems(auditData.items || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load demo diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewAndAudit();
  }, []);

  const [customAmountInput, setCustomAmountInput] = useState<string>('139');

  const handleSimulateScenario = async (
    scenario: 'within_limit' | 'boundary_100' | 'over_monthly_101' | 'over_limit' | 'custom' | 'simulate_failure',
    customVal?: number
  ) => {
    try {
      setSimulating(scenario);
      setError(null);
      const valToPass = scenario === 'custom' ? (customVal ?? parseInt(customAmountInput, 10)) : undefined;
      const result = await runAdminAutopayDemoScenario(scenario, valToPass);
      setLastResult(result);
      await fetchOverviewAndAudit();
    } catch (err: any) {
      setError(err?.message || 'Scenario simulation failed');
    } finally {
      setSimulating(null);
    }
  };

  const handleSimulateTrust = async (action: 'responsible' | 'late' | 'reset') => {
    try {
      setSimulatingTrust(action);
      setError(null);
      const trustResult = await runAdminAutopayDemoTrustSimulation(action);
      setLastTrustResult(trustResult);
      setLastResult(null);
      await fetchOverviewAndAudit();
    } catch (err: any) {
      setError(err?.message || 'Trust simulation failed');
    } finally {
      setSimulatingTrust(null);
    }
  };

  const handleSimulateMonthlySpend = async (action: 'simulate_900' | 'reset') => {
    try {
      setSimulatingMonthlySpend(action);
      setError(null);
      await runAdminAutopayDemoMonthlySpendSimulation(action);
      setLastResult(null);
      await fetchOverviewAndAudit();
    } catch (err: any) {
      setError(err?.message || 'Monthly spend simulation failed');
    } finally {
      setSimulatingMonthlySpend(null);
    }
  };

  const handleUpdatePolicy = async (payload: { enabled?: boolean; per_transaction_cap?: number }) => {
    try {
      setUpdatingPolicy(true);
      setError(null);
      await updateAdminAutopayDemoPolicy(payload);
      setLastResult(null);
      await fetchOverviewAndAudit();
    } catch (err: any) {
      setError(err?.message || 'Failed to update demo policy');
    } finally {
      setUpdatingPolicy(false);
    }
  };

  const formatActionTitle = (action: string) => {
    if (action === 'GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED') return 'Autonomous Payment Executed';
    if (action === 'GUARDIAN_AUTOPAY_BLOCKED_OVERCAP') return 'Autonomous Payment Blocked';
    if (action === 'GUARDIAN_AUTOPAY_AUTONOMOUS_FAILED') return 'Payment Failed Safely';
    if (action === 'GUARDIAN_AUTOPAY_DEMO_POLICY_CHANGED') return 'Demo Policy Modified';
    if (action === 'GUARDIAN_AUTOPAY_TRUST_SIMULATED') return 'Trust History Simulated';
    if (action === 'GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED') return 'Trust Tier Adjusted';
    if (action === 'GUARDIAN_AUTOPAY_POLICY_UPDATED') return 'Safety Policy Updated';
    if (action === 'GUARDIAN_AUTOPAY_APPROVED') return 'Payment Policy Evaluated & Allowed';
    if (action === 'GUARDIAN_AUTOPAY_REJECTED') return 'Payment Policy Evaluated & Blocked';
    if (action === 'GUARDIAN_AUTOPAY_DEMO_MONTHLY_SPEND_SIMULATED') return 'Monthly Spend Simulated (₹900)';
    if (action === 'GUARDIAN_AUTOPAY_DEMO_MONTHLY_SPEND_RESET') return 'Monthly Spend Reset (₹0)';
    return action.replace(/_/g, ' ');
  };

  const filteredAuditItems = auditItems.filter(
    (item) =>
      item.action !== 'GUARDIAN_AUTOPAY_EVALUATED' &&
      item.action !== 'GUARDIAN_AUTOPAY_APPROVED' &&
      item.action !== 'GUARDIAN_AUTOPAY_REJECTED'
  );
  const recentTimelineItems = filteredAuditItems.slice(0, 5);
  const isEnabled = overview?.enabled ?? true;
  const effectiveCap = overview?.effective_transaction_cap ?? 200;
  const guardianCap = overview?.per_transaction_cap ?? 200;
  const hardCeiling = overview?.hard_safety_ceiling ?? 200;
  const monthlySpent = overview?.monthly_spent ?? 0;
  const monthlyCap = overview?.monthly_spending_cap ?? 1000;
  const remainingMonthlyAuthority = overview?.remaining_monthly_authority ?? (monthlyCap - monthlySpent);
  const isWithinCapAllowed = isEnabled && effectiveCap >= 150 && remainingMonthlyAuthority >= 150;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* 1. HEADER & INTEGRATED DIAGNOSTICS BAR — EXACT BRAND PRIMARY PURPLE */}
      <div className="bg-gradient-to-r from-primary via-primary/90 to-ink text-white rounded-2xl p-6 shadow-xl border border-white/20 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Zap className="w-3 h-3" /> DEMO / JUDGE MODE
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/15 text-white border border-white/20">
                <ShieldCheck className="w-3 h-3" /> DEMO PROFILE
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              AI Guardian Auto-Pay — Judge Control Center
            </h1>
            <p className="text-xs text-white/80 mt-1">
              Demonstrate bounded autonomous payment, policy configuration, dynamic trust scoring, monthly budget protection, and auditability.
            </p>
          </div>
          <button
            onClick={fetchOverviewAndAudit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium border border-white/20 transition self-start md:self-auto shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* 6 DIAGNOSTIC METRICS STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-white/20 text-xs">
          <div className="bg-black/20 p-3 rounded-xl border border-white/10">
            <span className="text-white/70 block font-medium">Child Profile</span>
            <span className="text-sm font-extrabold text-white mt-0.5 block">Demo Child</span>
          </div>

          <div className="bg-black/20 p-3 rounded-xl border border-white/10">
            <span className="text-white/70 block font-medium">Trust Tier</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-black ${
                  overview?.trust_tier === 'HIGH'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : overview?.trust_tier === 'LOW'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-white/20 text-white'
                }`}
              >
                {overview?.trust_tier || 'BASELINE'} ({overview?.multiplier ?? 1}x)
              </span>
            </div>
          </div>

          <div className="bg-black/20 p-3 rounded-xl border border-white/10">
            <span className="text-white/70 block font-medium">Guardian Limit</span>
            <span className="text-sm font-extrabold text-white mt-0.5 block">₹{guardianCap}</span>
          </div>

          <div className="bg-black/20 p-3 rounded-xl border border-white/10">
            <span className="text-white/70 block font-medium">Monthly Spend</span>
            <span className="text-sm font-extrabold text-white mt-0.5 block">
              ₹{monthlySpent} / ₹{monthlyCap}
            </span>
          </div>

          <div className="bg-black/20 p-3 rounded-xl border border-white/10">
            <span className="text-white/70 block font-medium">Remaining Monthly</span>
            <span className={`text-sm font-extrabold mt-0.5 block ${remainingMonthlyAuthority <= 100 ? 'text-amber-300' : 'text-emerald-300'}`}>
              ₹{remainingMonthlyAuthority}
            </span>
          </div>

          <div className="bg-white/20 p-3 rounded-xl border border-white/30 col-span-2 sm:col-span-1">
            <span className="text-white/90 block font-bold text-[11px]">Effective Per-Fine Cap</span>
            <span className="text-base font-black text-white mt-0.5 block">
              {!isEnabled ? '₹0 (DISABLED)' : `₹${effectiveCap}`}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* LATEST AI DECISION HERO & SINGLE-LINE LIFECYCLE INDICATOR */}
      {lastResult && (
        <section className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Latest AI Execution Decision
                </span>
              </div>
              {/* SUBTLE SINGLE-LINE LIFECYCLE INDICATOR */}
              <p className="text-[11px] text-indigo-300 font-medium font-mono">
                Fine → Trust → Policy → Cap → Budget → Decision → Payment → Audit
              </p>
            </div>
            <span
              className={`px-3.5 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 self-start sm:self-auto ${
                lastResult.status === 'EXECUTED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : lastResult.status === 'BLOCKED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {lastResult.status === 'EXECUTED' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : lastResult.status === 'BLOCKED' ? (
                <XCircle className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {lastResult.badge}
            </span>
          </div>

          {/* COMPACT DYNAMIC STEP TRACE */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max text-xs">
              <div className="bg-slate-800 text-slate-200 px-3 py-2 rounded-lg font-bold">
                Fine Detected (₹{lastResult.amount})
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />

              {!isEnabled || (lastResult.reason && lastResult.reason.toLowerCase().includes('disabled')) ? (
                <>
                  <div className="bg-rose-950 text-rose-300 border border-rose-800 px-3 py-2 rounded-lg font-extrabold">
                    Guardian Policy Disabled
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="bg-rose-600 text-white px-3 py-2 rounded-lg font-black shadow">
                    AUTONOMOUS PAYMENT BLOCKED
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="bg-slate-800 text-slate-300 px-3 py-2 rounded-lg font-bold">
                    Payment NOT Recorded
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-2 rounded-lg font-bold">
                    Audit Log Recorded
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-800 text-slate-200 px-3 py-2 rounded-lg font-bold">
                    Trust: {overview?.trust_tier} ({overview?.multiplier}x)
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="bg-slate-800 text-slate-200 px-3 py-2 rounded-lg font-bold">
                    Limit: ₹{guardianCap}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="bg-slate-800 text-slate-200 px-3 py-2 rounded-lg font-bold">
                    Per-Fine Cap: ₹{effectiveCap}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />

                  {lastResult.reason && (lastResult.reason.toLowerCase().includes('monthly') || lastResult.reason.toLowerCase().includes('spent')) ? (
                    <>
                      <div className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-3 py-2 rounded-lg font-bold">
                        Per-Fine Cap Passed (₹{lastResult.amount} ≤ ₹{effectiveCap})
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-amber-950 text-amber-300 border border-amber-800 px-3 py-2 rounded-lg font-bold">
                        Monthly Spend: ₹{monthlySpent}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-rose-950 text-rose-300 border border-rose-800 px-3 py-2 rounded-lg font-bold">
                        Projected: ₹{monthlySpent + lastResult.amount} &gt; ₹{monthlyCap} Cap
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-rose-600 text-white px-3 py-2 rounded-lg font-black shadow">
                        MONTHLY CAP EXCEEDED
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-slate-800 text-slate-300 px-3 py-2 rounded-lg font-bold">
                        Payment NOT Recorded
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-2 rounded-lg font-bold">
                        Audit Log Recorded
                      </div>
                    </>
                  ) : lastResult.status === 'EXECUTED' ? (
                    <>
                      <div className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-3 py-2 rounded-lg font-bold">
                        ₹{lastResult.amount} ≤ ₹{effectiveCap}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-3 py-2 rounded-lg font-bold">
                        Monthly: ₹{monthlySpent} ≤ ₹{monthlyCap}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-emerald-600 text-white px-3 py-2 rounded-lg font-black shadow">
                        Payment Executed
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-2 rounded-lg font-bold">
                        Audit Log Recorded
                      </div>
                    </>
                  ) : lastResult.status === 'BLOCKED' ? (
                    <>
                      <div className="bg-rose-950 text-rose-300 border border-rose-800 px-3 py-2 rounded-lg font-bold">
                        ₹{lastResult.amount} &gt; ₹{effectiveCap}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-rose-600 text-white px-3 py-2 rounded-lg font-black shadow">
                        Payment NOT Executed
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-amber-950 text-amber-300 border border-amber-800 px-3 py-2 rounded-lg font-bold">
                        Guardian Notified
                      </div>
                    </>
                  ) : lastResult.status === 'GATEWAY_FAILURE' ? (
                    <>
                      <div className="bg-amber-950 text-amber-300 border border-amber-800 px-3 py-2 rounded-lg font-bold">
                        Gateway Timeout
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-amber-600 text-slate-950 px-3 py-2 rounded-lg font-black shadow">
                        Payment NOT Recorded
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <div className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-2 rounded-lg font-bold">
                        Failure Audit Recorded
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 2. UNIFIED JUDGE CONTROL SURFACE (CONFIGURE AUTHORITY | SIMULATE TRUST | MONTHLY BUDGET) */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <h2 className="text-base font-extrabold text-slate-900">Judge Control Panel</h2>
          </div>
          <span className="text-xs font-medium text-slate-500 font-mono">
            Limit: <strong className="text-slate-900">₹{guardianCap}</strong> · Monthly: <strong className="text-slate-900">₹{monthlySpent}/₹{monthlyCap}</strong> · Rem: <strong className="text-slate-900">₹{remainingMonthlyAuthority}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 gap-6 lg:gap-0">
          {/* SECTION 1: CONFIGURE AI AUTHORITY */}
          <div className="space-y-4 lg:pr-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Configure AI Authority
                </span>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  Set transaction limit boundaries
                </span>
              </div>
              <button
                onClick={() => handleUpdatePolicy({ enabled: !isEnabled })}
                disabled={updatingPolicy}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition inline-flex items-center gap-1.5 border ${
                  isEnabled
                    ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                {isEnabled ? <ToggleLeft className="w-3.5 h-3.5 text-slate-500" /> : <ToggleRight className="w-3.5 h-3.5 text-emerald-600" />}
                {isEnabled ? 'Disable Auto-Pay' : 'Enable Auto-Pay'}
              </button>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-1.5">
                Per-Fine Limit Selector:
              </span>
              <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 grid grid-cols-4 gap-1">
                {[100, 140, 200, 300].map((capVal) => {
                  const isSelected = guardianCap === capVal;
                  return (
                    <button
                      key={capVal}
                      onClick={() => handleUpdatePolicy({ per_transaction_cap: capVal })}
                      disabled={updatingPolicy}
                      className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      ₹{capVal}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between pt-1">
              <span>Hard Safety Ceiling:</span>
              <span className="font-extrabold text-slate-800">₹{hardCeiling} max limit</span>
            </div>
          </div>

          {/* SECTION 2: SIMULATE TRUST HISTORY */}
          <div className="space-y-4 pt-6 lg:pt-0 lg:px-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Simulate Trust History
                </span>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  Change return history to alter AI authority
                </span>
              </div>
              {lastTrustResult && (
                <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {lastTrustResult.previous_trust_tier} → {lastTrustResult.new_trust_tier}
                </span>
              )}
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-1.5">
                Simulation Actions:
              </span>
              <div className="space-y-2">
                <button
                  onClick={() => handleSimulateTrust('responsible')}
                  disabled={simulatingTrust !== null}
                  className="w-full py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100/90 active:bg-emerald-200 text-xs font-extrabold transition flex items-center justify-between disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Responsible</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-800 text-[10px] font-mono font-bold">
                    1.2x
                  </span>
                </button>

                <button
                  onClick={() => handleSimulateTrust('late')}
                  disabled={simulatingTrust !== null}
                  className="w-full py-1.5 px-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100/90 active:bg-amber-200 text-xs font-extrabold transition flex items-center justify-between disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                    <span>Late Returns</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-800 text-[10px] font-mono font-bold">
                    0.7x
                  </span>
                </button>

                <button
                  onClick={() => handleSimulateTrust('reset')}
                  disabled={simulatingTrust !== null}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 active:bg-slate-300 text-xs font-extrabold transition flex items-center justify-between disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                    <span>Reset History</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-mono font-bold">
                    1.0x
                  </span>
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between pt-1">
              <span>Current Trust Tier:</span>
              <span className="font-extrabold text-slate-800">{overview?.trust_tier || 'BASELINE'} ({overview?.multiplier ?? 1}x)</span>
            </div>
          </div>

          {/* SECTION 3: SIMULATE MONTHLY BUDGET */}
          <div className="space-y-4 pt-6 lg:pt-0 lg:pl-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Monthly Budget
                </span>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  Cumulative spending protection
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-primary border border-purple-200">
                DEMO ONLY
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                <span>Monthly Spent:</span>
                <span className="font-extrabold text-slate-900">₹{monthlySpent} / ₹{monthlyCap}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-3">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (monthlySpent / monthlyCap) * 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSimulateMonthlySpend('simulate_900')}
                  disabled={simulatingMonthlySpend !== null}
                  className="py-2 px-2.5 rounded-lg bg-purple-50 text-primary border border-purple-200 hover:bg-purple-100 active:bg-purple-200 text-xs font-extrabold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 text-primary" /> Simulate ₹900
                </button>

                <button
                  onClick={() => handleSimulateMonthlySpend('reset')}
                  disabled={simulatingMonthlySpend !== null}
                  className="py-2 px-2.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 active:bg-slate-300 text-xs font-extrabold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-600" /> Reset
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between pt-1">
              <span>Remaining Authority:</span>
              <span className={`font-extrabold ${remainingMonthlyAuthority <= 100 ? 'text-amber-700' : 'text-emerald-700'}`}>
                ₹{remainingMonthlyAuthority}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. TEST PAYMENT SCENARIOS — RUN AI PAYMENT DECISION */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">4. Run AI Payment Decision</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Every test below runs through the same live backend Auto-Pay safety engine
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            onClick={() => handleSimulateScenario('within_limit')}
            disabled={simulating !== null}
            className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between space-y-1.5 disabled:opacity-50 ${
              isWithinCapAllowed
                ? 'bg-emerald-50/50 border-emerald-300 hover:bg-emerald-100/50'
                : 'bg-rose-50/50 border-rose-300 hover:bg-rose-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-700">Scenario A</span>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isWithinCapAllowed ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                {isWithinCapAllowed ? 'ALLOWED' : 'BLOCKED'}
              </span>
            </div>
            <span className="text-lg font-black text-slate-900">₹150 Fine</span>
            <span className="text-[10px] text-slate-600 block">
              Standard Fine Run
            </span>
          </button>

          <button
            onClick={() => handleSimulateScenario('boundary_100')}
            disabled={simulating !== null}
            className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-300 hover:bg-emerald-100/50 text-left transition flex flex-col justify-between space-y-1.5 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-700">Exact Boundary</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                ₹100 = CAP
              </span>
            </div>
            <span className="text-lg font-black text-slate-900">₹100 Fine</span>
            <span className="text-[10px] text-slate-600 block">
              ₹900 + ₹100 = ₹1000
            </span>
          </button>

          <button
            onClick={() => handleSimulateScenario('over_monthly_101')}
            disabled={simulating !== null}
            className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-300 hover:bg-amber-100/50 text-left transition flex flex-col justify-between space-y-1.5 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-700">+₹1 Over Cap</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                EXCEEDED
              </span>
            </div>
            <span className="text-lg font-black text-slate-900">₹101 Fine</span>
            <span className="text-[10px] text-slate-600 block">
              ₹900 + ₹101 = ₹1001
            </span>
          </button>

          <button
            onClick={() => handleSimulateScenario('over_limit')}
            disabled={simulating !== null}
            className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-300 hover:bg-rose-100/50 text-left transition flex flex-col justify-between space-y-1.5 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-700">Per-Fine Cap</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                OVER LIMIT
              </span>
            </div>
            <span className="text-lg font-black text-slate-900">₹250 Fine</span>
            <span className="text-[10px] text-slate-600 block">
              ₹250 &gt; ₹{effectiveCap}
            </span>
          </button>

          <button
            onClick={() => handleSimulateScenario('simulate_failure')}
            disabled={simulating !== null}
            className="p-3.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-left transition flex flex-col justify-between space-y-1.5 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-700">Gateway Test</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-300 text-slate-800">
                FAILURE
              </span>
            </div>
            <span className="text-lg font-black text-slate-900">Timeout</span>
            <span className="text-[10px] text-slate-600 block">
              Rollback Safety Test
            </span>
          </button>
        </div>

        {/* CUSTOM FINE TESTER */}
        <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" /> Custom Fine Tester
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Run any fine amount through the live safety engine
              </p>
            </div>

            {/* Quick-test boundary chips */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Boundary Chips:</span>
              {[139, 140, 141].map((chipVal) => (
                <button
                  key={chipVal}
                  type="button"
                  onClick={() => setCustomAmountInput(chipVal.toString())}
                  className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 active:bg-slate-200 transition shadow-xs"
                >
                  ₹{chipVal}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = parseInt(customAmountInput, 10);
              if (isNaN(parsed) || parsed <= 0) {
                setError('Please enter a valid positive fine amount (greater than ₹0)');
                return;
              }
              handleSimulateScenario('custom', parsed);
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="relative flex-1 min-w-[140px] max-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                ₹
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={customAmountInput}
                onChange={(e) => setCustomAmountInput(e.target.value)}
                placeholder="139"
                className="w-full pl-7 pr-3 py-2 text-sm font-extrabold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={simulating !== null}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-extrabold shadow-sm transition inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-200" />
              {simulating === 'custom' ? 'Evaluating...' : 'Evaluate & Simulate'}
            </button>
          </form>
        </div>
      </section>

      {/* 5. AUDIT TIMELINE & FULL AUDIT LOG */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-700" />
            <h2 className="text-base font-extrabold text-slate-900">5. Recent AI Decision Timeline</h2>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-600">
            Top {recentTimelineItems.length} Events
          </span>
        </div>

        <div className="space-y-2.5">
          {recentTimelineItems.map((item) => {
            const isExecuted = item.result === 'APPROVED' || item.action.includes('EXECUTED');
            const isBlocked = item.result === 'BLOCKED' || item.action.includes('BLOCKED');
            const isFailed = item.result === 'FAILED' || item.action.includes('FAILED');
            const isTrustSim = item.action.includes('TRUST');
            const isPolicyChange = item.action.includes('POLICY');
            const isMonthlySim = item.action.includes('MONTHLY');

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 text-xs ${
                  isExecuted
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : isBlocked
                    ? 'bg-rose-50/40 border-rose-200'
                    : isFailed
                    ? 'bg-amber-50/40 border-amber-200'
                    : isTrustSim
                    ? 'bg-indigo-50/40 border-indigo-200'
                    : isPolicyChange
                    ? 'bg-blue-50/40 border-blue-200'
                    : isMonthlySim
                    ? 'bg-purple-50/40 border-purple-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isExecuted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : isBlocked ? (
                    <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  ) : isFailed ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  ) : isTrustSim ? (
                    <Zap className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  ) : isPolicyChange ? (
                    <Sliders className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  ) : isMonthlySim ? (
                    <Zap className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  )}

                  <div>
                    <span className="font-bold text-slate-900 block">
                      {formatActionTitle(item.action)}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate max-w-md">
                      {item.reason || 'Evaluated against bounded policy rules'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {item.amount && (
                    <span className="font-extrabold text-slate-900">₹{item.amount}</span>
                  )}
                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isExecuted
                        ? 'bg-emerald-100 text-emerald-800'
                        : isBlocked
                        ? 'bg-rose-100 text-rose-800'
                        : isFailed
                        ? 'bg-amber-100 text-amber-800'
                        : isTrustSim
                        ? 'bg-indigo-100 text-indigo-800'
                        : isPolicyChange
                        ? 'bg-blue-100 text-blue-800'
                        : isMonthlySim
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {isExecuted
                      ? 'EXECUTED'
                      : isBlocked
                      ? 'BLOCKED'
                      : isFailed
                      ? 'FAILED'
                      : isTrustSim
                      ? 'SIMULATED'
                      : isPolicyChange
                      ? 'POLICY CHANGED'
                      : isMonthlySim
                      ? 'MONTHLY SIM'
                      : item.result}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            onClick={() => setShowFullAuditLog(!showFullAuditLog)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
          >
            {showFullAuditLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showFullAuditLog ? 'Hide Detailed Audit Log' : `View Full Audit Log (${auditItems.length} Events)`}
          </button>

          {showFullAuditLog && (
            <div className="mt-3 overflow-x-auto border border-slate-200 rounded-xl text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Result</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {auditItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900">{item.action}</td>
                      <td className="py-2 px-3 font-bold">{item.amount ? `₹${item.amount}` : '—'}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            item.result === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.result === 'BLOCKED'
                              ? 'bg-rose-100 text-rose-800'
                              : item.result === 'FAILED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.result}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500 max-w-xs truncate">{item.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <footer className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span>
            Demo controls operate through the same bounded policy checks used by AI Guardian Auto-Pay. Cumulative monthly limits and hard safety ceilings cannot be bypassed.
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">Razorpay Buildathon Demo</span>
      </footer>
    </div>
  );
}
