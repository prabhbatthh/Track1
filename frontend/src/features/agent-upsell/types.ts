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
