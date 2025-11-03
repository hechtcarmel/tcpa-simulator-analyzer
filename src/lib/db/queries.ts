import { executeQuery } from './vertica';
import { BurstProtectionRowSchema, TargetCpaRowSchema } from './schema';
import type { BurstProtectionRow, QueryFilters, Campaign, TargetCpaRow, TargetCpaFilters, TargetCpaMetrics, PhaseDistribution, ModeDistribution, TargetCpaCampaign } from './types';
import { buildFilterCondition, buildDateRangeCondition } from './query-builder';

function buildFilteredQuery(filters?: QueryFilters): string {
  const advertiserFilter = filters?.advertiserId
    ? `AND ${buildFilterCondition('pc.publisher_id', filters.advertiserId)}`
    : '';

  const campaignFilter = filters?.campaignId
    ? `AND ${buildFilterCondition('actual.campaign_id', filters.campaignId)}`
    : '';

  const dateFilter = filters?.startDate && filters?.endDate
    ? `AND ${buildDateRangeCondition('actual.data_timestamp_by_request_time', filters.startDate, filters.endDate)}`
    : '';

  const dateFilterExpected = filters?.startDate && filters?.endDate
    ? `AND ${buildDateRangeCondition('expected.data_timestamp', filters.startDate, filters.endDate)}`
    : '';

  const dateFilterBlindspot = filters?.startDate && filters?.endDate
    ? `AND ${buildDateRangeCondition('b.data_timestamp', filters.startDate, filters.endDate)}`
    : '';

  const dateFilterSpikes = filters?.startDate && filters?.endDate
    ? `AND ${buildDateRangeCondition('r.spike_date_utc', filters.startDate, filters.endDate)}`
    : '';

  return `
WITH config_publishers AS (
  SELECT publisher_id, date(pc.update_time) AS feature_date
  FROM trc.publisher_config pc
  WHERE attribute = 'spending-burst-protection:is-enabled-for-publisher'
    AND publisher_id IS NOT NULL
    ${advertiserFilter}
),
accounts AS (
  SELECT
    coalesce(n.publisher_id, cp.publisher_id) AS advertiser_id,
    IF(network_owner IS NOT NULL, 'NETWORK LEVEL', 'ACCOUNT LEVEL') AS config_level,
    feature_date
  FROM config_publishers cp
  LEFT JOIN trc.networks n ON cp.publisher_id = n.network_owner
),
actual_spent AS (
  SELECT
    data_timestamp_by_request_time,
    account_id,
    campaign_id,
    sum(spent) AS sum_spent
  FROM reports.advertiser_dimensions_by_request_time_report_daily actual
  JOIN accounts a ON a.advertiser_id = actual.account_id
  WHERE actual.data_timestamp_by_request_time > a.feature_date - 14
    ${dateFilter}
    ${campaignFilter}
  GROUP BY data_timestamp_by_request_time, account_id, campaign_id
),
expected_spent AS (
  SELECT
    data_timestamp,
    advertiser_id,
    campaign_id,
    last_calculated_effective_daily_limit
  FROM reports.campaign_effective_daily_limit_calculations_report_daily expected
  JOIN accounts a ON a.advertiser_id = expected.syndicator_id
  WHERE expected.data_timestamp > a.feature_date - 14
    ${dateFilterExpected}
),
campaign_data AS (
  SELECT
    data_timestamp_by_request_time,
    a.account_id,
    a.campaign_id,
    c.cpc_optimization_sub_type,
    a.sum_spent,
    e.last_calculated_effective_daily_limit,
    100 * a.sum_spent / e.last_calculated_effective_daily_limit AS depletion_rate,
    ac.feature_date
  FROM actual_spent a
  LEFT JOIN expected_spent e ON e.campaign_id = a.campaign_id
    AND a.data_timestamp_by_request_time = e.data_timestamp
  LEFT JOIN accounts ac ON ac.advertiser_id = a.account_id
  JOIN trc.sp_campaign_details_v2 c ON c.id = a.campaign_id
),
account_data AS (
  SELECT
    data_timestamp_by_request_time,
    account_id,
    COALESCE(AVG(CASE WHEN cpc_optimization_sub_type = 'MAX_CONVERSIONS' THEN depletion_rate END), 0) AS mac_avg,
    AVG(depletion_rate) AS avg_depletion_rate
  FROM campaign_data
  GROUP BY data_timestamp_by_request_time, account_id
),
blocking_data AS (
  SELECT
    data_timestamp,
    syndicator_id,
    SUM(VALUE) AS amount_of_blocking
  FROM reports.blindspot_v5 b
  JOIN accounts a ON a.advertiser_id = b.syndicator_id
  WHERE cell_name = 'SPENDING_BURST_PROTECTION_FILTER'
    AND b.data_timestamp > feature_date - 1
    ${dateFilterBlindspot}
  GROUP BY data_timestamp, syndicator_id
),
spikes AS (
  SELECT
    advertiser_id,
    spike_date_utc,
    a.feature_date,
    SUM(CASE
      WHEN bidding_strategy_during_spike = 'MAX_CONVERSIONS' AND relative_to_budget_spike = 1 THEN 1
      WHEN bidding_strategy_during_spike = 'MAX_VALUE' AND relative_to_budget_spike = 1 THEN 1
      WHEN bidding_strategy_during_spike = 'TARGET_CPA'
        AND (relative_to_budget_spike = 1 OR relative_to_total_spend_spike = 1) THEN 1
      WHEN bidding_strategy_during_spike = 'SMART' AND relative_to_total_spend_spike = 1 THEN 1
      WHEN bidding_strategy_during_spike = 'FIXED' AND relative_to_total_spend_spike = 1 THEN 1
      ELSE 0
    END) AS spikes_count
  FROM reports_internal.sp_campaigns_spikes_report r
  JOIN accounts a ON a.advertiser_id = r.syndicator_id
  WHERE r.spike_date_utc > a.feature_date - 14
    ${dateFilterSpikes}
  GROUP BY spike_date_utc, advertiser_id, a.feature_date
)
SELECT
  p.description,
  a.advertiser_id,
  ad.data_timestamp_by_request_time,
  a.feature_date,
  ad.avg_depletion_rate,
  ad.mac_avg,
  s.spikes_count,
  bd.amount_of_blocking,
  CASE WHEN bd.amount_of_blocking IS NOT NULL AND bd.amount_of_blocking > 0 THEN 'BLOCKED' ELSE 'NOT BLOCKED' END AS blocking_status
FROM accounts a
JOIN trc.publishers p ON p.id = a.advertiser_id
LEFT JOIN account_data ad ON ad.account_id = a.advertiser_id
LEFT JOIN blocking_data bd ON bd.syndicator_id = ad.account_id
  AND ad.data_timestamp_by_request_time = bd.data_timestamp
LEFT JOIN spikes s ON s.advertiser_id = ad.account_id
  AND ad.data_timestamp_by_request_time = s.spike_date_utc
`;
}

