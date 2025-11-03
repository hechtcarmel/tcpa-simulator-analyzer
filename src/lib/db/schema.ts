import { z } from 'zod';

// Target CPA schemas (optimized: removed 7 unused fields)
export const TargetCpaRowSchema = z.object({
  id: z.number().int().positive(),
  campaign_id: z.number().int().positive(),
  update_time: z.coerce.date(),
  phase: z.enum(['LEARNING', 'FEEDBACK_LOOP', 'EXITED']),
  mode: z.enum([
    'DEPLETION_POINTER',
    'BID_REDUCTION_POINTER',
    'SIMULATOR_BASED_POINTER',
    'BID_POINTER',
  ]).nullable(),
  simulator_pointer: z.number().nullable(),
  bid_reduction_pointer: z.number().nullable(),
  difference_percentage: z.number().nullable(),
});

export const TargetCpaDataSchema = z.array(TargetCpaRowSchema);

export const TargetCpaFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  campaignId: z.number().int().positive().optional(),
  phase: z.enum(['LEARNING', 'FEEDBACK_LOOP', 'EXITED']).optional(),
  mode: z.enum([
    'DEPLETION_POINTER',
    'BID_REDUCTION_POINTER',
    'SIMULATOR_BASED_POINTER',
    'BID_POINTER',
  ]).optional(),
  onlyWithBothPointers: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
});

export const TargetCpaMetricsSchema = z.object({
  totalCampaigns: z.number().int().nonnegative(),
  campaignsWithBothPointers: z.number().int().nonnegative(),
  avgSimulatorPointer: z.number(),
  avgBidReductionPointer: z.number(),
  avgDifferencePercentage: z.number(),
  phaseDistribution: z.record(z.string(), z.number()),
  modeDistribution: z.record(z.string(), z.number()),
});

export const PhaseDistributionSchema = z.object({
  phase: z.string(),
  count: z.number().int(),
  avgSimulator: z.number().nullable(),
  avgBidReduction: z.number().nullable(),
});

export const ModeDistributionSchema = z.object({
  mode: z.string(),
  count: z.number().int(),
  avgSimulator: z.number().nullable(),
  avgBidReduction: z.number().nullable(),
});
