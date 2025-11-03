import { useQuery } from '@tanstack/react-query';
import type { TargetCpaFilters, TargetCpaRow } from '@/lib/db/types';

interface TargetCpaDataResponse {
  data: TargetCpaRow[];
  metadata: {
    total_rows: number;
    query_time_ms: number;
    sql?: string;
    filters_applied: Record<string, boolean>;
  };
  cached?: boolean;
}

export function useTargetCpaData(filters: TargetCpaFilters) {
  return useQuery({
    queryKey: ['target-cpa', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.campaignId) params.set('campaignId', filters.campaignId.toString());
      if (filters.phase) params.set('phase', filters.phase);
      if (filters.mode) params.set('mode', filters.mode);
      if (filters.onlyWithBothPointers) params.set('onlyWithBothPointers', 'true');
      if (filters.page) params.set('page', filters.page.toString());
      if (filters.limit) params.set('limit', filters.limit.toString());

      const response = await fetch(`/api/target-cpa?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch Target CPA data');
      }

      return response.json() as Promise<TargetCpaDataResponse>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}
