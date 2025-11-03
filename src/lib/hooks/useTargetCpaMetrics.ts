import { useQuery } from '@tanstack/react-query';
import type { TargetCpaFilters, TargetCpaMetrics } from '@/lib/db/types';

interface TargetCpaMetricsResponse {
  metrics: TargetCpaMetrics;
  metadata: {
    query_time_ms: number;
    filters_applied: Record<string, boolean>;
  };
  cached?: boolean;
}

export function useTargetCpaMetrics(filters: TargetCpaFilters) {
  return useQuery({
    queryKey: ['target-cpa-metrics', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.campaignId) params.set('campaignId', filters.campaignId.toString());
      if (filters.phase) params.set('phase', filters.phase);
      if (filters.mode) params.set('mode', filters.mode);
      if (filters.onlyWithBothPointers) params.set('onlyWithBothPointers', 'true');

      const response = await fetch(`/api/target-cpa/metrics?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch Target CPA metrics');
      }

      return response.json() as Promise<TargetCpaMetricsResponse>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}
