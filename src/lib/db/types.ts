import type { z } from 'zod';
import type {
  TargetCpaRowSchema,
  TargetCpaDataSchema,
  TargetCpaFiltersSchema,
  TargetCpaMetricsSchema,
  PhaseDistributionSchema,
  ModeDistributionSchema,
} from './schema';

// Target CPA types
export type TargetCpaRow = z.infer<typeof TargetCpaRowSchema>;
export type TargetCpaData = z.infer<typeof TargetCpaDataSchema>;
export type TargetCpaFilters = z.infer<typeof TargetCpaFiltersSchema>;
export type TargetCpaMetrics = z.infer<typeof TargetCpaMetricsSchema>;
export type PhaseDistribution = z.infer<typeof PhaseDistributionSchema>;
export type ModeDistribution = z.infer<typeof ModeDistributionSchema>;
