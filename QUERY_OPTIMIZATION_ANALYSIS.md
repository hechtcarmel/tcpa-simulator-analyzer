# Query Optimization Analysis

## Current Query Structure

### 1. Main Data Query (`getTargetCpaData`)
**Purpose:** Fetch paginated campaign configuration data
**Performance:** ✅ Good
- Uses pagination (LIMIT/OFFSET)
- Sorted by update_time (indexed)
- Returns only necessary fields
- Calculates difference_percentage in SQL (efficient)

**Recommendation:** Keep as-is

---

### 2. Metrics Query (`getTargetCpaMetrics`)
**Purpose:** Calculate aggregate metrics
**Current Implementation:** Calls 3 separate queries

```typescript
getTargetCpaMetrics() {
  // Query 1: Main metrics (1 query)
  const mainMetrics = SELECT COUNT, AVG...

  // Query 2: Phase distribution (separate query)
  const phaseDistribution = await getPhaseDistribution()

  // Query 3: Mode distribution (separate query)
  const modeDistribution = await getModeDistribution()

  return { ...mainMetrics, phaseDistribution, modeDistribution }
}
```

**Problem:** 3 database round-trips instead of 1

---

## Optimization Opportunity: Combine Metrics Queries

### Current: 3 Separate Queries

**Query 1 - Main Metrics:**
```sql
WITH filtered_data AS (
  SELECT campaign_id, simulator_pointer, bid_reduction_pointer, phase, mode,
    CASE WHEN ... THEN ... END AS difference_percentage
  FROM trc.target_cpa_campaigns_configurations
  WHERE [filters]
)
SELECT
  COUNT(DISTINCT campaign_id) AS total_campaigns,
  COUNT(DISTINCT CASE WHEN ... THEN campaign_id END) AS campaigns_with_both,
  AVG(simulator_pointer) AS avg_simulator_pointer,
  AVG(bid_reduction_pointer) AS avg_bid_reduction_pointer,
  AVG(difference_percentage) AS avg_difference_percentage
FROM filtered_data
```

**Query 2 - Phase Distribution:**
```sql
SELECT
  phase,
  COUNT(DISTINCT campaign_id) AS count,
  AVG(simulator_pointer) AS avg_simulator,
  AVG(bid_reduction_pointer) AS avg_bid_reduction
FROM trc.target_cpa_campaigns_configurations
WHERE [filters]
GROUP BY phase
ORDER BY count DESC
```

**Query 3 - Mode Distribution:**
```sql
SELECT
  COALESCE(mode, 'null') AS mode,
  COUNT(DISTINCT campaign_id) AS count,
  AVG(simulator_pointer) AS avg_simulator,
  AVG(bid_reduction_pointer) AS avg_bid_reduction
FROM trc.target_cpa_campaigns_configurations
WHERE [filters]
GROUP BY mode
ORDER BY count DESC
```

### Proposed: 1 Combined Query

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
    [dateCondition]
    [campaignCondition]
    [phaseCondition]
    [modeCondition]
    [bothPointersCondition]
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
  -- Main metrics
  mm.total_campaigns,
  mm.campaigns_with_both,
  mm.avg_simulator_pointer,
  mm.avg_bid_reduction_pointer,
  mm.avg_difference_percentage,
  -- Phase distribution (as JSON array)
  (SELECT JSON_ARRAYAGG(
    JSON_BUILD_OBJECT(
      'phase', phase,
      'count', count
    )
  ) FROM phase_dist) AS phase_distribution,
  -- Mode distribution (as JSON array)
  (SELECT JSON_ARRAYAGG(
    JSON_BUILD_OBJECT(
      'mode', mode,
      'count', count
    )
  ) FROM mode_dist) AS mode_distribution