export async function getBurstProtectionData(
  filters?: QueryFilters
): Promise<BurstProtectionRow[]> {
  // Build query with filters in CTEs for performance
  let query = buildFilteredQuery(filters);

  // Add ORDER BY
  query += ` ORDER BY a.advertiser_id, ad.data_timestamp_by_request_time`;

  // Add pagination
  if (filters?.limit) {
    query += ` LIMIT ${filters.limit}`;

    if (filters?.page && filters.page > 1) {
      query += ` OFFSET ${(filters.page - 1) * filters.limit}`;
    }
  }

  console.log('Executing optimized query with filters:', {
    advertiserId: filters?.advertiserId,
    dateRange: `${filters?.startDate} to ${filters?.endDate}`
  });

  const rawData = await executeQuery(query);

  // Validate and transform each row
  return rawData.map(row => {
    try {
      return BurstProtectionRowSchema.parse(row);
    } catch (error) {
      console.error('Row validation error:', error, row);
      throw error;
    }
  });
}

export async function getAdvertisersList(): Promise<{
  id: number;
  description: string;
  feature_date: Date;
}[]> {
  const query = `
    SELECT DISTINCT
      a.advertiser_id as id,
      p.description,
      a.feature_date
    FROM (
      SELECT
        coalesce(n.publisher_id, pc.publisher_id) AS advertiser_id,
        date(pc.update_time) AS feature_date
      FROM trc.publisher_config pc
      LEFT JOIN trc.networks n ON pc.publisher_id = n.network_owner
      WHERE pc.attribute = 'spending-burst-protection:is-enabled-for-publisher'
        AND pc.publisher_id IS NOT NULL
    ) a
    JOIN trc.publishers p ON p.id = a.advertiser_id
    ORDER BY p.description
  `;

  const result = await executeQuery<{ id: number; description: string; feature_date: string | Date }>(query);
  return result.map(row => ({
    id: row.id,
    description: row.description,
    feature_date: new Date(row.feature_date),
  }));
}

