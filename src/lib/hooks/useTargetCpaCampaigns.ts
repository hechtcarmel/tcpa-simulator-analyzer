import { useQuery } from '@tanstack/react-query';
import type { TargetCpaFilters, TargetCpaCampaign } from '@/lib/db/types';

interface TargetCpaCampaignsResponse {
  campaigns: TargetCpaCampaign[];
  metadata: {
    total_campaigns: number;
    query_time_ms: number;
    filters_applied: Record<string, boolean>;
  };
  cached?: boolean;
}

export function useTargetCpaCampaigns(filters: Pick<TargetCpaFilters, 'startDate' | 'endDate' | 'phase' | 'mode'>) {
  return useQuery({
    queryKey: ['target-cpa-campaigns', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.phase) params.set('phase', filters.phase);
      if (filters.mode) params.set('mode', filters.mode);

      const response = await fetch(`/api/target-cpa/campaigns?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch Target CPA campaigns');
      }

      return response.json() as Promise<TargetCpaCampaignsResponse>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}
