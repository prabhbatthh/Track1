import { apiGet, apiPost } from '@/lib/api';

import type {
  AIAuditTrailResponse,
  UpsellAcceptRequest,
  UpsellAcceptResponse,
  UpsellEvaluateRequest,
  UpsellEvaluateResponse,
} from './types';

export async function evaluateUpsell(
  payload: UpsellEvaluateRequest,
  token?: string
): Promise<UpsellEvaluateResponse> {
  return apiPost<UpsellEvaluateResponse>('/agent/upsell/evaluate', payload, token);
}

export async function acceptUpsell(
  payload: UpsellAcceptRequest,
  token?: string
): Promise<UpsellAcceptResponse> {
  return apiPost<UpsellAcceptResponse>('/agent/upsell/accept', payload, token);
}

export async function fetchAIAuditTrail(token?: string): Promise<AIAuditTrailResponse> {
  return apiGet<AIAuditTrailResponse>('/agent/upsell/audit', token);
}

