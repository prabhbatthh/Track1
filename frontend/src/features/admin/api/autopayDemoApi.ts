import { apiGet, apiPost } from '@/lib/api';

export interface AdminAutopayDemoOverviewResponse {
  has_child: boolean;
  child_name: string;
  child_id: string;
  guardian_name: string;
  guardian_id: string;
  enabled?: boolean;
  trust_tier: 'HIGH' | 'BASELINE' | 'LOW';
  multiplier: number;
  on_time_return_rate: number;
  on_time_returns: number;
  total_returns: number;
  sample_size: number;
  per_transaction_cap: number;
  monthly_spending_cap: number;
  monthly_spent?: number;
  remaining_monthly_authority?: number;
  effective_transaction_cap: number;
  theoretical_cap?: number;
  hard_safety_ceiling: number;
  within_cap_loan_id?: string;
  within_cap_amount?: number;
  over_cap_loan_id?: string;
  over_cap_amount?: number;
  explanation: string;
}

export interface AdminAutopayDemoSimulateResponse {
  status: 'EXECUTED' | 'BLOCKED' | 'GATEWAY_FAILURE' | 'FAILED' | string;
  badge: string;
  amount: number;
  policy?: string;
  reason?: string;
  result: string;
  audit?: string;
  guardian_notification?: string;
  fine_status?: string;
  payment_id?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  message: string;
}

export interface AdminAutopayDemoAuditTrailItem {
  id: string;
  timestamp: string;
  action: string;
  actor_id: string;
  amount?: number;
  child_id?: string;
  child_name?: string;
  result: 'APPROVED' | 'BLOCKED' | 'FAILED' | 'INFO' | string;
  reason?: string;
}

export interface AdminAutopayDemoAuditTrailResponse {
  items: AdminAutopayDemoAuditTrailItem[];
}

export interface AdminAutopayDemoTrustSimulateResponse {
  status: string;
  action: string;
  previous_trust_tier: string;
  new_trust_tier: string;
  previous_effective_cap: number;
  new_effective_cap: number;
  multiplier: number;
  on_time_return_rate: number;
  effective_transaction_cap: number;
  reasoning: string;
  message: string;
}

export async function getAdminAutopayDemoOverview(token?: string): Promise<AdminAutopayDemoOverviewResponse> {
  return apiGet<AdminAutopayDemoOverviewResponse>('/admin/autopay-demo/overview', token);
}

export async function runAdminAutopayDemoScenario(
  scenario: 'within_limit' | 'boundary_100' | 'over_monthly_101' | 'over_limit' | 'custom' | 'simulate_failure',
  amount?: number,
  token?: string
): Promise<AdminAutopayDemoSimulateResponse> {
  return apiPost<AdminAutopayDemoSimulateResponse>('/admin/autopay-demo/simulate', { scenario, amount }, token);
}

export async function runAdminAutopayDemoTrustSimulation(
  action: 'responsible' | 'late' | 'reset',
  token?: string
): Promise<AdminAutopayDemoTrustSimulateResponse> {
  return apiPost<AdminAutopayDemoTrustSimulateResponse>('/admin/autopay-demo/simulate-trust', { action }, token);
}

export async function runAdminAutopayDemoMonthlySpendSimulation(
  action: 'simulate_900' | 'reset',
  token?: string
): Promise<any> {
  return apiPost('/admin/autopay-demo/simulate-monthly-spend', { action }, token);
}

export async function updateAdminAutopayDemoPolicy(
  payload: { enabled?: boolean; per_transaction_cap?: number },
  token?: string
): Promise<any> {
  return apiPost('/admin/autopay-demo/update-policy', payload, token);
}

export async function getAdminAutopayDemoAuditTrail(token?: string): Promise<AdminAutopayDemoAuditTrailResponse> {
  return apiGet<AdminAutopayDemoAuditTrailResponse>('/admin/autopay-demo/audit-trail', token);
}
