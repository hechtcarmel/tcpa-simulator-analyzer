import type { z } from 'zod';
import type {
  BurstProtectionRowSchema,
  BurstProtectionDataSchema,
  FilterParamsSchema,
  AdvertiserSchema,
  DateRangeSchema,
  CampaignSchema,
  TargetCpaRowSchema,
  TargetCpaDataSchema,
  TargetCpaFiltersSchema,
  TargetCpaMetricsSchema,
  PhaseDistributionSchema,
  ModeDistributionSchema,
} from './schema';

// Inferred types from schemas
export type BurstProtectionRow = z.infer<typeof BurstProtectionRowSchema>;
export type BurstProtectionData = z.infer<typeof BurstProtectionDataSchema>;
export type QueryFilters = z.infer<typeof FilterParamsSchema>;
export type Advertiser = z.infer<typeof AdvertiserSchema>;
export type DateRangeData = z.infer<typeof DateRangeSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;

// Extended types for internal use
export interface EnrichedBurstProtectionRow extends BurstProtectionRow {
  days_since_feature: number;
  is_pre_feature: boolean;
  depletion_rate_category: 'low' | 'medium' | 'high' | 'critical';
}

export interface QueryFiltersInternal extends QueryFilters {
  sortBy?: 'advertiser_id' | 'avg_depletion_rate' | 'spikes_count' | 'feature_date';
  sortOrder?: 'asc' | 'desc';
}

// Target CPA types
export type TargetCpaRow = z.infer<typeof TargetCpaRowSchema>;
export type TargetCpaData = z.infer<typeof TargetCpaDataSchema>;
export type TargetCpaFilters = z.infer<typeof TargetCpaFiltersSchema>;
export type TargetCpaMetrics = z.infer<typeof TargetCpaMetricsSchema>;
export type PhaseDistribution = z.infer<typeof PhaseDistributionSchema>;
export type ModeDistribution = z.infer<typeof ModeDistributionSchema>;

export interface TargetCpaCampaign {
  campaign_id: number;
  last_update: Date;
  phase: string;
  mode: string | null;
  has_both_pointers: boolean;
  simulator_pointer: number | null;
  bid_reduction_pointer: number | null;
  difference_percentage: number | null;
}

export interface StrategyMetrics {
  avgSimulatorPointer: number;
  avgBidReductionPointer: number;
  avgDifferencePercentage: number;
  simulatorWins: number;
  bidReductionWins: number;
  tied: number;
  totalComparisons: number;
}
