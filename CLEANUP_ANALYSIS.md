# Codebase Cleanup Analysis & Plan

## Executive Summary

The application has been converted from a **Burst Protection Analyzer** to a **Target CPA Analyzer**, but **~60% of the codebase is dead code** from the old feature. This analysis identifies what's actually being used vs. what can be safely deleted.

## Current Usage Analysis

### ✅ ACTIVELY USED

**API Routes (3):**
- ✅ `/api/target-cpa/route.ts` - Main data endpoint
- ✅ `/api/target-cpa/metrics/route.ts` - Metrics aggregation endpoint
- ✅ `/api/pool-stats/route.ts` - Database pool monitoring (utility)

**Hooks (2):**
- ✅ `useTargetCpaData.ts` - Fetches paginated campaign data
- ✅ `useTargetCpaMetrics.ts` - Fetches aggregate metrics

**Components (5):**
- ✅ `PhaseSelect.tsx` - Phase filter dropdown
- ✅ `ModeSelect.tsx` - Mode filter dropdown
- ✅ `DateRangePicker.tsx` - Date range selector
- ✅ `Switch.tsx` - Toggle switch (for "Only Both Strategies")
- ✅ `Label.tsx` - Form label component

**Database Queries (5):**
- ✅ `getTargetCpaData()` - Main query with pagination
- ✅ `getTargetCpaMetrics()` - Metrics aggregation
- ✅ `getPhaseDistribution()` - Phase breakdown
- ✅ `getModeDistribution()` - Mode breakdown
- ✅ `executeQuery()` - Core Vertica execution

**Types (6):**
- ✅ `TargetCpaRow`
- ✅ `TargetCpaData`
- ✅ `TargetCpaFilters`
- ✅ `TargetCpaMetrics`
- ✅ `PhaseDistribution`
- ✅ `ModeDistribution`

**Schema (6):**
- ✅ `TargetCpaRowSchema`
- ✅ `TargetCpaDataSchema`
- ✅ `TargetCpaFiltersSchema`
- ✅ `TargetCpaMetricsSchema`
- ✅ `PhaseDistributionSchema`
- ✅ `ModeDistributionSchema`

---

## ❌ DEAD CODE (Can Be Deleted)

### API Routes (6 routes)

**Burst Protection (5 routes - DELETE ALL):**
- ❌ `/api/burst-protection/route.ts`
- ❌ `/api/burst-protection/advertisers/route.ts`
- ❌ `/api/burst-protection/campaigns/route.ts`
- ❌ `/api/burst-protection/metrics/route.ts`
- ❌ `/api/burst-protection/windows/route.ts`

**Unused Target CPA (1 route):**
- ❌ `/api/target-cpa/campaigns/route.ts` - Not called anywhere

**Optional Delete:**
- ⚠️ `/api/test-db/route.ts` - Debugging route (safe to delete in production)

### Hooks (11 files - DELETE ALL)

**Burst Protection Hooks:**
- ❌ `useAdvertisers.ts`
- ❌ `useBurstProtectionData.ts`
- ❌ `useCampaigns.ts`
- ❌ `useChartData.ts`
- ❌ `useFilters.ts`
- ❌ `useMetrics.ts`
- ❌ `useTableSort.ts`
- ❌ `useWindowData.ts`
- ❌ `useWindowsFromVertica.ts`
- ❌ `useCSVExport.ts`

**Unused Target CPA Hook:**
- ❌ `useTargetCpaCampaigns.ts` - Not imported anywhere

### Components (27+ files - DELETE MOST)

**Charts (6 components - ALL UNUSED):**
- ❌ `AccountSparkline.tsx`
- ❌ `BlockingHeatmap.tsx`
- ❌ `ComparisonChart.tsx`
- ❌ `DepletionRateChart.tsx`
- ❌ `SpikeCountChart.tsx`
- ❌ `WindowTimelineChart.tsx`
- ⚠️ `ChartTooltip.tsx` - Might be reusable, but unused
- ⚠️ `FeatureDateIndicator.tsx` - Might be reusable, but unused