FROM main_metrics mm
```

**Alternative (if Vertica doesn't support JSON functions):**

Return multiple result sets or use UNION ALL with type indicators.

---

## Performance Impact

### Current Implementation
- **3 database connections** acquired from pool
- **3 network round-trips** to Vertica
- **3 query compilation** operations
- **3 table scans** (even with shared CTE, separate queries)

**Total Time:** ~300-800ms (based on logs)

### Optimized Implementation
- **1 database connection** acquired from pool
- **1 network round-trip** to Vertica
- **1 query compilation** operation
- **1 table scan** (shared CTE used by all 3 parts)

**Expected Time:** ~150-400ms (40-50% reduction)

---

## Benefits of Combining Queries

### 1. Performance
- ✅ 50% reduction in network latency
- ✅ 67% reduction in connection pool usage
- ✅ Single table scan instead of 3
- ✅ Query optimizer can better optimize single query

### 2. Consistency
- ✅ All metrics calculated from same data snapshot
- ✅ No race conditions between queries
- ✅ Atomicity: Either all succeed or all fail

### 3. Maintainability
- ✅ Single query to debug and optimize
- ✅ Clearer data flow
- ✅ Less code overall

### 4. Cost
- ✅ Less database load
- ✅ Fewer connection pool resources
- ✅ Better scalability

---

## Implementation Complexity

### Current Code Structure
```typescript
// queries.ts
export async function getTargetCpaMetrics(filters) {
  const mainQuery = await executeQuery(mainQuerySQL);
  const phaseData = await getPhaseDistribution(filters);
  const modeData = await getModeDistribution(filters);

  return {
    ...mainQuery[0],
    phaseDistribution: transformPhaseData(phaseData),
    modeDistribution: transformModeData(modeData)
  };
}
```

### Optimized Structure
```typescript
// queries.ts
export async function getTargetCpaMetrics(filters) {
  const result = await executeQuery(combinedQuerySQL);

  return {
    totalCampaigns: result[0].total_campaigns,
    campaignsWithBothPointers: result[0].campaigns_with_both,
    avgSimulatorPointer: result[0].avg_simulator_pointer,
    avgBidReductionPointer: result[0].avg_bid_reduction_pointer,
    avgDifferencePercentage: result[0].avg_difference_percentage,
    phaseDistribution: parseJSONOrTransform(result[0].phase_distribution),
    modeDistribution: parseJSONOrTransform(result[0].mode_distribution)
  };
}

// Delete these functions - no longer needed
// getPhaseDistribution()
// getModeDistribution()
```

---

## Alternative: Keep Separate Queries

### When to Keep Separate

1. **Vertica doesn't support JSON aggregation**
   - May need to fetch distributions separately
   - Or use multiple result sets (UNION ALL approach)

2. **Phase/Mode distributions change independently**
   - If filters don't affect distributions equally
   - But they do - all use same filters

3. **Caching strategy differs**
   - If distributions are cached longer than main metrics
   - Currently all use same 300s TTL

4. **Query complexity becomes unmanageable**
   - Single query becomes too hard to read/maintain
   - Not the case here - fairly simple aggregations

### Verdict: COMBINE QUERIES

The distributions are:
- Always fetched together
- Use identical filters
- Small result sets (<10 rows each)
- Simple aggregations

**No reason to keep separate.**

---

## Other Query Optimizations

### 1. Remove Unused Query: `getCampaignsWithBothStrategies`

**Status:** ❌ Not used anywhere
**Action:** Delete from `queries.ts`
**Savings:** ~50 lines of code

### 2. Simplify Data Query

**Current:**
```sql
SELECT
  id, campaign_id, update_time, create_time, phase, mode,
  simulator_pointer, bid_reduction_pointer,
  max_ecpa, upper_bound, lower_bound, performer,
  bid_reduction_phase, initial_ecvr, base_cpc_incremental_change_value,
  CASE ... END AS difference_percentage
FROM ...
```

**Question:** Are all these fields used in the UI?

**UI Usage Check:**
- ✅ `campaign_id` - Displayed in table
- ✅ `phase` - Displayed as badge
- ✅ `mode` - Displayed as badge
- ✅ `simulator_pointer` - Displayed in table
- ✅ `bid_reduction_pointer` - Displayed in table
- ✅ `difference_percentage` - Displayed in table
- ✅ `update_time` - Displayed in table
- ❓ `id` - Not displayed (but needed for React key?)
- ❌ `create_time` - **NOT USED**
- ❌ `max_ecpa` - **NOT USED**
- ❌ `upper_bound` - **NOT USED**
- ❌ `lower_bound` - **NOT USED**
- ❌ `performer` - **NOT USED**
- ❌ `bid_reduction_phase` - **NOT USED**
- ❌ `initial_ecvr` - **NOT USED**
- ❌ `base_cpc_incremental_change_value` - **NOT USED**

**Recommendation:** Remove unused fields from SELECT

**Optimized Query:**
```sql
SELECT
  id,  -- Keep for React key
  campaign_id,
  update_time,
  phase,
  mode,
  simulator_pointer,
  bid_reduction_pointer,
  CASE ... END AS difference_percentage
