import type { BurstProtectionRow, TargetCpaRow } from '@/lib/db/types';
import { startOfDay, differenceInDays } from 'date-fns';

export interface DailyMetrics {
  date: Date;
  avgDepletionRate: number;
  macAvg: number;
  totalSpikes: number;
  totalBlocking: number;
  accountsBlocked: number;
  accountsTracked: number;
}

export interface AccountSummary {
  advertiser_id: number;
  description: string;
  feature_date: Date;
  daysActive: number;
  avgDepletionRate: number;
  macAvg: number;
  totalSpikes: number;
  blockingDays: number;
  blockingRate: number;
  totalBlockingAmount: number;
}

export function aggregateByDay(data: BurstProtectionRow[]): DailyMetrics[] {
  const dayMap = new Map<string, BurstProtectionRow[]>();

  // Group by date
  data.forEach(row => {
    const dateKey = startOfDay(row.data_timestamp_by_request_time).toISOString();
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
    }
    dayMap.get(dateKey)!.push(row);
  });

  // Calculate daily metrics
  return Array.from(dayMap.entries()).map(([dateKey, rows]) => {
    const validDepletionRates = rows
      .filter(r => r.avg_depletion_rate !== null)
      .map(r => r.avg_depletion_rate!);

    const validMacAvgs = rows
      .filter(r => r.mac_avg !== null && r.mac_avg !== undefined)
      .map(r => r.mac_avg!);

    const totalSpikes = rows.reduce(
      (sum, r) => sum + (r.spikes_count || 0),
      0
    );

    const totalBlocking = rows.reduce(
      (sum, r) => sum + (r.amount_of_blocking || 0),
      0
    );

    const accountsBlocked = rows.filter(
      r => r.blocking_status === 'BLOCKED'
    ).length;

    const uniqueAccounts = new Set(rows.map(r => r.advertiser_id)).size;

    return {
      date: new Date(dateKey),
      avgDepletionRate: validDepletionRates.length > 0
        ? validDepletionRates.reduce((a, b) => a + b, 0) / validDepletionRates.length
        : 0,
      macAvg: validMacAvgs.length > 0
        ? validMacAvgs.reduce((a, b) => a + b, 0) / validMacAvgs.length
        : 0,
      totalSpikes,
      totalBlocking,
      accountsBlocked,
      accountsTracked: uniqueAccounts,
    };
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function aggregateByAccount(data: BurstProtectionRow[]): AccountSummary[] {
  const accountMap = new Map<number, BurstProtectionRow[]>();

  // Group by advertiser
  data.forEach(row => {
    if (!accountMap.has(row.advertiser_id)) {
      accountMap.set(row.advertiser_id, []);
    }
    accountMap.get(row.advertiser_id)!.push(row);
  });

  // Calculate account summaries
  return Array.from(accountMap.entries()).map(([advertiserId, rows]) => {
    const validDepletionRates = rows
      .filter(r => r.avg_depletion_rate !== null)
      .map(r => r.avg_depletion_rate!);

    const validMacAvgs = rows
      .filter(r => r.mac_avg !== null && r.mac_avg !== undefined)
      .map(r => r.mac_avg!);

    const totalSpikes = rows.reduce(
      (sum, r) => sum + (r.spikes_count || 0),
      0
    );

    const blockingDays = rows.filter(
      r => r.blocking_status === 'BLOCKED'
    ).length;

    const totalBlockingAmount = rows.reduce(
      (sum, r) => sum + (r.amount_of_blocking || 0),
      0
    );

    const firstRow = rows[0];
    const dates = rows.map(r => r.data_timestamp_by_request_time);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const daysActive = differenceInDays(maxDate, minDate) + 1;

    return {
      advertiser_id: advertiserId,
      description: firstRow.description,
      feature_date: firstRow.feature_date,
      daysActive,
      avgDepletionRate: validDepletionRates.length > 0
        ? validDepletionRates.reduce((a, b) => a + b, 0) / validDepletionRates.length
        : 0,
      macAvg: validMacAvgs.length > 0
        ? validMacAvgs.reduce((a, b) => a + b, 0) / validMacAvgs.length
        : 0,
      totalSpikes,
      blockingDays,
      blockingRate: rows.length > 0 ? (blockingDays / rows.length) * 100 : 0,
      totalBlockingAmount,
    };
  }).sort((a, b) => b.avgDepletionRate - a.avgDepletionRate);
}

export interface TargetCpaDailyMetrics {
  date: Date;
  campaignCount: number;
  avgSimulatorPointer: number;
  avgBidReductionPointer: number;
  avgDifferencePercentage: number;
  campaignsWithBoth: number;
}

export interface TargetCpaByPhase {
  phase: string;
  count: number;
  avgSimulator: number;
  avgBidReduction: number;
  avgDifference: number;
}

export interface TargetCpaByMode {
  mode: string;
  count: number;
  avgSimulator: number;
  avgBidReduction: number;
  avgDifference: number;
}

export function aggregateTargetCpaByDay(data: TargetCpaRow[]): TargetCpaDailyMetrics[] {
  const dayMap = new Map<string, TargetCpaRow[]>();

  data.forEach(row => {
    const dateKey = startOfDay(row.update_time).toISOString();
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
    }
    dayMap.get(dateKey)!.push(row);
  });

  return Array.from(dayMap.entries()).map(([dateKey, rows]) => {
    const campaignsWithBoth = rows.filter(
      r => r.simulator_pointer !== null && r.bid_reduction_pointer !== null
    );

    const validSimulator = rows.filter(r => r.simulator_pointer !== null);
    const validBidReduction = rows.filter(r => r.bid_reduction_pointer !== null);
    const validDifference = rows.filter(r => r.difference_percentage !== null);

    const avgSimulatorPointer = validSimulator.length > 0
      ? validSimulator.reduce((sum, r) => sum + (r.simulator_pointer || 0), 0) / validSimulator.length
      : 0;

    const avgBidReductionPointer = validBidReduction.length > 0
      ? validBidReduction.reduce((sum, r) => sum + (r.bid_reduction_pointer || 0), 0) / validBidReduction.length
      : 0;

    const avgDifferencePercentage = validDifference.length > 0
      ? validDifference.reduce((sum, r) => sum + (r.difference_percentage || 0), 0) / validDifference.length
      : 0;

    return {
      date: new Date(dateKey),
      campaignCount: new Set(rows.map(r => r.campaign_id)).size,
      avgSimulatorPointer,
      avgBidReductionPointer,
      avgDifferencePercentage,
      campaignsWithBoth: new Set(campaignsWithBoth.map(r => r.campaign_id)).size,
    };
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function aggregateTargetCpaByPhase(data: TargetCpaRow[]): TargetCpaByPhase[] {
  const phaseMap = new Map<string, TargetCpaRow[]>();

  data.forEach(row => {
    if (!phaseMap.has(row.phase)) {
      phaseMap.set(row.phase, []);
    }
    phaseMap.get(row.phase)!.push(row);
  });

  return Array.from(phaseMap.entries()).map(([phase, rows]) => {
    const validSimulator = rows.filter(r => r.simulator_pointer !== null);
    const validBidReduction = rows.filter(r => r.bid_reduction_pointer !== null);
    const validDifference = rows.filter(r => r.difference_percentage !== null);

    const avgSimulator = validSimulator.length > 0
      ? validSimulator.reduce((sum, r) => sum + (r.simulator_pointer || 0), 0) / validSimulator.length
      : 0;

    const avgBidReduction = validBidReduction.length > 0
      ? validBidReduction.reduce((sum, r) => sum + (r.bid_reduction_pointer || 0), 0) / validBidReduction.length
      : 0;

    const avgDifference = validDifference.length > 0
      ? validDifference.reduce((sum, r) => sum + (r.difference_percentage || 0), 0) / validDifference.length
      : 0;

    return {
      phase,
      count: new Set(rows.map(r => r.campaign_id)).size,
      avgSimulator,
      avgBidReduction,
      avgDifference,
    };
  }).sort((a, b) => b.count - a.count);
}

export function aggregateTargetCpaByMode(data: TargetCpaRow[]): TargetCpaByMode[] {
  const modeMap = new Map<string, TargetCpaRow[]>();

  data.forEach(row => {
    const mode = row.mode || 'null';
    if (!modeMap.has(mode)) {
      modeMap.set(mode, []);
    }
    modeMap.get(mode)!.push(row);
  });

  return Array.from(modeMap.entries()).map(([mode, rows]) => {
    const validSimulator = rows.filter(r => r.simulator_pointer !== null);
    const validBidReduction = rows.filter(r => r.bid_reduction_pointer !== null);
    const validDifference = rows.filter(r => r.difference_percentage !== null);

    const avgSimulator = validSimulator.length > 0
      ? validSimulator.reduce((sum, r) => sum + (r.simulator_pointer || 0), 0) / validSimulator.length
      : 0;

    const avgBidReduction = validBidReduction.length > 0
      ? validBidReduction.reduce((sum, r) => sum + (r.bid_reduction_pointer || 0), 0) / validBidReduction.length
      : 0;

    const avgDifference = validDifference.length > 0
      ? validDifference.reduce((sum, r) => sum + (r.difference_percentage || 0), 0) / validDifference.length
      : 0;

    return {
      mode,
      count: new Set(rows.map(r => r.campaign_id)).size,
      avgSimulator,
      avgBidReduction,
      avgDifference,
    };
  }).sort((a, b) => b.count - a.count);
}