**Dashboard Components (9 components - ALL UNUSED):**
- ❌ `ChartTabs.tsx`
- ❌ `DashboardFilters.tsx`
- ❌ `DashboardHeader.tsx`
- ❌ `DashboardLayout.tsx`
- ❌ `DataTable.tsx`
- ❌ `EmptyState.tsx`
- ❌ `MetricsCards.tsx`
- ❌ `TableHeader.tsx`
- ❌ `TableRow.tsx`
- ❌ `WindowDataControls.tsx`

**Filters (2 components - UNUSED):**
- ❌ `AdvertiserSelect.tsx`
- ❌ `CampaignSelect.tsx`

**Cards (3 components - UNUSED):**
- ❌ `AnimatedNumber.tsx`
- ❌ `MetricCard.tsx`
- ❌ `TrendIndicator.tsx`

**Errors (1 component - UNUSED):**
- ❌ `ErrorBanner.tsx`

**Loading (1 component - PARTIALLY USED):**
- ⚠️ `ChartSkeleton.tsx` - Not used but might be useful
- ✅ `CardSkeleton.tsx` - Used in page.tsx

### Database Queries (5 functions)

**Burst Protection Queries:**
- ❌ `buildFilteredQuery()` - Complex CTE for burst protection
- ❌ `getBurstProtectionData()` - Main burst protection query
- ❌ `getAdvertisersList()` - Advertisers dropdown
- ❌ `getCampaignsList()` - Campaigns dropdown
- ❌ `getBlockingWindows()` - Blocking windows data

**Unused Target CPA Queries:**
- ❌ `getCampaignsWithBothStrategies()` - Grouped by campaign_id (not used)

### Types (8 types)

**Burst Protection Types:**
- ❌ `BurstProtectionRow`
- ❌ `BurstProtectionData`
- ❌ `QueryFilters`
- ❌ `Advertiser`
- ❌ `DateRangeData`
- ❌ `Campaign`
- ❌ `EnrichedBurstProtectionRow`
- ❌ `QueryFiltersInternal`

**Unused Target CPA Types:**
- ❌ `TargetCpaCampaign` - Used by deleted getCampaignsWithBothStrategies
- ❌ `StrategyMetrics` - Not used anywhere

### Schema (8 schemas)

**Burst Protection Schemas:**
- ❌ `BurstProtectionRowSchema`
- ❌ `BurstProtectionDataSchema`
- ❌ `FilterParamsSchema`
- ❌ `AdvertiserSchema`
- ❌ `AdvertisersListSchema`
- ❌ `CampaignSchema`
- ❌ `CampaignsListSchema`
- ❌ `DateRangeSchema`
- ❌ `VerticaWindowRowSchema`
- ❌ `VerticaWindowDataSchema`
- ❌ `WindowsFilterSchema`

---

## Impact Analysis

### File Count

**Current State:**
- Total API routes: 10
- Total hooks: 13
- Total components: ~47
- Total queries: 10
- Total types: 16
- Total schemas: 17

**After Cleanup:**
- API routes: 3 (70% reduction)
- Hooks: 2 (85% reduction)
- Components: ~15 (68% reduction)
- Queries: 5 (50% reduction)
- Types: 6 (63% reduction)
- Schemas: 6 (65% reduction)

**Overall:** ~65% code reduction

### Lines of Code

**Estimated Current:**
- `src/lib/db/queries.ts`: ~724 lines
- `src/lib/db/types.ts`: ~65 lines
- `src/lib/db/schema.ts`: ~138 lines
- `src/lib/hooks/`: ~500+ lines (11 unused files)
- `src/components/`: ~1500+ lines (30+ unused files)

**After Cleanup:** ~40% of current codebase

---

## Why This Happened