FROM ...
```

**Benefits:**
- ✅ Reduce data transfer by ~50%
- ✅ Less memory usage
- ✅ Faster JSON serialization
- ✅ Smaller cache entries

---

## Indexing Recommendations

**Current Indexes Needed:**
1. `update_time` (for ORDER BY and date filters)
2. `campaign_id` (for filtering and DISTINCT COUNT)
3. `phase` (for filtering)
4. `mode` (for filtering)

**Composite Index Recommendation:**
```sql
CREATE INDEX idx_tcpa_filters
ON trc.target_cpa_campaigns_configurations(update_time, phase, mode, campaign_id);
```

**Why Composite:**
- Covers most common query pattern
- Allows index-only scans for COUNT queries
- Supports ORDER BY + WHERE efficiently

**Check if exists:**
```sql
SELECT * FROM v_catalog.projections
WHERE anchor_table_name = 'target_cpa_campaigns_configurations';
```

---

## Summary of Optimizations

### High Priority (Do First)

1. **Combine metrics queries into one** → 50% performance gain
2. **Remove unused fields from data query** → 50% data transfer reduction
3. **Delete `getCampaignsWithBothStrategies`** → Code cleanup

### Medium Priority

4. **Review and optimize indexes** → Long-term performance
5. **Add query result caching at DB layer** → If queries are identical often

### Low Priority (Future)

6. **Move complex queries to stored procedures** → If query logic grows
7. **Add materialized views** → If calculations are expensive
8. **Implement query result streaming** → If result sets grow large

---

## Implementation Plan

### Step 1: Combine Metrics Queries (1 hour)

1. Write combined SQL query
2. Test in Vertica directly
3. Update `getTargetCpaMetrics()` function
4. Delete `getPhaseDistribution()` and `getModeDistribution()`
5. Update types if needed
6. Test API endpoint
7. Verify UI still works

### Step 2: Remove Unused Fields (30 min)

1. Remove unused fields from SELECT in `getTargetCpaData`
2. Update `TargetCpaRowSchema` to remove unused fields
3. Test TypeScript compilation
4. Test UI display

### Step 3: Delete Unused Query (5 min)

1. Delete `getCampaignsWithBothStrategies()` function
2. Delete `/api/target-cpa/campaigns/route.ts`
3. Delete `useTargetCpaCampaigns.ts` hook
4. Delete `TargetCpaCampaign` type

### Step 4: Test Everything (30 min)

1. Run build: `pnpm build`
2. Test API endpoints
3. Test UI functionality
4. Check logs for errors
5. Verify metrics calculation accuracy

---

## Expected Results

### Before Optimization
- **3 queries** for metrics
- **15 fields** in data query
- **~800ms** metrics API response time
- **~100KB** data query response size

### After Optimization
- **1 query** for metrics (67% reduction)
- **8 fields** in data query (47% reduction)
- **~400ms** metrics API response time (50% faster)
- **~50KB** data query response size (50% smaller)

---

## Risks

### Risk 1: Vertica JSON Support
**Issue:** Vertica might not support JSON_ARRAYAGG
**Mitigation:** Use UNION ALL approach or fetch as separate result sets

### Risk 2: Query Too Complex
**Issue:** Combined query might be harder to debug
**Mitigation:** Well-documented SQL with clear CTEs

### Risk 3: Breaking Changes
**Issue:** API response format might change
**Mitigation:** Keep response format identical, only change internal implementation

---

## Validation Queries

After optimization, run these to verify correctness:

### Test 1: Metrics Match
```sql
-- Old way (3 queries)
SELECT COUNT(DISTINCT campaign_id) FROM ... WHERE ...;
SELECT phase, COUNT(*) FROM ... GROUP BY phase;
SELECT mode, COUNT(*) FROM ... GROUP BY mode;

-- New way (1 query)
-- Run combined query
-- Compare results
```

### Test 2: Performance
```sql
-- Check query execution time
SELECT EXPLAIN ... ; -- Get query plan
SELECT profile ... ; -- Get execution stats
```

### Test 3: Data Transfer
```bash
# Before
curl 'http://localhost:3000/api/target-cpa' | wc -c

# After
curl 'http://localhost:3000/api/target-cpa' | wc -c

# Should be ~50% smaller
```

