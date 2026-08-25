export interface AgentMerchantInfo {
  name: string;
  description: string;
  currency: string;
  supported_capabilities: string[];
}

export interface AgentMembershipPlan {
  id: string;
  plan_id: string;
  name: string;
  months: number;
  price: number;
  currency: string;
  availability: string;
  save_percent: number;
  badge?: string | null;
}

export interface AgentCatalogBook {
  id: string;
  title: string;
  author: string;
  category: string;
  isbn?: string | null;
  total_copies: number;
  available_copies: number;
  availability: 'in_stock' | 'out_of_stock';
  average_rating?: number | null;
  review_count: number;
  applicable_plans?: string[];
}

export interface AgentCouponItem {
  code: string;
  discount_percent: number;
  max_uses: number;
  uses_count: number;
  available: boolean;
}

export interface AgentCatalogMeta {
  generated_at: string;
  total_books: number;
  total_plans: number;
  total_coupons: number;
  schema_version: string;
}

export interface AgentCatalogResponse {
  merchant: AgentMerchantInfo;
  membership_plans: AgentMembershipPlan[];
  catalog: AgentCatalogBook[];
  active_coupons: AgentCouponItem[];
  meta: AgentCatalogMeta;
}
