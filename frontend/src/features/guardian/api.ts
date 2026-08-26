import { apiGet, apiPost, apiPut } from '@/lib/api';

export interface AutopayPolicy {
  id: string;
  guardian_id: string;
  member_id: string;
  enabled: boolean;
  per_transaction_cap: number;
  monthly_spending_cap: number;
  allowed_charge_types: string[];
}

export interface AutopayApproveRequest {
  member_id: string;
  charge_id: string;
}

export interface AutopayApproveResponse {
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  member_id: string;
  charge_id: string;
  label: string;
}

export interface AutopayAutonomousResponse {
  success: boolean;
  payment_id: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  amount: number;
  loan_id: string;
  member_id: string;
  guardian_id: string;
  label: string;
}

export interface AutopayDemoLoansResponse {
  within_cap_loan_id: string;
  within_cap_amount: number;
  over_cap_loan_id: string;
  over_cap_amount: number;
  child_id: string;
  child_name: string;
  per_transaction_cap: number;
  monthly_spending_cap: number;
}

export async function getAutopayPolicy(childId: string, token?: string): Promise<AutopayPolicy> {
  return apiGet<AutopayPolicy>(`/guardian/autopay/policy/${childId}`, token);
}

export async function updateAutopayPolicy(
  childId: string,
  updates: Partial<Pick<AutopayPolicy, 'enabled' | 'per_transaction_cap' | 'monthly_spending_cap'>>,
  token?: string
): Promise<AutopayPolicy> {
  return apiPut<AutopayPolicy>(`/guardian/autopay/policy/${childId}`, updates, token || '');
}

export async function approveAutopayCharge(
  payload: AutopayApproveRequest,
  token?: string
): Promise<AutopayApproveResponse> {
  return apiPost<AutopayApproveResponse>('/guardian/autopay/approve', payload, token);
}

export async function executeAutonomousAutopay(
  loanId: string,
  token?: string
): Promise<AutopayAutonomousResponse> {
  return apiPost<AutopayAutonomousResponse>(
    '/guardian/autopay/execute-autonomous',
    { loan_id: loanId },
    token
  );
}

export async function getAutopayDemoLoans(token?: string): Promise<AutopayDemoLoansResponse> {
  return apiGet<AutopayDemoLoansResponse>('/guardian/autopay/demo-loans', token);
}