export async function getCampaignsList(filters?: {
  advertiserId?: number;
  startDate?: string;
  endDate?: string;
}): Promise<Campaign[]> {
  const startTime = Date.now();

  let query: string;

  if (!filters?.advertiserId) {
    throw new Error('advertiserId is required for getCampaignsList');
  }

  const advertiserCondition = buildFilterCondition('c.syndicator_id', filters.advertiserId);

  if (filters?.startDate && filters?.endDate) {
    const dateRangeCondition = buildDateRangeCondition(
      'a.data_timestamp_by_request_time',
      filters.startDate,
      filters.endDate
    );

    query = `
      SELECT DISTINCT
        c.id,
        c.name,
        c.syndicator_id as advertiser_id,
        c.status
      FROM trc.sp_campaigns c
      WHERE ${advertiserCondition}
        AND EXISTS (
          SELECT 1
          FROM reports.advertiser_dimensions_by_request_time_report_daily a
          WHERE a.campaign_id = c.id
            AND ${buildFilterCondition('a.account_id', filters.advertiserId)}
            AND ${dateRangeCondition}
          LIMIT 1
        )
      ORDER BY c.name
    `;
  } else {
    query = `
      SELECT DISTINCT
        c.id,
        c.name,
        c.syndicator_id as advertiser_id,
        c.status
      FROM trc.sp_campaigns c
      WHERE ${advertiserCondition}
      ORDER BY c.name
    `;
  }

  console.log('Executing optimized campaigns query with filters:', {
    advertiserId: filters.advertiserId,
    dateRange: filters.startDate && filters.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : 'all campaigns',
    useExistsFilter: !!(filters.startDate && filters.endDate)
  });

  const result = await executeQuery<{
    id: number;
    name: string;
    advertiser_id: number;
    status?: string;
  }>(query);

  const queryTime = Date.now() - startTime;
  console.log(`Campaigns query completed in ${queryTime}ms, returned ${result.length} campaigns`);

  return result.map(row => ({
    id: row.id,
    name: row.name,
    advertiser_id: row.advertiser_id,
    status: row.status,
  }));
}

