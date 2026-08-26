import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui';
import { fetchAgentCatalog } from '@/features/agent-catalog/api';
import type { AgentCatalogResponse, AgentMembershipPlan } from '@/features/agent-catalog/types';
import {
  AICheckoutApprovalModal,
  createCheckoutProposal,
  approveCheckoutProposal,
  evaluateUpsell,
  type AgentCheckoutProposalOut,
  type UpsellEvaluateResponse,
} from '@/features/agent-upsell';
import { loadRazorpayCheckout } from '@/lib/razorpay';
import { useAuth } from '@/providers/AuthProvider';

interface ExternalAIShoppingAgentSimulatorProps {
  currentPlanId?: string;
  onPaymentSuccess?: () => void;
}

export function ExternalAIShoppingAgentSimulator({
  currentPlanId = '1m',
  onPaymentSuccess,
}: ExternalAIShoppingAgentSimulatorProps) {
  const { token, fullName, email, verifyRazorpayPayment } = useAuth();

  const [catalog, setCatalog] = useState<AgentCatalogResponse | null>(null);
  const [isFetchingCatalog, setIsFetchingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [aiEvaluation, setAiEvaluation] = useState<UpsellEvaluateResponse | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const [proposal, setProposal] = useState<AgentCheckoutProposalOut | null>(null);
  const [isCreatingProposal, setIsCreatingProposal] = useState<boolean>(false);

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // Step 1: Discover Catalog from real /api/v1/agent/catalog API
  const loadCatalog = async () => {
    setIsFetchingCatalog(true);
    setCatalogError(null);
    try {
      const res = await fetchAgentCatalog(100);
      setCatalog(res);
      // Default recommendation query
      if (res.membership_plans.length > 0) {
        const topPlan = res.membership_plans.find((p) => p.months > 1) || res.membership_plans[0];
        setSelectedPlanId(topPlan.plan_id);
      }
    } catch (err) {
      setCatalogError('Failed to connect to merchant catalog API.');
    } finally {
      setIsFetchingCatalog(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Step 2 & 3: AI Agent Evaluates & Explains
  const handleRunAiEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const evalRes = await evaluateUpsell({ current_plan_id: currentPlanId }, token ?? undefined);
      setAiEvaluation(evalRes);
      if (evalRes.recommended_plan?.plan_id) {
        setSelectedPlanId(evalRes.recommended_plan.plan_id);
      }
      toast.success('AI Shopping Agent evaluated catalog and generated optimal recommendation.');
    } catch (err) {
      toast.error('AI evaluation temporarily unavailable; using merchant catalog pricing.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Step 4: Agent Prepares Purchase Proposal via POST /api/v1/agent/checkout/proposal
  const handlePrepareProposal = async () => {
    if (!selectedPlanId) return;
    setIsCreatingProposal(true);
    try {
      const propRes = await createCheckoutProposal(
        { plan_id: selectedPlanId },
        token ?? undefined
      );
      setProposal(propRes);
      toast.success(`Checkout proposal ${propRes.proposal_id.slice(0, 10)} locked for 15 minutes.`);
    } catch (err) {
      toast.error('Failed to create checkout proposal. Please try again.');
    } finally {
      setIsCreatingProposal(false);
    }
  };

  // Step 5: Human Safety Gate -> Approve Proposal & Open Razorpay
  const handleApproveProposal = async () => {
    if (!proposal) return;
    setIsApproving(true);
    try {
      const scriptLoaded = await loadRazorpayCheckout();
      if (!scriptLoaded || !window.Razorpay) {
        toast.error('Razorpay SDK failed to load');
        return;
      }

      const order = await approveCheckoutProposal(
        { proposal_id: proposal.proposal_id },
        token ?? undefined
      );

      setIsApprovalModalOpen(false);

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount * 100,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Library Reading Club',
        description: order.plan_name || `${proposal.plan_name} Membership`,
        prefill: { name: fullName ?? undefined, email: email ?? undefined },
        theme: { color: '#731c7b' },
        handler: async (response: any) => {
          try {
            await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success('Payment verified! Membership activated.');
            if (onPaymentSuccess) onPaymentSuccess();
          } catch (err) {
            toast.error('Payment verification failed.');
          }
        },
      });
      checkout.open();
    } catch (err) {
      toast.error('Approval failed or proposal expired.');
    } finally {
      setIsApproving(false);
    }
  };

  const selectedPlanObj = catalog?.membership_plans.find((p) => p.plan_id === selectedPlanId);

  return (
    <div
      data-testid="agent-simulator-container"
      className="mx-auto flex flex-col gap-6 rounded-3xl border border-purple-200/80 bg-white p-6 shadow-xl dark:border-purple-900/40 dark:bg-zinc-950 sm:p-8"
    >
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-purple-100 pb-5 dark:border-purple-900/30">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-700 via-purple-800 to-indigo-900 text-white shadow-lg shadow-purple-950/20">
            <Bot className="size-6 text-purple-200 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                <Cpu className="size-3 text-purple-600" />
                EXTERNAL AI SHOPPING AGENT DEMO
              </span>
              <span className="font-mono text-xs font-semibold text-muted-foreground">v1.0</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              Bounded Agentic Commerce Flow
            </h2>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadCatalog}
          isLoading={isFetchingCatalog}
          className="rounded-xl border-purple-200 text-xs font-semibold hover:bg-purple-50 dark:border-purple-800 dark:hover:bg-purple-950/40"
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh Catalog API
        </Button>
      </div>

      {/* STEP 1: Catalog Discovery */}
      <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4 dark:border-purple-900/30 dark:bg-purple-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-ping" />
            <h4 className="text-sm font-extrabold text-purple-950 dark:text-purple-100">
              STEP 1 — Merchant Catalog Discovery
            </h4>
          </div>
          <code className="rounded-md bg-purple-200/60 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-900 dark:bg-purple-900/60 dark:text-purple-200">
            GET /api/v1/agent/catalog
          </code>
        </div>

        {isFetchingCatalog ? (
          <p className="mt-3 text-xs text-muted-foreground animate-pulse">
            Connecting to merchant catalog API...
          </p>
        ) : catalogError ? (
          <p className="mt-3 text-xs font-semibold text-danger">{catalogError}</p>
        ) : (
          <div
            data-testid="catalog-discovery-status"
            className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3"
          >
            <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 font-medium text-emerald-800 shadow-sm border border-emerald-200/70 dark:bg-zinc-900 dark:border-emerald-800/40 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>Catalog discovered</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 font-medium text-emerald-800 shadow-sm border border-emerald-200/70 dark:bg-zinc-900 dark:border-emerald-800/40 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>{catalog?.membership_plans.length || 0} plans available</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 font-medium text-emerald-800 shadow-sm border border-emerald-200/70 dark:bg-zinc-900 dark:border-emerald-800/40 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>Prices from merchant API</span>
            </div>
          </div>
        )}
      </div>

      {/* STEP 2: Evaluate Options (Dynamic Plans from API) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-foreground">
            STEP 2 — Agent Plan Evaluation & Selection
          </h4>
          <Button
            size="sm"
            onClick={handleRunAiEvaluation}
            isLoading={isEvaluating}
            className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-sm"
          >
            <Zap className="mr-1.5 size-3.5 text-amber-300" />
            Evaluate Plans with AI
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {catalog?.membership_plans.map((plan: AgentMembershipPlan) => {
            const isSelected = selectedPlanId === plan.plan_id;
            return (
              <div
                key={plan.plan_id}
                data-testid={`dynamic-plan-card-${plan.plan_id}`}
                onClick={() => setSelectedPlanId(plan.plan_id)}
                className={`relative cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50/90 shadow-md ring-2 ring-purple-500/40 dark:border-purple-500 dark:bg-purple-950/40'
                    : 'border-border bg-card hover:border-purple-300 dark:hover:border-purple-800'
                }`}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                    <Check className="size-3" /> SELECTED
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {plan.months} Month Plan
                </p>
                <h5 className="mt-0.5 text-base font-extrabold text-foreground">{plan.name}</h5>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-black text-purple-900 dark:text-purple-200">
                    ₹{plan.price.toLocaleString()}
                  </span>
                  {plan.save_percent > 0 && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Save {plan.save_percent}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 3: Agent Recommendation Explanation */}
      {selectedPlanObj && (
        <div
          data-testid="agent-recommendation-card"
          className="rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-indigo-50/40 to-pink-50/30 p-5 dark:border-purple-800 dark:from-purple-950/40 dark:via-zinc-950 dark:to-zinc-950"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md">
              <Sparkles className="size-5 text-amber-200" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-purple-800 dark:text-purple-300">
                  STEP 3 — AI AGENT RECOMMENDATION
                </span>
              </div>
              <h4 className="text-base font-extrabold text-foreground">
                AI Agent recommends: <strong className="text-purple-950 dark:text-purple-100">{selectedPlanObj.name}</strong>
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                {aiEvaluation?.reason ||
                  `Selected ${selectedPlanObj.name} (₹${selectedPlanObj.price.toLocaleString()}) derived dynamically from live catalog pricing with ${selectedPlanObj.save_percent}% monthly savings.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Prepare Purchase Proposal */}
      <div className="flex flex-col gap-3 rounded-2xl border border-purple-200/80 bg-muted/30 p-5 dark:border-purple-900/40">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-extrabold text-foreground">
              STEP 4 — Construct Bounded Purchase Proposal
            </h4>
            <p className="text-xs text-muted-foreground">
              Calls <code>POST /api/v1/agent/checkout/proposal</code> to lock server pricing.
            </p>
          </div>
          <Button
            onClick={handlePrepareProposal}
            isLoading={isCreatingProposal}
            disabled={!selectedPlanId}
            data-testid="prepare-proposal-btn"
            className="bg-[#3b1254] hover:bg-[#2e0e42] text-white rounded-xl text-xs font-extrabold px-5 shadow-md"
          >
            <span>Prepare Proposal</span>
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>

        {proposal && (
          <div
            data-testid="proposal-preview-card"
            className="mt-2 rounded-xl border border-emerald-300 bg-white p-4 shadow-sm dark:border-emerald-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300">
                PROPOSAL ID: {proposal.proposal_id}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                STATUS: {proposal.status}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Plan:</span>
                <p className="font-extrabold text-foreground">{proposal.plan_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Original:</span>
                <p className="font-semibold line-through text-muted-foreground">₹{proposal.original_price}</p>
              </div>
              <div>
                <span className="text-muted-foreground">AI Savings:</span>
                <p className="font-extrabold text-emerald-600 dark:text-emerald-400">-₹{proposal.savings_amount}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Final Payable:</span>
                <p className="font-black text-purple-900 dark:text-purple-200">₹{proposal.final_price}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STEP 5: HUMAN SAFETY GATE */}
      <div className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="size-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-extrabold text-amber-950 dark:text-amber-100">
                STEP 5 — HUMAN SAFETY GATE (Mandatory Consent)
              </h4>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-medium">
                AI cannot approve or charge. The member must explicitly review and authorize payment.
              </p>
            </div>
          </div>

          <Button
            onClick={() => setIsApprovalModalOpen(true)}
            disabled={!proposal}
            data-testid="open-approval-modal-btn"
            className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black px-6 shadow-md shrink-0"
          >
            <span>Review & Approve Purchase</span>
          </Button>
        </div>
      </div>

      {/* AICheckoutApprovalModal Integration */}
      <AICheckoutApprovalModal
        isOpen={isApprovalModalOpen}
        proposal={proposal}
        isLoading={isApproving}
        onApprove={handleApproveProposal}
        onCancel={() => setIsApprovalModalOpen(false)}
      />
    </div>
  );
}
