import { executeQuery } from './vertica';
import { TargetCpaRowSchema } from './schema';
import type { TargetCpaRow, TargetCpaFilters, TargetCpaMetrics } from './types';

export async function getTargetCpaData(
  filters?: TargetCpaFilters
): Promise<{ data: TargetCpaRow[]; sql: string }> {
  const startTime = Date.now();

  const dateCondition = filters?.startDate && filters?.endDate
    ? `AND update_time >= '${filters.startDate}' AND update_time <= '${filters.endDate}'`
    : '';

  const campaignCondition = filters?.campaignId
    ? `AND campaign_id = ${filters.campaignId}`
    : '';

  const phaseCondition = filters?.phase
    ? `AND phase = '${filters.phase}'`
    : '';

  const modeCondition = filters?.mode
    ? `AND mode = '${filters.mode}'`
    : '';

  const bothPointersCondition = filters?.onlyWithBothPointers
    ? `AND simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL`
    : '';

  const limit = filters?.limit || 100;
  const offset = filters?.page ? (filters.page - 1) * limit : 0;

  // Optimized query: only fetch fields actually used in UI (removed 7 unused fields)
  const query = `
    SELECT
      id,
      campaign_id,
      update_time,
      phase,
      mode,
      simulator_pointer,
      bid_reduction_pointer,
      CASE
        WHEN bid_reduction_pointer IS NOT NULL
          AND bid_reduction_pointer != 0
          AND simulator_pointer IS NOT NULL
        THEN ROUND(
          ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100,
          2
        )
        ELSE NULL
      END AS difference_percentage
    FROM trc.target_cpa_campaigns_configurations
    WHERE 1=1
      ${dateCondition}
      ${campaignCondition}
      ${phaseCondition}
      ${modeCondition}
      ${bothPointersCondition}
    ORDER BY update_time DESC, COALESCE(difference_percentage, -999999) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  console.log('Executing Target CPA query with filters:', {
    dateRange: filters?.startDate && filters?.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : 'all dates',
    campaignId: filters?.campaignId,
    phase: filters?.phase,
    mode: filters?.mode,
    onlyWithBothPointers: filters?.onlyWithBothPointers,
  });

  const rawData = await executeQuery(query);

  const queryTime = Date.now() - startTime;
  console.log(`Target CPA query completed in ${queryTime}ms, returned ${rawData.length} rows`);

  const data = rawData.map(row => {
    try {
      return TargetCpaRowSchema.parse(row);
    } catch (error) {
      console.error('Row validation error:', error, row);
      throw error;
    }
  });

  return { data, sql: query.trim() };
}

export async function getTargetCpaMetrics(
  filters?: TargetCpaFilters
): Promise<TargetCpaMetrics> {
  const startTime = Date.now();

  const dateCondition = filters?.startDate && filters?.endDate
    ? `AND update_time >= '${filters.startDate}' AND update_time <= '${filters.endDate}'`
    : '';

  const campaignCondition = filters?.campaignId
    ? `AND campaign_id = ${filters.campaignId}`
    : '';

  const phaseCondition = filters?.phase
    ? `AND phase = '${filters.phase}'`
    : '';

  const modeCondition = filters?.mode
    ? `AND mode = '${filters.mode}'`
    : '';

  const bothPointersCondition = filters?.onlyWithBothPointers
    ? `AND simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL`
    : '';

  // Combined query: metrics + phase distribution + mode distribution in one DB call
  const query = `
    WITH filtered_data AS (
      SELECT
        campaign_id,
        update_time,
        phase,
        mode,
        simulator_pointer,
        bid_reduction_pointer,
        CASE
          WHEN bid_reduction_pointer IS NOT NULL
            AND bid_reduction_pointer != 0
            AND simulator_pointer IS NOT NULL
          THEN ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100
          ELSE NULL
        END AS difference_percentage
      FROM trc.target_cpa_campaigns_configurations
      WHERE 1=1
        ${dateCondition}
        ${campaignCondition}
        ${phaseCondition}
        ${modeCondition}
        ${bothPointersCondition}
    ),
    main_metrics AS (
      SELECT
        COUNT(DISTINCT campaign_id) AS total_campaigns,
        COUNT(DISTINCT CASE WHEN simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL THEN campaign_id END) AS campaigns_with_both,
        AVG(simulator_pointer) AS avg_simulator_pointer,
        AVG(bid_reduction_pointer) AS avg_bid_reduction_pointer,
        AVG(difference_percentage) AS avg_difference_percentage
      FROM filtered_data
    ),
    phase_dist AS (
      SELECT
        phase,
        COUNT(DISTINCT campaign_id) AS count
      FROM filtered_data
      GROUP BY phase
    ),
    mode_dist AS (
      SELECT
        COALESCE(mode, 'null') AS mode,
        COUNT(DISTINCT campaign_id) AS count
      FROM filtered_data
      GROUP BY mode
    )
    SELECT
      m.total_campaigns,
      m.campaigns_with_both,
      m.avg_simulator_pointer,
      m.avg_bid_reduction_pointer,
      m.avg_difference_percentage,
      p.phase AS phase_name,
      p.count AS phase_count,
      mo.mode AS mode_name,
      mo.count AS mode_count
    FROM main_metrics m
    CROSS JOIN phase_dist p
    CROSS JOIN mode_dist mo
  `;

  console.log('Executing combined Target CPA metrics query (1 DB call)');

  const result = await executeQuery<{
    total_campaigns: number | string;
    campaigns_with_both: number | string;
    avg_simulator_pointer: number | string | null;
    avg_bid_reduction_pointer: number | string | null;
    avg_difference_percentage: number | string | null;
    phase_name: string;
    phase_count: number | string;
    mode_name: string;
    mode_count: number | string;
  }>(query);

  const queryTime = Date.now() - startTime;
  console.log(`Combined metrics query completed in ${queryTime}ms (saved 2 extra DB calls)`);

  // Extract main metrics from first row
  const firstRow = result[0];
  const mainMetrics = {
    totalCampaigns: Number(firstRow.total_campaigns) || 0,
    campaignsWithBothPointers: Number(firstRow.campaigns_with_both) || 0,
    avgSimulatorPointer: firstRow.avg_simulator_pointer !== null ? Number(firstRow.avg_simulator_pointer) : 0,
    avgBidReductionPointer: firstRow.avg_bid_reduction_pointer !== null ? Number(firstRow.avg_bid_reduction_pointer) : 0,
    avgDifferencePercentage: firstRow.avg_difference_percentage !== null ? Number(firstRow.avg_difference_percentage) : 0,
  };

  // Extract phase distribution (dedupe by phase)
  const phaseDistMap: Record<string, number> = {};
  const seenPhases = new Set<string>();
  for (const row of result) {
    if (!seenPhases.has(row.phase_name)) {
      phaseDistMap[row.phase_name] = Number(row.phase_count);
      seenPhases.add(row.phase_name);
    }
  }

  // Extract mode distribution (dedupe by mode)
  const modeDistMap: Record<string, number> = {};
  const seenModes = new Set<string>();
  for (const row of result) {
    if (!seenModes.has(row.mode_name)) {
      modeDistMap[row.mode_name] = Number(row.mode_count);
      seenModes.add(row.mode_name);
    }
  }

  return {
    ...mainMetrics,
    phaseDistribution: phaseDistMap,
    modeDistribution: modeDistMap,
  };
}
