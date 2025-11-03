# Target CPA Analyzer - SQL Queries Documentation

This document describes all SQL queries used in the Target CPA Analyzer application.

## Table of Contents
1. [Target CPA Data Query](#target-cpa-data-query)
2. [Target CPA Metrics Query](#target-cpa-metrics-query)
3. [Phase Distribution Query](#phase-distribution-query)
4. [Mode Distribution Query](#mode-distribution-query)
5. [Campaigns with Both Strategies Query](#campaigns-with-both-strategies-query)

---

## Target CPA Data Query

**Purpose:** Fetches paginated campaign configuration data with calculated difference percentages between simulator and bid reduction pointers.

**Location:** `src/lib/db/queries.ts` - `getTargetCpaData()`

**Query:**
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
  bid_reduction_phase,
  initial_ecvr,
  base_cpc_incremental_change_value,
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
  [AND update_time >= ? AND update_time <= ?]     -- if startDate and endDate provided
  [AND campaign_id = ?]                             -- if campaignId provided
  [AND phase = ?]                                   -- if phase provided
  [AND mode = ?]                                    -- if mode provided
  [AND simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL]  -- if onlyWithBothPointers = true
ORDER BY update_time DESC, COALESCE(difference_percentage, -999999) DESC
LIMIT ?                                             -- default: 100
OFFSET ?                                            -- calculated: (page - 1) * limit
```

**Filters:**
- `startDate` / `endDate`: Filter by update_time date range
- `campaignId`: Filter by specific campaign
- `phase`: Filter by phase (LEARNING, FEEDBACK_LOOP, EXITED)
- `mode`: Filter by mode (DEPLETION_POINTER, BID_REDUCTION_POINTER, SIMULATOR_BASED_POINTER, BID_POINTER)
- `onlyWithBothPointers`: When true, only includes campaigns with both pointer values
- `page`: Page number for pagination (starts at 1)
- `limit`: Rows per page (default: 100)

**Key Calculations:**
- **difference_percentage**: `((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100`
  - Only calculated when both pointers exist and bid_reduction_pointer ≠ 0
  - Rounded to 2 decimal places
  - NULL if either pointer is missing or bid_reduction_pointer is 0

**Sorting:**
- Primary: `update_time DESC` (most recent first)
- Secondary: `difference_percentage DESC` (largest difference first)
- NULL differences are treated as -999999 using COALESCE, placing them at the end

**Pagination:**
- Default limit: 100 rows per page
- OFFSET calculation: `(page - 1) * limit`
- Example: Page 2 with 100 rows → OFFSET 100

---

## Target CPA Metrics Query

**Purpose:** Calculates aggregate metrics across ALL matching campaigns (not paginated). Provides summary statistics for the dashboard.

**Location:** `src/lib/db/queries.ts` - `getTargetCpaMetrics()`

**Query:**
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
        AND simulator_pointer IS NOT NULL
      THEN ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100
      ELSE NULL
    END AS difference_percentage
  FROM trc.target_cpa_campaigns_configurations
  WHERE 1=1
    [AND update_time >= ? AND update_time <= ?]
    [AND campaign_id = ?]
    [AND phase = ?]
    [AND mode = ?]
    [AND simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL]
)
SELECT
  COUNT(DISTINCT campaign_id) AS total_campaigns,
  COUNT(DISTINCT CASE WHEN simulator_pointer IS NOT NULL AND bid_reduction_pointer IS NOT NULL THEN campaign_id END) AS campaigns_with_both,
  AVG(simulator_pointer) AS avg_simulator_pointer,
  AVG(bid_reduction_pointer) AS avg_bid_reduction_pointer,
  AVG(difference_percentage) AS avg_difference_percentage
FROM filtered_data
```

**Filters:**
- Same filters as Target CPA Data Query
- **No LIMIT or OFFSET** - calculates across ALL matching data

**Key Calculations:**
- **total_campaigns**: Count of unique campaigns matching filters
- **campaigns_with_both**: Count of campaigns with both simulator_pointer and bid_reduction_pointer
- **avg_simulator_pointer**: `AVG(simulator_pointer)` - automatically ignores NULL values
- **avg_bid_reduction_pointer**: `AVG(bid_reduction_pointer)` - automatically ignores NULL values
- **avg_difference_percentage**: `AVG(difference_percentage)` - only averages rows where both pointers exist

**Important Notes:**
- SQL's `AVG()` function automatically excludes NULL values from calculation
- Metrics are calculated across ALL data, not just the current page
- The `onlyWithBothPointers` filter significantly affects averages by excluding campaigns with only one pointer

---

## Phase Distribution Query

**Purpose:** Groups campaigns by phase and calculates counts and averages for each phase.

**Location:** `src/lib/db/queries.ts` - `getPhaseDistribution()`

**Query:**
```sql
SELECT
  phase,
  COUNT(DISTINCT campaign_id) AS count,
  AVG(simulator_pointer) AS avg_simulator,
  AVG(bid_reduction_pointer) AS avg_bid_reduction
FROM trc.target_cpa_campaigns_configurations
WHERE 1=1
  [AND update_time >= ? AND update_time <= ?]
  [AND mode = ?]
GROUP BY phase
ORDER BY count DESC
```

**Filters:**
- `startDate` / `endDate`: Date range filter
- `mode`: Optional mode filter

**Output:**
- `phase`: Phase name (LEARNING, FEEDBACK_LOOP, EXITED)
- `count`: Number of unique campaigns in this phase
- `avg_simulator`: Average simulator_pointer for campaigns in this phase
- `avg_bid_reduction`: Average bid_reduction_pointer for campaigns in this phase

---

## Mode Distribution Query

**Purpose:** Groups campaigns by mode and calculates counts and averages for each mode.

**Location:** `src/lib/db/queries.ts` - `getModeDistribution()`

**Query:**
```sql
SELECT
  COALESCE(mode, 'null') AS mode,
  COUNT(DISTINCT campaign_id) AS count,
  AVG(simulator_pointer) AS avg_simulator,
  AVG(bid_reduction_pointer) AS avg_bid_reduction
FROM trc.target_cpa_campaigns_configurations
WHERE 1=1
  [AND update_time >= ? AND update_time <= ?]
  [AND phase = ?]
GROUP BY mode
ORDER BY count DESC
```

**Filters:**
- `startDate` / `endDate`: Date range filter
- `phase`: Optional phase filter

**Output:**
- `mode`: Mode name or 'null' if NULL (DEPLETION_POINTER, BID_REDUCTION_POINTER, SIMULATOR_BASED_POINTER, BID_POINTER)
- `count`: Number of unique campaigns using this mode
- `avg_simulator`: Average simulator_pointer for campaigns in this mode
- `avg_bid_reduction`: Average bid_reduction_pointer for campaigns in this mode

**Note:** Uses `COALESCE(mode, 'null')` to handle NULL mode values in GROUP BY

---

## Campaigns with Both Strategies Query

**Purpose:** Fetches campaigns that have both pointer strategies, grouped by campaign_id with most recent values.

**Location:** `src/lib/db/queries.ts` - `getCampaignsWithBothStrategies()`

**Query:**
```sql
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
  [AND update_time >= ? AND update_time <= ?]
  [AND phase = ?]
  [AND mode = ?]
GROUP BY campaign_id
ORDER BY last_update DESC, COALESCE(difference_percentage, -999999) DESC
LIMIT 1000
```

**Filters:**
- Always filters to campaigns with both pointers (not NULL)
- `startDate` / `endDate`: Date range filter
- `phase`: Optional phase filter
- `mode`: Optional mode filter

**Aggregation:**
- Groups by `campaign_id` and uses `MAX()` to get most recent values
- Calculates `difference_percentage` from the aggregated values

**Limit:** Returns up to 1000 campaigns

---

## Common SQL Patterns

### WHERE 1=1 Pattern
```sql
WHERE 1=1
  AND condition1
  AND condition2
```
- Simplifies dynamic query building
- Always evaluates to true, allowing subsequent AND conditions to be appended without syntax issues
- Eliminates need for complex logic to determine first vs. subsequent conditions

### COALESCE for Sorting
```sql
ORDER BY COALESCE(difference_percentage, -999999) DESC
```
- Handles NULL values in sorting
- NULL differences are treated as -999999, placing them at the end
- Ensures campaigns with valid comparisons appear first

### NULL Handling in AVG()
```sql
AVG(simulator_pointer)  -- Automatically ignores NULL values
```
- SQL's `AVG()` function automatically excludes NULL values
- No need for explicit NULL checks in averaging
- Results in accurate averages even with missing data

### CASE WHEN for Calculated Fields
```sql
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
```
- Calculates percentage difference only when both pointers exist
- Prevents division by zero by checking bid_reduction_pointer ≠ 0
- Returns NULL for incomplete data

---

## Database Schema

**Table:** `trc.target_cpa_campaigns_configurations`

**Key Columns:**
- `id`: Unique row identifier
- `campaign_id`: Campaign identifier (not unique per row, can have multiple configurations)
- `update_time`: When this configuration was last updated
- `create_time`: When this configuration was created
- `phase`: Campaign phase (LEARNING, FEEDBACK_LOOP, EXITED)
- `mode`: Bidding mode (DEPLETION_POINTER, BID_REDUCTION_POINTER, SIMULATOR_BASED_POINTER, BID_POINTER, NULL)
- `simulator_pointer`: Simulator-based bidding pointer value
- `bid_reduction_pointer`: Bid reduction pointer value
- `max_ecpa`: Maximum expected CPA
- `upper_bound`: Upper bound value
- `lower_bound`: Lower bound value
- `performer`: Performer identifier
- `bid_reduction_phase`: Bid reduction phase
- `initial_ecvr`: Initial eCVR value
- `base_cpc_incremental_change_value`: Base CPC incremental change

**Indexes:**
- Primary sort: `update_time DESC`
- Recommended indexes for filters: `campaign_id`, `phase`, `mode`, `update_time`

---

## API Endpoints

### GET /api/target-cpa
**Purpose:** Fetches paginated campaign data
**Query Used:** Target CPA Data Query
**Response:** Campaign rows + metadata (SQL query, total rows, query time, filters applied)

### GET /api/target-cpa/metrics
**Purpose:** Fetches aggregate metrics
**Query Used:** Target CPA Metrics Query + Phase Distribution + Mode Distribution
**Response:** Aggregated metrics (totals, averages, distributions) + metadata

---

## Performance Considerations

1. **Pagination**: Limits data transfer and improves UI responsiveness
2. **Indexes**: Ensure indexes exist on `update_time`, `campaign_id`, `phase`, `mode` for filter performance
3. **CTE Usage**: `WITH filtered_data AS (...)` allows query optimizer to process filters efficiently
4. **DISTINCT COUNT**: Used for campaign counts to handle multiple configurations per campaign
5. **No N+1 Queries**: All distribution data fetched in single query per metric type
6. **Calculated Fields**: `difference_percentage` calculated in SQL rather than application layer for efficiency

---

## Filter Combinations Impact

### onlyWithBothPointers = true
- **Data Query**: Only returns campaigns with both pointers
- **Metrics Query**: Calculates averages only from campaigns with both pointers
- **Result**: More restrictive, but ensures fair comparisons

### onlyWithBothPointers = false
- **Data Query**: Returns all campaigns, including those with only one pointer
- **Metrics Query**: Averages include all campaigns (AVG() auto-ignores NULLs)
- **Result**: `avgBidReductionPointer` often significantly higher due to campaigns with only bid_reduction_pointer

**Example Impact:**
- **With toggle ON**: `avgBidReduction = 0.1856`
- **With toggle OFF**: `avgBidReduction = 0.8049` (4.3x higher!)

This occurs because many campaigns have only `bid_reduction_pointer` without `simulator_pointer`, and these campaigns often have higher pointer values.
