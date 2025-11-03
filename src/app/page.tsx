'use client';

import * as React from 'react';
import { useState, Suspense } from 'react';
import { format, subDays } from 'date-fns';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhaseSelect } from '@/components/filters/PhaseSelect';
import { ModeSelect } from '@/components/filters/ModeSelect';
import { useTargetCpaData } from '@/lib/hooks/useTargetCpaData';
import { useTargetCpaMetrics } from '@/lib/hooks/useTargetCpaMetrics';
import { getPhaseColor, getModeColor } from '@/lib/analytics/calculators';
import { TrendingUp, TrendingDown, Activity, Percent, Info, HelpCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { TargetCpaRow } from '@/lib/db/types';
import type { DateRange } from '@/types/filters';
import DateRangePicker from '@/components/filters/DateRangePicker';
import { CardSkeleton } from '@/components/loading/CardSkeleton';

type Phase = 'LEARNING' | 'FEEDBACK_LOOP' | 'EXITED';
type Mode = 'DEPLETION_POINTER' | 'BID_REDUCTION_POINTER' | 'SIMULATOR_BASED_POINTER' | 'BID_POINTER';

function getDifferenceColorClass(diff: number): string {
  const absDiff = Math.abs(diff);
  if (absDiff < 10) return 'text-green-600';
  if (absDiff < 50) return 'text-amber-600';
  return 'text-red-600';
}

function getCellDifferenceColor(diff: number | null): string {
  if (diff === null) return 'text-muted-foreground';
  const absDiff = Math.abs(diff);
  if (absDiff < 10) return 'text-green-600';
  if (absDiff < 50) return 'text-amber-600';
  return 'text-red-600';
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

function getPhaseBadgeVariant(phase: string): BadgeVariant {
  const color = getPhaseColor(phase);
  return color === 'info' ? 'default' : color === 'success' ? 'default' : 'secondary';
}

function getModeBadgeVariant(mode: string | null): BadgeVariant {
  if (!mode) return 'secondary';
  const color = getModeColor(mode);
  return color === 'purple' ? 'default' : color === 'warning' ? 'default' : 'secondary';
}

function TargetCpaDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({
    start: subDays(new Date(), 30),
    end: new Date(),
  });

  const [phase, setPhase] = useState<Phase | undefined>(undefined);
  const [mode, setMode] = useState<Mode | undefined>(undefined);
  const [onlyWithBothPointers, setOnlyWithBothPointers] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(100);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [dateRange, phase, mode, onlyWithBothPointers]);

  const filters = {
    startDate: format(dateRange.start, 'yyyy-MM-dd'),
    endDate: format(dateRange.end, 'yyyy-MM-dd'),
    phase: phase as Phase | undefined,
    mode: mode as Mode | undefined,
    onlyWithBothPointers,
    page,
    limit,
  };

  const { data: metricsResponse, isLoading: metricsLoading } = useTargetCpaMetrics(filters);
  const { data: dataResponse, isLoading: dataLoading } = useTargetCpaData(filters);

  const metrics = metricsResponse?.metrics;
  const campaigns = dataResponse?.data || [];
  const sqlQuery = dataResponse?.metadata?.sql;

  const [showSql, setShowSql] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Target CPA Analyzer
          </h1>
          <p className="text-muted-foreground">
            Compare bidding strategies (Simulator vs Bid Reduction) for Target CPA campaigns
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
              />
              <PhaseSelect value={phase} onChange={(val) => setPhase(val as Phase | undefined)} />
              <ModeSelect value={mode} onChange={(val) => setMode(val as Mode | undefined)} />
            </div>

            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <Switch
                id="both-strategies"
                checked={onlyWithBothPointers}
                onCheckedChange={setOnlyWithBothPointers}
              />
              <div className="flex-1">
                <Label htmlFor="both-strategies" className="flex items-center gap-2 cursor-pointer">
                  <span className="font-medium">Only Both Strategies</span>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, shows only campaigns that have BOTH simulator_pointer AND bid_reduction_pointer values.
                  This allows fair comparison between the two bidding strategies. When disabled, shows all campaigns
                  even if they only have one strategy value (may show incomplete comparisons).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {metricsLoading ? (
          <div className="text-center py-12">Loading metrics...</div>
        ) : metrics ? (
          <>
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HelpCircle className="h-4 w-4" />
                  How are these metrics calculated?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <div>
                  <strong className="text-blue-600">Difference % (Per-Campaign):</strong>
                  <code className="ml-2 text-xs bg-white dark:bg-slate-800 px-2 py-1 rounded">
                    ((simulator - bid_reduction) / bid_reduction) × 100
                  </code>
                  <p className="text-xs text-muted-foreground mt-1">
                    Calculated for <strong>each campaign individually</strong>, then averaged:
                    <br />
                    <strong>Positive value:</strong> Simulator is typically higher (per campaign)
                    <br />
                    <strong>Negative value:</strong> Bid Reduction is typically higher (per campaign)
                  </p>
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-900">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      <strong>⚠️ Important:</strong> Avg Difference can be positive while Avg Bid Reduction {'>'} Avg Simulator!
                      This happens because we calculate difference per campaign first, then average.
                      See UNDERSTANDING_AVERAGES.md for detailed explanation.
                    </p>
                  </div>
                </div>
                <div className="border-t pt-2">
                  <strong className="text-blue-600">Averages Calculation:</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong className="text-green-600">Important:</strong> All averages are calculated across ALL matching data in the database,
                    not just the paginated view. This ensures accurate statistics regardless of which page you&apos;re viewing.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Calculated in SQL using <code className="bg-white dark:bg-slate-800 px-1 rounded">AVG()</code> function:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 ml-4 space-y-1">
                    <li><strong>• Avg Simulator:</strong> <code className="bg-white dark:bg-slate-800 px-1 rounded">AVG(simulator_pointer)</code> - automatically ignores NULL values</li>
                    <li><strong>• Avg Bid Reduction:</strong> <code className="bg-white dark:bg-slate-800 px-1 rounded">AVG(bid_reduction_pointer)</code> - automatically ignores NULL values</li>
                    <li><strong>• Avg Difference %:</strong> <code className="bg-white dark:bg-slate-800 px-1 rounded">AVG(difference_percentage)</code> - only averages campaigns where both pointers exist</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    <strong>Impact of &quot;Only Both Strategies&quot; toggle:</strong> When enabled, the WHERE clause filters to campaigns with both pointers
                    before calculating averages, which can significantly change the results since it excludes campaigns with only one pointer type.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalCampaigns}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.campaignsWithBothPointers} with both strategies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Simulator</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {metrics.avgSimulatorPointer.toFixed(4)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Simulator pointer average
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Bid Reduction</CardTitle>
                <TrendingDown className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {metrics.avgBidReductionPointer.toFixed(4)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Bid reduction pointer average
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Difference</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  getDifferenceColorClass(metrics.avgDifferencePercentage)
                }`}>
                  {metrics.avgDifferencePercentage > 0 ? '+' : ''}
                  {metrics.avgDifferencePercentage.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.avgDifferencePercentage > 0
                    ? '📈 Simulator is higher on average'
                    : metrics.avgDifferencePercentage < 0
                    ? '📉 Bid Reduction is higher on average'
                    : '➡️ Both strategies equal on average'
                  }
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1 italic">
                  Per-campaign average, not difference of averages
                </p>
              </CardContent>
            </Card>
          </div>
          </>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Campaign Data</CardTitle>
              {sqlQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSql(!showSql)}
                >
                  {showSql ? 'Hide SQL' : 'Show SQL'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {showSql && sqlQuery && (
              <div className="mb-4 space-y-3">
                <div className="bg-slate-900 text-green-400 p-4 rounded-md overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">{sqlQuery}</pre>
                </div>

                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Info className="h-4 w-4" />
                      Understanding the Query
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div>
                      <strong className="text-amber-700 dark:text-amber-400">WHERE 1=1</strong>
                      <p className="text-muted-foreground">
                        This is a common SQL pattern that makes it easier to dynamically add conditions.
                        It&apos;s always true, so additional AND conditions can be appended without worrying about syntax.
                        Without it, we&apos;d need complex logic to determine if we need WHERE or AND.
                      </p>
                    </div>
                    <div>
                      <strong className="text-amber-700 dark:text-amber-400">LIMIT and OFFSET</strong>
                      <p className="text-muted-foreground">
                        LIMIT restricts results per page (default: 100 rows) for manageable UI rendering.
                        OFFSET skips rows for pagination. For example, page 2 with 100 rows per page uses OFFSET 100.
                        This enables browsing through large datasets without loading everything at once.
                      </p>
                    </div>
                    <div>
                      <strong className="text-amber-700 dark:text-amber-400">COALESCE(difference_percentage, -999999)</strong>
                      <p className="text-muted-foreground">
                        Handles NULL values in sorting. NULL differences (campaigns missing one pointer) are treated as -999999,
                        placing them at the bottom of results. This ensures campaigns with valid comparisons appear first.
                      </p>
                    </div>
                    <div>
                      <strong className="text-amber-700 dark:text-amber-400">CASE WHEN ... THEN ... END</strong>
                      <p className="text-muted-foreground">
                        Calculates the difference percentage dynamically. Only calculates when both pointers exist and
                        bid_reduction_pointer is not zero (to avoid division by zero). Returns NULL for incomplete data.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {dataLoading ? (
              <div className="text-center py-8">Loading campaigns...</div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No campaigns found with the selected filters
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Campaign ID</th>
                      <th className="text-left p-2">Phase</th>
                      <th className="text-left p-2">Mode</th>
                      <th className="text-right p-2">Simulator</th>
                      <th className="text-right p-2">Bid Reduction</th>
                      <th className="text-right p-2">Difference %</th>
                      <th className="text-left p-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign: TargetCpaRow) => (
                      <tr key={campaign.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono text-sm">{campaign.campaign_id}</td>
                        <td className="p-2">
                          <Badge variant={getPhaseBadgeVariant(campaign.phase)}>
                            {campaign.phase}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {campaign.mode ? (
                            <Badge variant={getModeBadgeVariant(campaign.mode)}>
                              {campaign.mode}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono text-sm text-blue-600">
                          {campaign.simulator_pointer?.toFixed(4) || '-'}
                        </td>
                        <td className="p-2 text-right font-mono text-sm text-orange-600">
                          {campaign.bid_reduction_pointer?.toFixed(4) || '-'}
                        </td>
                        <td className="p-2 text-right font-mono text-sm">
                          {campaign.difference_percentage !== null ? (
                            <span className={getCellDifferenceColor(campaign.difference_percentage)}>
                              {campaign.difference_percentage > 0 ? '+' : ''}
                              {campaign.difference_percentage.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2 text-sm text-muted-foreground">
                          {format(new Date(campaign.update_time), 'MMM dd, HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {page} • Showing {campaigns.length} campaigns
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={campaigns.length < limit}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Phase Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(metrics.phaseDistribution).map(([phase, count]) => (
                    <div key={phase} className="flex items-center justify-between">
                      <Badge variant={getPhaseBadgeVariant(phase)}>{phase}</Badge>
                      <span className="font-mono text-sm">{count} campaigns</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mode Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(metrics.modeDistribution).map(([mode, count]) => (
                    <div key={mode} className="flex items-center justify-between">
                      <Badge variant={getModeBadgeVariant(mode)}>{mode}</Badge>
                      <span className="font-mono text-sm">{count} campaigns</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TargetCpaPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
          <div className="container mx-auto p-6 space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold">Loading...</h1>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      }>
        <TargetCpaDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