export async function getBlockingWindows(filters?: {
  advertiserId?: number;
  campaignId?: number;
  startDate?: string;
  endDate?: string;
}): Promise<Array<{
  syndicator_id: number;
  campaign_id: number;
  start_time: Date;
  end_time: Date;
  avg_expected_hourly_spend: number | null;
  avg_current_period_spend: number | null;
  window_duration_minutes: number;
}>> {
  const startTime = Date.now();

  const advertiserCondition = filters?.advertiserId
    ? `AND ${buildFilterCondition('syndicator_id', filters.advertiserId)}`
    : '';

  const campaignCondition = filters?.campaignId
    ? `AND ${buildFilterCondition('campaign_id', filters.campaignId)}`
    : '';

  // Filter on actual window times - both start_time and end_time should be within the date range
  const dateCondition = filters?.startDate && filters?.endDate
    ? `AND ${buildDateRangeCondition('start_time', filters.startDate, filters.endDate)} AND ${buildDateRangeCondition('end_time', filters.startDate, filters.endDate)}`
    : '';

  const query = `
    SELECT
      syndicator_id,
      campaign_id,
      start_time,
      end_time,
      avg_expected_hourly_spend,
      avg_current_period_spend
    FROM reports_internal.spending_burst_protection_blocking_windows
    WHERE 1=1
      ${advertiserCondition}
      ${campaignCondition}
      ${dateCondition}
    ORDER BY campaign_id, start_time
  `;

  console.log('Executing blocking windows query with filters:', {
    advertiserId: filters?.advertiserId,
    campaignId: filters?.campaignId,
    dateRange: filters?.startDate && filters?.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : 'all dates',
  });

  const rawData = await executeQuery<{
    syndicator_id: number | string;
    campaign_id: number | string;
    start_time: string | Date;
    end_time: string | Date;
    avg_expected_hourly_spend: number | string | null;
    avg_current_period_spend: number | string | null;
  }>(query);

  const queryTime = Date.now() - startTime;
  console.log(`Blocking windows query completed in ${queryTime}ms, returned ${rawData.length} windows`);

  // Transform and calculate duration
  return rawData.map(row => {
    const startTime = new Date(row.start_time);
    const endTime = new Date(row.end_time);
    const durationMs = endTime.getTime() - startTime.getTime();
    const window_duration_minutes = durationMs / (1000 * 60);

    return {
      syndicator_id: Number(row.syndicator_id),
      campaign_id: Number(row.campaign_id),
      start_time: startTime,
      end_time: endTime,
      avg_expected_hourly_spend: row.avg_expected_hourly_spend !== null ? Number(row.avg_expected_hourly_spend) : null,
      avg_current_period_spend: row.avg_current_period_spend !== null ? Number(row.avg_current_period_spend) : null,
      window_duration_minutes,
    };
  });
}

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

export async function getCampaignsWithBothStrategies(
  filters?: Pick<TargetCpaFilters, 'startDate' | 'endDate' | 'phase' | 'mode'>
): Promise<TargetCpaCampaign[]> {
  const startTime = Date.now();

  const dateCondition = filters?.startDate && filters?.endDate
    ? `AND update_time >= '${filters.startDate}' AND update_time <= '${filters.endDate}'`
    : '';

  const phaseCondition = filters?.phase
    ? `AND phase = '${filters.phase}'`
    : '';

  const modeCondition = filters?.mode
    ? `AND mode = '${filters.mode}'`
    : '';

  const query = `
    SELECT
      campaign_id,
      MAX(update_time) AS last_update,
      MAX(phase) AS phase,
      MAX(mode) AS mode,
      MAX(simulator_pointer) AS simulator_pointer,
      MAX(bid_reduction_pointer) AS bid_reduction_pointer,
      CASE
        WHEN MAX(simulator_pointer) IS NOT NULL AND MAX(bid_reduction_pointer) IS NOT NULL
        THEN true
        ELSE false
      END AS has_both_pointers,
      CASE
        WHEN MAX(bid_reduction_pointer) IS NOT NULL
          AND MAX(bid_reduction_pointer) != 0
          AND MAX(simulator_pointer) IS NOT NULL
        THEN ROUND(
          ((MAX(simulator_pointer) - MAX(bid_reduction_pointer)) / MAX(bid_reduction_pointer)) * 100,
          2
        )
        ELSE NULL
      END AS difference_percentage
    FROM trc.target_cpa_campaigns_configurations
    WHERE simulator_pointer IS NOT NULL
      AND bid_reduction_pointer IS NOT NULL
      ${dateCondition}
      ${phaseCondition}
      ${modeCondition}
    GROUP BY campaign_id
    ORDER BY last_update DESC, COALESCE(difference_percentage, -999999) DESC
    LIMIT 1000
  `;

  console.log('Executing campaigns with both strategies query');

  const rawData = await executeQuery<{
    campaign_id: number | string;
    last_update: string | Date;
    phase: string;
    mode: string | null;
    has_both_pointers: boolean | string;
    simulator_pointer: number | string | null;
    bid_reduction_pointer: number | string | null;
    difference_percentage: number | string | null;
  }>(query);

  const queryTime = Date.now() - startTime;
  console.log(`Campaigns query completed in ${queryTime}ms, returned ${rawData.length} campaigns`);

  return rawData.map(row => ({
    campaign_id: Number(row.campaign_id),
    last_update: new Date(row.last_update),
    phase: row.phase,
    mode: row.mode,
    has_both_pointers: Boolean(row.has_both_pointers),
    simulator_pointer: row.simulator_pointer !== null ? Number(row.simulator_pointer) : null,
    bid_reduction_pointer: row.bid_reduction_pointer !== null ? Number(row.bid_reduction_pointer) : null,
    difference_percentage: row.difference_percentage !== null ? Number(row.difference_percentage) : null,
  }));
}

