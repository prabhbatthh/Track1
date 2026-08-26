export interface UpsellPlanInfo {
  plan_id: string;
  name: string;
  months: number;
  price: number;
  currency: string;
  save_percent: number;
}

export interface UpsellEvaluateRequest {
  current_plan_id?: string;
  current_plan_months?: number;
}

export interface UpsellEvaluateResponse {
  eval_id?: string;
  eligible: boolean;
  current_plan?: UpsellPlanInfo | null;
  recommended_plan?: UpsellPlanInfo | null;
  price_difference?: number | null;
  savings_percent?: number | null;
  reason: string;
  ai_generated: boolean;
}

export interface UpsellAcceptRequest {
  recommended_plan_id: string;
  current_plan_id: string;
  coupon_code?: string;
  eval_id?: string;
}

export interface UpsellAcceptResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  plan_id: string;
  plan_name: string;
  source: string;
}

export interface MemberUsageSignals {
  total_loans: number;
  active_loans: number;
  total_visits: number;
}

export interface AIAuditRecord {
  audit_id: string;
  eval_id: string;
  timestamp: string;
  current_plan?: UpsellPlanInfo | null;
  recommended_plan?: UpsellPlanInfo | null;
  usage_signals?: MemberUsageSignals | null;
  decision: string;
  reason_code: string;
  explanation: string;
  savings_amount?: number | null;
  savings_percent?: number | null;
  accepted: boolean;
  payment_initiated: boolean;
  payment_status: 'pending' | 'accepted' | 'initiated' | 'completed';
  order_id?: string | null;
}

export interface AIAuditTrailResponse {
  records: AIAuditRecord[];
}

export interface AgentCheckoutProposalRequest {
  plan_id: string;
  coupon_code?: string;
  agent_id?: string;
}

export interface AgentCheckoutProposalOut {
  proposal_id: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'COMPLETED' | 'EXPIRED';
  plan_id: string;
  plan_name: string;
  duration_months: number;
  original_price: number;
  final_price: number;
  savings_amount: number;
  savings_percent: number;
  currency: string;
  coupon_code?: string | null;
  expires_at: string;
  approval_url: string;
}

export interface AgentCheckoutApproveRequest {
  proposal_id: string;
}

export interface AgentCheckoutApproveOut {
  proposal_id: string;
  status: 'APPROVED';
  order_id: string;
  amount: number;
  currency: string;
  key_id?: string;
  plan_id: string;
  plan_name: string;
  source: string;
}


