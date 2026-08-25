import { apiGet } from '@/lib/api';

import type { AgentCatalogResponse } from './types';

export async function fetchAgentCatalog(limit: number = 100): Promise<AgentCatalogResponse> {
  return apiGet<AgentCatalogResponse>(`/agent/catalog?limit=${limit}`);
}