1. **Feature Pivot**: App was originally "Burst Protection Analyzer"
2. **No Cleanup**: When Target CPA was implemented, old code wasn't removed
3. **Code Duplication**: New Target CPA code was added alongside old code
4. **Documentation Lag**: README, package.json still reference old feature

---

## Benefits of Cleanup

### 1. **Reduced Complexity**
- Easier to onboard new developers
- Less cognitive load when reading code
- Clearer separation of concerns

### 2. **Better Performance**
- Smaller bundle size (~65% reduction)
- Faster TypeScript compilation
- Faster hot module replacement (HMR)
- Reduced memory usage

### 3. **Maintainability**
- Less code to test
- Fewer dependencies to update
- Clear "single source of truth"
- Easier refactoring

### 4. **Cost Savings**
- Less CI/CD time
- Smaller deployments
- Less storage used

### 5. **Reduced Confusion**
- No more "which query should I use?"
- Clear naming conventions
- Simpler file structure

---

## Cleanup Plan

### Phase 1: Low-Risk Deletions (Safe)

**Delete these first - 100% safe:**

```bash
# API Routes
rm -rf src/app/api/burst-protection/
rm src/app/api/target-cpa/campaigns/route.ts
rm src/app/api/test-db/route.ts  # optional

# Hooks
rm src/lib/hooks/useAdvertisers.ts
rm src/lib/hooks/useBurstProtectionData.ts
rm src/lib/hooks/useCampaigns.ts
rm src/lib/hooks/useChartData.ts
rm src/lib/hooks/useCSVExport.ts
rm src/lib/hooks/useFilters.ts
rm src/lib/hooks/useMetrics.ts
rm src/lib/hooks/useTableSort.ts
rm src/lib/hooks/useWindowData.ts
rm src/lib/hooks/useWindowsFromVertica.ts
rm src/lib/hooks/useTargetCpaCampaigns.ts

# Charts
rm -rf src/components/charts/

# Dashboard
rm -rf src/components/dashboard/

# Old filters
rm src/components/filters/AdvertiserSelect.tsx
rm src/components/filters/CampaignSelect.tsx

# Cards
rm -rf src/components/cards/

# Errors
rm -rf src/components/errors/

# Optional: Unused loading
rm src/components/loading/ChartSkeleton.tsx
```

### Phase 2: Clean Database Layer

**Update `src/lib/db/queries.ts`:**
```typescript
// DELETE:
- buildFilteredQuery()
- getBurstProtectionData()
- getAdvertisersList()
- getCampaignsList()
- getBlockingWindows()
- getCampaignsWithBothStrategies()

// KEEP:
- getTargetCpaData()
- getTargetCpaMetrics()
- getPhaseDistribution()
- getModeDistribution()
```

**Update `src/lib/db/types.ts`:**
```typescript
// DELETE all Burst Protection types
// DELETE unused Target CPA types:
- TargetCpaCampaign
- StrategyMetrics

// KEEP:
- TargetCpaRow
- TargetCpaData
- TargetCpaFilters
- TargetCpaMetrics
- PhaseDistribution
- ModeDistribution
```

**Update `src/lib/db/schema.ts`:**
```typescript
// DELETE all Burst Protection schemas
// DELETE:
- VerticaWindowRowSchema
- VerticaWindowDataSchema
- WindowsFilterSchema

// KEEP all Target CPA schemas
```

### Phase 3: Update Configuration

**Update `package.json`:**
```json
{
  "name": "target-cpa-analyzer",
  "description": "Target CPA bidding strategy analyzer"
}
```

**Update `README.md`:**
- Change title to "Target CPA Analyzer"
- Remove burst protection references
- Update screenshots/examples

### Phase 4: Cleanup Utilities

**Review `src/lib/analytics/`:**
- Check if any calculators are burst-protection specific
- Keep only Target CPA-related utilities

