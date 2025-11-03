# Target CPA Analyzer - Migration Plan

## Executive Summary

This document outlines the comprehensive plan to transform the Burst Protection Analysis Dashboard into a **Target CPA Analyzer** that compares different bidding strategies (Simulator vs Bid Reduction) for Target CPA campaigns.

**Migration Goal:** Analyze `trc.target_cpa_campaigns_configurations` table to compare simulator_pointer vs bid_reduction_pointer strategies across different phases and modes.

---

## Table of Contents

1. [Current vs Target State](#current-vs-target-state)
2. [Data Analysis](#data-analysis)
3. [Architecture Changes](#architecture-changes)
4. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
5. [File Modification Matrix](#file-modification-matrix)
6. [Database Schema Changes](#database-schema-changes)
7. [API Changes](#api-changes)
8. [UI/UX Changes](#uiux-changes)
9. [Testing Strategy](#testing-strategy)
10. [Rollout Plan](#rollout-plan)

---

## Current vs Target State

### Current State: Burst Protection Analyzer

**Purpose:** Analyze burst protection effectiveness for advertising campaigns

**Key Metrics:**
- Account count with burst protection enabled
- Average depletion rate
- Spikes count
- Blocking activity (BLOCKED/NOT BLOCKED)

**Data Sources:**
- Multiple tables via complex CTEs:
  - `trc.publisher_config`
  - `reports.advertiser_dimensions_by_request_time_report_daily`
  - `reports.campaign_effective_daily_limit_calculations_report_daily`
  - `reports.blindspot_v5`
  - `reports_internal.sp_campaigns_spikes_report`
  - `trc.sp_campaign_details_v2`

**Filters:**
- Date range
- Advertiser
- Campaign

### Target State: Target CPA Analyzer

**Purpose:** Compare bidding strategy effectiveness (Simulator vs Bid Reduction) for Target CPA campaigns

**Key Metrics:**
- Campaign count by strategy
- Average simulator_pointer
- Average bid_reduction_pointer
- **Difference percentage** between strategies
- Distribution by phase (LEARNING, FEEDBACK_LOOP, EXITED)
- Distribution by mode (DEPLETION_POINTER, BID_REDUCTION_POINTER, SIMULATOR_BASED_POINTER, BID_POINTER)

**Data Source:**
- Single table: `trc.target_cpa_campaigns_configurations`

**Filters:**
- Date range (update_time)
- Campaign ID
- Phase (LEARNING, FEEDBACK_LOOP, EXITED)
- Mode (DEPLETION_POINTER, BID_REDUCTION_POINTER, etc.)
- Strategy comparison filter (show only campaigns with both pointers)

---

## Data Analysis

### Table Structure: `trc.target_cpa_campaigns_configurations`

```sql
-- Total records: 238,716
-- Sample query results show:
-- - Records with both pointers (simulator & bid_reduction): ~10 campaigns
-- - Most common phases: LEARNING (120,381), FEEDBACK_LOOP (79,630)
-- - Most common modes: DEPLETION_POINTER (46,379), BID_REDUCTION_POINTER (36,584)
```

**Key Columns:**

| Column | Type | Description | Usage |
|--------|------|-------------|-------|
| `id` | int | Unique record ID | Primary key |
| `campaign_id` | int | Campaign identifier | Filter, grouping |
| `update_time` | timestamp | Last update | Date filtering, time series |
| `create_time` | timestamp | Creation time | Historical analysis |
| `simulator_pointer` | float | Simulator strategy value | Strategy comparison |
| `bid_reduction_pointer` | float | Bid reduction strategy value | Strategy comparison |
| `phase` | varchar(30) | Campaign phase | Filter, grouping |
| `mode` | varchar(50) | Operation mode | Filter, grouping |
| `max_ecpa` | float | Maximum eCPA target | Context metric |
| `upper_bound` | float | Upper threshold | Context metric |
| `lower_bound` | float | Lower threshold | Context metric |
| `performer` | varchar(100) | System/user | Audit trail |

**Key Calculation:**

```sql
ROUND(
  ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100,
  2
) AS difference_percentage
```

This shows the percentage difference where:
- **Positive %** = Simulator pointer is higher than bid reduction
- **Negative %** = Bid reduction pointer is higher
- **Near 0%** = Strategies are aligned

### Data Patterns (from sample query)

```
Phase Distribution:
- LEARNING: 123,394 (51.7%)
- FEEDBACK_LOOP: 79,630 (33.4%)
- EXITED: 34,628 (14.5%)
- FEEDBACK_LOOP + null mode: 144 (0.4%)

Mode Distribution:
- DEPLETION_POINTER: 46,379 (19.4%)
- BID_REDUCTION_POINTER: 36,584 (15.3%)
- SIMULATOR_BASED_POINTER: 521 (0.2%)
- BID_POINTER: 375 (0.2%)
- null: 154,857 (64.9%)

Recent Difference Percentages (campaigns with both pointers):
- Range: 80% to 169%
- Average: ~120% (simulator typically higher)
- All in FEEDBACK_LOOP phase
- Mostly DEPLETION_POINTER mode
```

---

## Architecture Changes

### High-Level Changes

```
┌─────────────────────────────────────────────────────────────┐
│ BEFORE: Burst Protection Dashboard                           │
├─────────────────────────────────────────────────────────────┤
│ Complex multi-table CTEs → Account-level aggregation        │
│ Focus: Depletion rates, spikes, blocking                    │
│ Metrics: 4 KPIs (accounts, depletion, spikes, blocking)     │
└─────────────────────────────────────────────────────────────┘
                         ↓ TRANSFORM ↓
┌─────────────────────────────────────────────────────────────┐
│ AFTER: Target CPA Analyzer                                   │
├─────────────────────────────────────────────────────────────┤
│ Single table queries → Campaign-level analysis              │
│ Focus: Strategy comparison (simulator vs bid reduction)     │
│ Metrics: 5 KPIs (campaigns, avg simulator, avg bid_red,     │
│                  difference %, phase distribution)           │
└─────────────────────────────────────────────────────────────┘
```

### Simplified Data Flow

**BEFORE:**
```
User Filter → API → Complex CTE Query (5+ tables) →
Validation → Aggregation → Charts/Tables
```

**AFTER:**
```
User Filter → API → Simple Query (1 table) →
Validation → Calculation (difference %) → Charts/Tables
```

### Key Benefits of Simplification

1. **Performance:** Single table queries vs complex multi-table CTEs
2. **Maintainability:** Simpler queries, easier to understand
3. **Flexibility:** Easy to add new filters and calculations
4. **Accuracy:** Direct data without complex joins

---

## Phase-by-Phase Implementation

### Phase 1: Database Layer (Foundation) 🔴 CRITICAL PATH

**Goal:** Establish new data models and queries for Target CPA

**Tasks:**

1. **Create new schemas** (`src/lib/db/schema.ts`)
   - `TargetCpaRowSchema` - Main table row
   - `TargetCpaMetricsSchema` - Aggregated metrics
   - `PhaseDistributionSchema` - Phase breakdown
   - `ModeDistributionSchema` - Mode breakdown
   - `StrategyComparisonSchema` - Simulator vs Bid Reduction

2. **Create new types** (`src/lib/db/types.ts`)
   - `TargetCpaRow` - Individual configuration record
   - `TargetCpaMetrics` - Dashboard metrics
   - `StrategyComparison` - Comparison results
   - `TargetCpaFilters` - Query filters

3. **Create new queries** (`src/lib/db/queries.ts`)
   - `getTargetCpaData()` - Main data fetch
   - `getTargetCpaMetrics()` - Aggregated metrics
   - `getCampaignsWithBothStrategies()` - Comparison subset
   - `getPhaseDistribution()` - Phase breakdown
   - `getModeDistribution()` - Mode breakdown

**Sample Query Structure:**

```typescript
export async function getTargetCpaData(
  filters?: TargetCpaFilters
): Promise<TargetCpaRow[]> {
  const query = `
    SELECT
      id,
      campaign_id,
      update_time,
      create_time,
      phase,
      mode,
      simulator_pointer,
      bid_reduction_pointer,
      max_ecpa,
      upper_bound,
      lower_bound,
      performer,
      CASE
        WHEN bid_reduction_pointer IS NOT NULL
          AND bid_reduction_pointer != 0
        THEN ROUND(
          ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100,
          2
        )
        ELSE NULL
      END AS difference_percentage
    FROM trc.target_cpa_campaigns_configurations
    WHERE 1=1
      ${filters?.startDate ? `AND update_time >= '${filters.startDate}'` : ''}
      ${filters?.endDate ? `AND update_time <= '${filters.endDate}'` : ''}
      ${filters?.campaignId ? `AND campaign_id = ${filters.campaignId}` : ''}
      ${filters?.phase ? `AND phase = '${filters.phase}'` : ''}
      ${filters?.mode ? `AND mode = '${filters.mode}'` : ''}
      ${filters?.onlyWithBothPointers ?
        `AND simulator_pointer IS NOT NULL
         AND bid_reduction_pointer IS NOT NULL` : ''}
    ORDER BY update_time DESC, difference_percentage DESC
    LIMIT ${filters?.limit || 1000}
  `;

  return executeQuery(query);
}
```

**Estimated Effort:** 4-6 hours

---

### Phase 2: API Layer (Backend Endpoints) 🟠 HIGH PRIORITY

**Goal:** Create new API endpoints for Target CPA data and metrics

**Tasks:**

1. **Create new API routes:**
   - `/api/target-cpa/route.ts` - Main data endpoint
   - `/api/target-cpa/metrics/route.ts` - Aggregated metrics
   - `/api/target-cpa/campaigns/route.ts` - Campaign list (with both pointers)
   - `/api/target-cpa/phases/route.ts` - Phase distribution
   - `/api/target-cpa/modes/route.ts` - Mode distribution

2. **Update existing routes (if keeping burst protection):**
   - Rename `/api/burst-protection` → archive or keep as reference

3. **Implement caching strategy:**
   - Same cache pattern as current (5 min TTL)
   - Cache keys based on filter combinations

**Sample API Route:**

```typescript
// src/app/api/target-cpa/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: TargetCpaFilters = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      campaignId: searchParams.get('campaignId')
        ? Number(searchParams.get('campaignId'))
        : undefined,
      phase: searchParams.get('phase') || undefined,
      mode: searchParams.get('mode') || undefined,
      onlyWithBothPointers: searchParams.get('onlyWithBothPointers') === 'true',
    };

    // Cache check
    const cacheKey = `target-cpa:${JSON.stringify(filters)}`;
    const nocache = searchParams.get('nocache') === 'true';

    if (!nocache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // Fetch data
    const data = await getTargetCpaData(filters);

    // Cache and return
    const result = { success: true, data, count: data.length };
    cache.set(cacheKey, result, 300);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Target CPA API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**Estimated Effort:** 3-4 hours

---

### Phase 3: Analytics Layer (Calculations) 🟡 MEDIUM PRIORITY

**Goal:** Create new metric calculations for Target CPA analysis

**Tasks:**

1. **Create new calculators** (`src/lib/analytics/calculators.ts`)
   - `calculateDifferencePercentage()` - % diff between strategies
   - `calculateAveragePointers()` - Avg simulator & bid reduction
   - `calculateStrategyDistribution()` - Which strategy is winning
   - `categorizePhase()` - Phase categorization
   - `categorizeMode()` - Mode categorization

2. **Create new aggregators** (`src/lib/analytics/aggregators.ts`)
   - `aggregateByPhase()` - Group by phase
   - `aggregateByMode()` - Group by mode
   - `aggregateByStrategy()` - Strategy comparison
   - `aggregateByDateRange()` - Time series data

**Sample Calculator:**

```typescript
// src/lib/analytics/calculators.ts

export interface StrategyMetrics {
  avgSimulatorPointer: number;
  avgBidReductionPointer: number;
  avgDifferencePercentage: number;
  simulatorWins: number; // Count where simulator > bid_reduction
  bidReductionWins: number; // Count where bid_reduction > simulator
  tied: number; // Count where difference < 5%
}

export function calculateStrategyMetrics(
  data: TargetCpaRow[]
): StrategyMetrics {
  const campaignsWithBoth = data.filter(
    row => row.simulator_pointer !== null && row.bid_reduction_pointer !== null
  );

  if (campaignsWithBoth.length === 0) {
    return {
      avgSimulatorPointer: 0,
      avgBidReductionPointer: 0,
      avgDifferencePercentage: 0,
      simulatorWins: 0,
      bidReductionWins: 0,
      tied: 0,
    };
  }

  const sumSimulator = campaignsWithBoth.reduce(
    (sum, row) => sum + (row.simulator_pointer || 0),
    0
  );
  const sumBidReduction = campaignsWithBoth.reduce(
    (sum, row) => sum + (row.bid_reduction_pointer || 0),
    0
  );

  const avgSimulatorPointer = sumSimulator / campaignsWithBoth.length;
  const avgBidReductionPointer = sumBidReduction / campaignsWithBoth.length;
  const avgDifferencePercentage =
    ((avgSimulatorPointer - avgBidReductionPointer) / avgBidReductionPointer) * 100;

  let simulatorWins = 0;
  let bidReductionWins = 0;
  let tied = 0;

  campaignsWithBoth.forEach(row => {
    const diff = row.difference_percentage || 0;
    if (Math.abs(diff) < 5) {
      tied++;
    } else if (diff > 0) {
      simulatorWins++;
    } else {
      bidReductionWins++;
    }
  });

  return {
    avgSimulatorPointer,
    avgBidReductionPointer,
    avgDifferencePercentage,
    simulatorWins,
    bidReductionWins,
    tied,
  };
}
```

**Estimated Effort:** 3-4 hours

---

### Phase 4: UI Components (Dashboard) 🟢 STANDARD PRIORITY

**Goal:** Update dashboard to display Target CPA metrics and comparisons

**Tasks:**

1. **Update Metric Cards** (`src/components/dashboard/MetricsCards.tsx`)
   - Replace 4 burst protection cards with 5 Target CPA cards:
     1. **Total Campaigns** (with filters applied)
     2. **Avg Simulator Pointer** (with trend)
     3. **Avg Bid Reduction Pointer** (with trend)
     4. **Avg Difference %** (color-coded: green if <10%, amber if 10-50%, red if >50%)
     5. **Phase Distribution** (pie chart mini)

2. **Update Filters** (`src/components/dashboard/DashboardFilters.tsx`)
   - Add **Phase filter** (dropdown: All, LEARNING, FEEDBACK_LOOP, EXITED)
   - Add **Mode filter** (dropdown: All, DEPLETION_POINTER, BID_REDUCTION_POINTER, etc.)
   - Add **Strategy toggle** (checkbox: "Only show campaigns with both strategies")
   - Keep date range and campaign ID filters

3. **Update Data Table** (`src/components/dashboard/DataTable.tsx`)
   - New columns:
     - Campaign ID
     - Update Time
     - Phase (with badge)
     - Mode (with badge)
     - Simulator Pointer
     - Bid Reduction Pointer
     - **Difference %** (color-coded, bold)
     - Max eCPA
   - Expandable row details (bounds, performer, create_time)

4. **Create new components:**
   - `PhaseDistributionCard.tsx` - Pie chart of phase breakdown
   - `ModeDistributionCard.tsx` - Bar chart of mode breakdown
   - `StrategyComparisonBadge.tsx` - Visual indicator of which strategy is winning

**Sample Metric Card:**

```typescript
// Difference Percentage Card
<MetricCard
  title="Avg Strategy Difference"
  value={`${metrics.avgDifferencePercentage.toFixed(2)}%`}
  subtitle={
    metrics.avgDifferencePercentage > 0
      ? "Simulator pointer is higher"
      : "Bid reduction pointer is higher"
  }
  icon={TrendingUp}
  variant={
    Math.abs(metrics.avgDifferencePercentage) < 10 ? 'success' :
    Math.abs(metrics.avgDifferencePercentage) < 50 ? 'warning' :
    'danger'
  }
  trend={metrics.trend}
/>
```

**Estimated Effort:** 6-8 hours

---

### Phase 5: Charts & Visualizations 🟢 STANDARD PRIORITY

**Goal:** Create charts to compare strategies and visualize distributions

**Tasks:**

1. **Create new charts:**
   - `StrategyComparisonChart.tsx` - Line chart comparing simulator vs bid reduction over time
   - `DifferencePercentageChart.tsx` - Bar chart of difference % distribution
   - `PhaseDistributionPieChart.tsx` - Pie chart of phases
   - `ModeDistributionBarChart.tsx` - Bar chart of modes
   - `PointerScatterPlot.tsx` - Scatter plot of simulator vs bid reduction

2. **Update Chart Tabs** (`src/components/dashboard/ChartTabs.tsx`)
   - Replace old charts with new ones
   - Tabs: Strategy Comparison | Difference % | Phase Distribution | Mode Distribution | Scatter

3. **Enhanced tooltips:**
   - Show campaign ID, phase, mode, both pointer values, difference %

**Sample Chart:**

```typescript
// StrategyComparisonChart.tsx
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={timeSeriesData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis
      dataKey="date"
      tickFormatter={(date) => format(new Date(date), 'MMM dd')}
    />
    <YAxis label={{ value: 'Pointer Value', angle: -90 }} />
    <Tooltip content={<StrategyTooltip />} />
    <Legend />
    <Line
      type="monotone"
      dataKey="avgSimulatorPointer"
      stroke="#3b82f6"
      name="Simulator Pointer"
      strokeWidth={2}
    />
    <Line
      type="monotone"
      dataKey="avgBidReductionPointer"
      stroke="#f59e0b"
      name="Bid Reduction Pointer"
      strokeWidth={2}
    />
  </LineChart>
</ResponsiveContainer>
```

**Estimated Effort:** 5-7 hours

---

### Phase 6: Branding & Copy Updates 🔵 LOW PRIORITY

**Goal:** Rename all references from "Burst Protection" to "Target CPA"

**Tasks:**

1. **Update all UI text:**
   - Dashboard title: "Burst Protection Analysis" → "Target CPA Analyzer"
   - Breadcrumbs, headers, tooltips
   - Error messages
   - Loading states

2. **Update file names:**
   - Consider renaming files (optional, can keep for git history)
   - Update imports if renamed

3. **Update documentation:**
   - README.md
   - ARCHITECTURE.md
   - Add this plan as TARGET_CPA_MIGRATION_PLAN.md
   - Update deployment docs

4. **Update meta tags:**
   - Page title: `<title>Target CPA Analyzer</title>`
   - Meta description
   - Favicon (if needed)

**Search & Replace Patterns:**

```bash
# Case-sensitive replacements
Burst Protection → Target CPA
burst protection → target CPA
burst-protection → target-cpa
BurstProtection → TargetCpa
burstProtection → targetCpa

# Keep these for backward compatibility:
# - Database connection pool (no change)
# - Utility functions (no change)
```

**Estimated Effort:** 2-3 hours

---

### Phase 7: Testing & Validation ✅ CRITICAL

**Goal:** Ensure all functionality works correctly

**Tasks:**

1. **Unit tests:**
   - Test calculators (difference %, aggregations)
   - Test query builders
   - Test schema validations

2. **Integration tests:**
   - Test API endpoints
   - Test filter combinations
   - Test caching

3. **Manual testing:**
   - Test all filters (phase, mode, date range, campaign)
   - Test all charts
   - Test table sorting, expanding
   - Test export functionality
   - Test error states
   - Test loading states

4. **Performance testing:**
   - Query performance (should be faster with single table)
   - Cache hit rates
   - Page load times

5. **Data validation:**
   - Verify difference % calculations
   - Verify aggregations match database
   - Spot-check specific campaigns

**Estimated Effort:** 4-6 hours

---

### Phase 8: Documentation & Deployment 📚 FINAL

**Goal:** Update documentation and deploy

**Tasks:**

1. **Update technical docs:**
   - Architecture diagram
   - API documentation
   - Database schema docs
   - Query examples

2. **Update user docs:**
   - User guide (how to use filters)
   - Metric definitions
   - FAQ

3. **Deployment:**
   - Update environment variables (if needed)
   - Build and test Docker image
   - Deploy to production
   - Monitor for errors

4. **Handoff:**
   - Demo to stakeholders
   - Training session (if needed)
   - Knowledge transfer

**Estimated Effort:** 3-4 hours

---

## File Modification Matrix

### 🔴 MUST MODIFY (Critical Path)

| File | Action | Complexity | Priority |
|------|--------|------------|----------|
| `src/lib/db/schema.ts` | Add new schemas | Medium | 1 |
| `src/lib/db/types.ts` | Add new types | Low | 1 |
| `src/lib/db/queries.ts` | Add new queries | High | 1 |
| `src/app/api/target-cpa/route.ts` | **Create new** | Medium | 2 |
| `src/app/api/target-cpa/metrics/route.ts` | **Create new** | Medium | 2 |
| `src/lib/analytics/calculators.ts` | Add new calculators | Medium | 3 |
| `src/components/dashboard/MetricsCards.tsx` | Replace cards | High | 4 |
| `src/components/dashboard/DashboardFilters.tsx` | Add filters | Medium | 4 |
| `src/components/dashboard/DataTable.tsx` | Update columns | High | 4 |

### 🟠 SHOULD MODIFY (High Priority)

| File | Action | Complexity | Priority |
|------|--------|------------|----------|
| `src/app/api/target-cpa/campaigns/route.ts` | **Create new** | Low | 2 |
| `src/lib/analytics/aggregators.ts` | Add aggregators | Medium | 3 |
| `src/components/dashboard/ChartTabs.tsx` | Replace tabs | Medium | 5 |
| `src/components/charts/StrategyComparisonChart.tsx` | **Create new** | Medium | 5 |
| `src/components/dashboard/DashboardHeader.tsx` | Update title | Low | 6 |
| `src/lib/hooks/useTargetCpaData.ts` | **Create new** | Low | 4 |
| `src/lib/hooks/useFilters.ts` | Add new filter types | Medium | 4 |

### 🟡 COULD MODIFY (Medium Priority)

| File | Action | Complexity | Priority |
|------|--------|------------|----------|
| `src/components/charts/PhaseDistributionChart.tsx` | **Create new** | Low | 5 |
| `src/components/charts/ModeDistributionChart.tsx` | **Create new** | Low | 5 |
| `src/components/charts/PointerScatterPlot.tsx` | **Create new** | Medium | 5 |
| `src/types/dashboard.ts` | Update types | Low | 4 |
| `README.md` | Update docs | Low | 6 |
| `ARCHITECTURE.md` | Update docs | Medium | 6 |

### 🔵 OPTIONAL (Nice to Have)

| File | Action | Complexity | Priority |
|------|--------|------------|----------|
| `src/components/filters/PhaseSelect.tsx` | **Create new** | Low | 4 |
| `src/components/filters/ModeSelect.tsx` | **Create new** | Low | 4 |
| `src/lib/utils/target-cpa-helpers.ts` | **Create new** | Low | 3 |
| Docker files | Update configs | Low | 8 |

### ⚫ NO MODIFICATION NEEDED

These files can remain unchanged:

- `src/lib/db/vertica.ts` - Connection pool (no change)
- `src/lib/cache.ts` - Caching logic (no change)
- `src/lib/query-client.ts` - TanStack Query config (no change)
- All `src/components/ui/*` - Radix UI primitives (no change)
- `src/lib/utils/format.ts` - Formatting utilities (no change)
- `src/lib/utils/color.ts` - Color utilities (can reuse)
- `src/lib/design-tokens.ts` - Design system (no change)

---

## Database Schema Changes

### New Zod Schemas

```typescript
// src/lib/db/schema.ts

export const TargetCpaRowSchema = z.object({
  id: z.number().int().positive(),
  campaign_id: z.number().int().positive(),
  update_time: z.coerce.date(),
  create_time: z.coerce.date(),
  phase: z.enum(['LEARNING', 'FEEDBACK_LOOP', 'EXITED']),
  mode: z.enum([
    'DEPLETION_POINTER',
    'BID_REDUCTION_POINTER',
    'SIMULATOR_BASED_POINTER',
    'BID_POINTER',
  ]).nullable(),
  simulator_pointer: z.number().nullable(),
  bid_reduction_pointer: z.number().nullable(),
  max_ecpa: z.number().nullable(),
  upper_bound: z.number().nullable(),
  lower_bound: z.number().nullable(),
  performer: z.string(),
  difference_percentage: z.number().nullable(), // Calculated field
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
  limit: z.number().int().min(1).max(10000).optional(),
});
```

### Query Examples

#### 1. Main Data Query

```sql
SELECT
  id,
  campaign_id,
  update_time,
  create_time,
  phase,
  mode,
  simulator_pointer,
  bid_reduction_pointer,
  max_ecpa,
  upper_bound,
  lower_bound,
  performer,
  CASE
    WHEN bid_reduction_pointer IS NOT NULL
      AND bid_reduction_pointer != 0
    THEN ROUND(
      ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100,
      2
    )
    ELSE NULL
  END AS difference_percentage
FROM trc.target_cpa_campaigns_configurations
WHERE update_time >= '2025-01-01'
  AND update_time <= '2025-12-31'
  AND simulator_pointer IS NOT NULL
  AND bid_reduction_pointer IS NOT NULL
ORDER BY update_time DESC, difference_percentage DESC
LIMIT 1000;
```

#### 2. Metrics Aggregation Query

```sql
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
      THEN ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100
      ELSE NULL
    END AS difference_percentage
  FROM trc.target_cpa_campaigns_configurations
  WHERE update_time >= '2025-01-01'
    AND update_time <= '2025-12-31'
)
SELECT
  COUNT(*) AS total_campaigns,
  COUNT(CASE WHEN simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL THEN 1 END) AS campaigns_with_both,
  AVG(simulator_pointer) AS avg_simulator_pointer,
  AVG(bid_reduction_pointer) AS avg_bid_reduction_pointer,
  AVG(difference_percentage) AS avg_difference_percentage
FROM filtered_data;
```

#### 3. Phase Distribution Query

```sql
SELECT
  phase,
  COUNT(*) AS count,
  AVG(simulator_pointer) AS avg_simulator,
  AVG(bid_reduction_pointer) AS avg_bid_reduction
FROM trc.target_cpa_campaigns_configurations
WHERE update_time >= '2025-01-01'
  AND update_time <= '2025-12-31'
GROUP BY phase
ORDER BY count DESC;
```

#### 4. Time Series Query

```sql
SELECT
  DATE(update_time) AS date,
  AVG(simulator_pointer) AS avg_simulator_pointer,
  AVG(bid_reduction_pointer) AS avg_bid_reduction_pointer,
  COUNT(*) AS campaign_count
FROM trc.target_cpa_campaigns_configurations
WHERE update_time >= '2025-01-01'
  AND update_time <= '2025-12-31'
  AND simulator_pointer IS NOT NULL
  AND bid_reduction_pointer IS NOT NULL
GROUP BY DATE(update_time)
ORDER BY date;
```

---

## API Changes

### New Endpoints

#### 1. `/api/target-cpa` (Main data)

**GET Parameters:**
- `startDate` (string, optional) - ISO date string
- `endDate` (string, optional) - ISO date string
- `campaignId` (number, optional) - Filter by campaign
- `phase` (string, optional) - LEARNING | FEEDBACK_LOOP | EXITED
- `mode` (string, optional) - DEPLETION_POINTER | BID_REDUCTION_POINTER | etc.
- `onlyWithBothPointers` (boolean, optional) - Default: false
- `limit` (number, optional) - Default: 1000, Max: 10000
- `nocache` (boolean, optional) - Bypass cache

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "campaign_id": 46496761,
      "update_time": "2025-11-03T07:07:25.000Z",
      "create_time": "2024-01-15T10:00:00.000Z",
      "phase": "FEEDBACK_LOOP",
      "mode": "DEPLETION_POINTER",
      "simulator_pointer": 0.3849,
      "bid_reduction_pointer": 0.1429,
      "difference_percentage": 169.33,
      "max_ecpa": 1.5,
      "upper_bound": 7.0,
      "lower_bound": null,
      "performer": "TargetCpaLifecycleActionsTask"
    }
  ],
  "count": 1,
  "cached": false
}
```

#### 2. `/api/target-cpa/metrics` (Aggregated metrics)

**GET Parameters:** Same as above

**Response:**
```json
{
  "success": true,
  "metrics": {
    "totalCampaigns": 1000,
    "campaignsWithBothPointers": 150,
    "avgSimulatorPointer": 0.25,
    "avgBidReductionPointer": 0.12,
    "avgDifferencePercentage": 108.33,
    "phaseDistribution": {
      "LEARNING": 400,
      "FEEDBACK_LOOP": 550,
      "EXITED": 50
    },
    "modeDistribution": {
      "DEPLETION_POINTER": 600,
      "BID_REDUCTION_POINTER": 300,
      "SIMULATOR_BASED_POINTER": 50,
      "BID_POINTER": 50
    }
  }
}
```

#### 3. `/api/target-cpa/campaigns` (Campaign list)

**GET Parameters:**
- `startDate` (string, optional)
- `endDate` (string, optional)
- `onlyWithBothPointers` (boolean, optional) - Default: true

**Response:**
```json
{
  "success": true,
  "campaigns": [
    {
      "campaign_id": 46496761,
      "last_update": "2025-11-03T07:07:25.000Z",
      "phase": "FEEDBACK_LOOP",
      "has_both_pointers": true
    }
  ]
}
```

---

## UI/UX Changes

### New Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Target CPA Analyzer                              [Settings] │
│ Compare bidding strategies for Target CPA campaigns         │
├─────────────────────────────────────────────────────────────┤
│ Filters:                                                     │
│ [Date Range: Last 30 days ▼] [Campaign: All ▼]             │
│ [Phase: All ▼] [Mode: All ▼] [☑ Only both strategies]     │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ Campaigns│ │Avg Sim   │ │Avg Bid   │ │Avg Diff %│       │
│ │   150    │ │  0.25    │ │  0.12    │ │ +108.3%  │       │
│ │ 📊 +12%  │ │ 📈 +5%   │ │ 📉 -2%   │ │ 🔴 High  │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│ Chart Tabs: [Strategy Comparison] [Difference %] [Phase]   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │    [Line chart: Simulator vs Bid Reduction over time]   │ │
│ │                                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Campaign Data Table                          [Export CSV]   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │Campaign│Update   │Phase      │Mode       │Sim  │Bid  │%  │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │4649...│11/3/25  │FEEDBACK_  │DEPLETION_ │0.38 │0.14 │169│ │
│ │       │07:07    │LOOP       │POINTER    │     │     │   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Color Coding

**Difference Percentage:**
- 🟢 Green: 0-10% (strategies aligned)
- 🟡 Amber: 10-50% (moderate difference)
- 🔴 Red: 50%+ (significant difference)

**Phase Badges:**
- 🔵 Blue: LEARNING
- 🟢 Green: FEEDBACK_LOOP
- ⚪ Gray: EXITED

**Mode Badges:**
- 🟣 Purple: SIMULATOR_BASED_POINTER
- 🟠 Orange: BID_REDUCTION_POINTER
- 🔵 Blue: DEPLETION_POINTER
- ⚫ Gray: BID_POINTER

---

## Testing Strategy

### Unit Tests

```typescript
// Test calculator
describe('calculateDifferencePercentage', () => {
  it('should calculate positive difference', () => {
    const result = calculateDifferencePercentage(0.3849, 0.1429);
    expect(result).toBeCloseTo(169.33, 2);
  });

  it('should handle null values', () => {
    const result = calculateDifferencePercentage(0.5, null);
    expect(result).toBeNull();
  });

  it('should handle zero bid_reduction_pointer', () => {
    const result = calculateDifferencePercentage(0.5, 0);
    expect(result).toBeNull();
  });
});
```

### Integration Tests

```typescript
// Test API endpoint
describe('GET /api/target-cpa', () => {
  it('should return data with filters', async () => {
    const response = await fetch(
      '/api/target-cpa?startDate=2025-01-01&onlyWithBothPointers=true'
    );
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toBeInstanceOf(Array);
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0]).toHaveProperty('difference_percentage');
  });
});
```

### Manual Test Checklist

- [ ] Date range filter works
- [ ] Campaign filter works
- [ ] Phase filter works (all options)
- [ ] Mode filter works (all options)
- [ ] "Only both pointers" toggle works
- [ ] Metrics cards display correct values
- [ ] Strategy comparison chart renders
- [ ] Difference % chart renders
- [ ] Phase distribution chart renders
- [ ] Table displays correct columns
- [ ] Table sorting works
- [ ] Table expand/collapse works
- [ ] Export CSV works
- [ ] Cache works (faster on second load)
- [ ] Cache bypass works (?nocache=true)
- [ ] Error states display correctly
- [ ] Loading states display correctly

---

## Rollout Plan

### Pre-Launch Checklist

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Manual testing complete
- [ ] Performance benchmarks met (queries < 2s)
- [ ] Documentation updated
- [ ] Stakeholder demo completed
- [ ] Environment variables configured
- [ ] Docker image built and tested

### Launch Steps

1. **Deploy to staging** (Day 1)
   - Deploy Docker container
   - Run smoke tests
   - Validate metrics match database

2. **User acceptance testing** (Day 2-3)
   - Invite key stakeholders
   - Gather feedback
   - Fix critical issues

3. **Deploy to production** (Day 4)
   - Deploy during low-traffic window
   - Monitor error logs
   - Monitor query performance
   - Monitor cache hit rates

4. **Post-launch monitoring** (Week 1)
   - Daily check of error logs
   - Weekly performance review
   - User feedback collection

### Rollback Plan

If issues arise:

1. **Immediate rollback:** Revert to previous Docker image
2. **Investigate:** Review logs, identify root cause
3. **Fix:** Apply hotfix or schedule fix for next release
4. **Re-deploy:** After thorough testing

---

## Risk Assessment

### High Risk 🔴

| Risk | Impact | Mitigation |
|------|--------|------------|
| Query performance degradation | Users experience slow load times | Add database indexes, optimize queries, add caching |
| Incorrect difference % calculation | Wrong insights | Thorough testing, data validation against manual calculations |
| Data availability (missing pointers) | Empty dashboards | Add filter to show "only campaigns with both pointers", show clear messaging |

### Medium Risk 🟡

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cache invalidation issues | Stale data shown | Add cache TTL monitoring, add manual refresh button |
| Filter combination edge cases | Unexpected results | Comprehensive integration tests |
| UI/UX confusion (new layout) | User adoption issues | User training, tooltips, help documentation |

### Low Risk 🟢

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser compatibility | Some users see broken UI | Test on major browsers (Chrome, Firefox, Safari, Edge) |
| Mobile responsiveness | Poor mobile experience | Test on mobile devices, use responsive design |
| Documentation gaps | Developer confusion | Comprehensive inline comments, architecture docs |

---

## Success Metrics

### Technical Metrics

- **Query performance:** < 2 seconds for main data query
- **Cache hit rate:** > 70%
- **Error rate:** < 0.1%
- **Page load time:** < 3 seconds

### Business Metrics

- **User adoption:** 80% of stakeholders using weekly
- **Insights generated:** 5+ strategy recommendations per month
- **Data accuracy:** 100% match with manual calculations
- **User satisfaction:** 4/5 rating or higher

---

## Appendix

### Key Vertica Query (User Provided)

```sql
SELECT
  update_time,
  campaign_id,
  simulator_pointer,
  bid_reduction_pointer,
  ROUND(
    ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100,
    2
  ) AS difference_percentage
FROM trc.target_cpa_campaigns_configurations
WHERE simulator_pointer IS NOT NULL
ORDER BY update_time DESC, difference_percentage DESC;
```

### Sample Data

```
update_time          campaign_id  simulator  bid_reduction  diff_%
2025-11-03 07:07:25  46496761     0.3849     0.1429         169.33
2025-11-03 07:07:25  46681613     0.2207     0.0848         160.14
2025-11-03 07:07:25  47019032     0.2181     0.0871         150.28
```

### Useful SQL Snippets

```sql
-- Get campaigns with largest difference
SELECT campaign_id, difference_percentage
FROM (
  SELECT
    campaign_id,
    ROUND(
      ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100,
      2
    ) AS difference_percentage
  FROM trc.target_cpa_campaigns_configurations
  WHERE simulator_pointer IS NOT NULL
    AND bid_reduction_pointer IS NOT NULL
)
ORDER BY ABS(difference_percentage) DESC
LIMIT 10;

-- Get phase/mode combinations with highest avg difference
SELECT
  phase,
  mode,
  COUNT(*) AS count,
  AVG(
    ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100
  ) AS avg_difference_percentage
FROM trc.target_cpa_campaigns_configurations
WHERE simulator_pointer IS NOT NULL
  AND bid_reduction_pointer IS NOT NULL
GROUP BY phase, mode
ORDER BY avg_difference_percentage DESC;
```

---

## Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Database Layer | 4-6 hours | None |
| 2. API Layer | 3-4 hours | Phase 1 |
| 3. Analytics Layer | 3-4 hours | Phase 1, 2 |
| 4. UI Components | 6-8 hours | Phase 1, 2, 3 |
| 5. Charts | 5-7 hours | Phase 3, 4 |
| 6. Branding | 2-3 hours | None (parallel) |
| 7. Testing | 4-6 hours | Phase 1-5 |
| 8. Documentation | 3-4 hours | All phases |

**Total Estimated Time:** 30-42 hours (4-6 days for one developer)

**Recommended Approach:**
- Sprint 1 (Day 1-2): Phases 1-3 (Backend)
- Sprint 2 (Day 3-4): Phases 4-5 (Frontend)
- Sprint 3 (Day 5): Phases 6-7 (Polish & Testing)
- Sprint 4 (Day 6): Phase 8 (Docs & Deploy)

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize features** (MVP vs nice-to-have)
3. **Set up development environment**
4. **Start with Phase 1** (Database Layer)
5. **Iterate and gather feedback**

---

**Document Version:** 1.0
**Created:** November 3, 2025
**Author:** Claude Code
**Status:** Draft - Pending Review

---

**Questions or clarifications?** Please reach out before starting implementation.