export async function getPhaseDistribution(
  filters?: Pick<TargetCpaFilters, 'startDate' | 'endDate' | 'mode'>
): Promise<PhaseDistribution[]> {
  const dateCondition = filters?.startDate && filters?.endDate
    ? `AND update_time >= '${filters.startDate}' AND update_time <= '${filters.endDate}'`
    : '';

  const modeCondition = filters?.mode
    ? `AND mode = '${filters.mode}'`
    : '';

  const query = `
    SELECT
      phase,
      COUNT(DISTINCT campaign_id) AS count,
      AVG(simulator_pointer) AS avg_simulator,
      AVG(bid_reduction_pointer) AS avg_bid_reduction
    FROM trc.target_cpa_campaigns_configurations
    WHERE 1=1
      ${dateCondition}
      ${modeCondition}
    GROUP BY phase
    ORDER BY count DESC
  `;

  const result = await executeQuery<{
    phase: string;
    count: number | string;
    avg_simulator: number | string | null;
    avg_bid_reduction: number | string | null;
  }>(query);

  return result.map(row => ({
    phase: row.phase,
    count: Number(row.count),
    avgSimulator: row.avg_simulator !== null ? Number(row.avg_simulator) : null,
    avgBidReduction: row.avg_bid_reduction !== null ? Number(row.avg_bid_reduction) : null,
  }));
}

export async function getModeDistribution(
  filters?: Pick<TargetCpaFilters, 'startDate' | 'endDate' | 'phase'>
): Promise<ModeDistribution[]> {
  const dateCondition = filters?.startDate && filters?.endDate
    ? `AND update_time >= '${filters.startDate}' AND update_time <= '${filters.endDate}'`
    : '';

  const phaseCondition = filters?.phase
    ? `AND phase = '${filters.phase}'`
    : '';

  const query = `
    SELECT
      COALESCE(mode, 'null') AS mode,
      COUNT(DISTINCT campaign_id) AS count,
      AVG(simulator_pointer) AS avg_simulator,
      AVG(bid_reduction_pointer) AS avg_bid_reduction
    FROM trc.target_cpa_campaigns_configurations
    WHERE 1=1
      ${dateCondition}
      ${phaseCondition}
    GROUP BY mode
    ORDER BY count DESC
  `;

  const result = await executeQuery<{
    mode: string;
    count: number | string;
    avg_simulator: number | string | null;
    avg_bid_reduction: number | string | null;
  }>(query);

  return result.map(row => ({
    mode: row.mode,
    count: Number(row.count),
    avgSimulator: row.avg_simulator !== null ? Number(row.avg_simulator) : null,
    avgBidReduction: row.avg_bid_reduction !== null ? Number(row.avg_bid_reduction) : null,
  }));
}