**Review `src/lib/api/`:**
- Ensure no burst-protection specific handlers
- Clean up any unused error types

### Phase 5: Documentation Cleanup

**Delete old documentation:**
```bash
rm TARGET_CPA_MIGRATION_PLAN.md  # migration is done
rm TARGET_CPA_IMPLEMENTATION_SUMMARY.md  # outdated
```

**Keep:**
- `QUERIES.md` - Actively used
- `UNDERSTANDING_AVERAGES.md` - Actively used
- `ARCHITECTURE.md` - Update to remove burst protection references

---

## Risks & Mitigation

### Risk 1: Accidental Deletion
**Mitigation:**
- Create git branch: `cleanup/remove-burst-protection`
- Delete in phases (not all at once)
- Run tests after each phase
- Keep PR open for review

### Risk 2: Hidden Dependencies
**Mitigation:**
- Run full TypeScript compilation after each phase
- Check for import errors
- Search for string references to deleted files

### Risk 3: Rollback Needed
**Mitigation:**
- All code is in git history
- Can cherry-pick from old commits if needed
- Old code isn't going anywhere

---

## Validation Checklist

After cleanup, verify:

- [ ] App builds successfully: `pnpm build`
- [ ] No TypeScript errors: Check build output
- [ ] Main page loads: http://localhost:3000
- [ ] Filters work: Phase, Mode, Date Range, Toggle
- [ ] Pagination works: Next/Previous buttons
- [ ] Metrics calculate correctly
- [ ] SQL query display works
- [ ] API endpoints return 200:
  - [ ] GET /api/target-cpa
  - [ ] GET /api/target-cpa/metrics
  - [ ] GET /api/pool-stats

---

## Estimated Timeline

- **Phase 1 (File Deletion):** 30 minutes
- **Phase 2 (Database Layer):** 1 hour
- **Phase 3 (Configuration):** 15 minutes
- **Phase 4 (Utilities Review):** 30 minutes
- **Phase 5 (Documentation):** 30 minutes
- **Testing & Validation:** 1 hour

**Total:** ~3.5 hours

---

## Conclusion

The codebase has significant technical debt from the feature pivot. Cleaning up **~65% of unused code** will:

1. Reduce bundle size and improve performance
2. Make the codebase easier to understand and maintain
3. Eliminate confusion about which code is active
4. Speed up development and debugging
5. Reduce CI/CD times and costs

**Recommendation:** Execute cleanup in phases, with git branch and thorough testing between phases.

---

## Additional Optimizations

### After Cleanup

Once dead code is removed, consider:

1. **Combine queries:** Can `getPhaseDistribution` and `getModeDistribution` be one query?
2. **Simplify types:** Are all fields in `TargetCpaRow` needed in the UI?
3. **Component extraction:** Can metric cards be a reusable component?
4. **Bundle splitting:** Code-split Radix UI components for better loading
5. **Caching strategy:** Review cache TTLs and invalidation

### Database Optimization

1. **Index review:** Ensure indexes exist on `update_time`, `campaign_id`, `phase`, `mode`
2. **Query profiling:** Use Vertica query profiler to optimize slow queries
3. **Projection optimization:** Review Vertica projections for the table

### Architecture Review

1. **Move SQL to stored procedures?** For complex queries with business logic
2. **Add query result caching?** Already have cache, but review strategy
3. **Add request deduplication?** Prevent multiple identical requests
4. **Add query queue?** Limit concurrent database connections

---

## Files to Review Before Deletion

Before deleting, manually review these files for any reusable logic:

- `src/lib/analytics/calculators.ts` - Check for general-purpose functions
- `src/components/charts/ChartTooltip.tsx` - Reusable tooltip component?
- `src/components/dashboard/EmptyState.tsx` - Generic empty state component?
- `src/lib/api/error-handler.ts` - Ensure not burst-protection specific
- `src/lib/api/cache-handler.ts` - Ensure generic implementation

