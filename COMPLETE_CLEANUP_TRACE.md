# Complete Cleanup Trace - Frontend to Backend

## Methodology

Starting from `src/app/page.tsx` (the ONLY page), trace every import and API call to identify what's actually used.

---

## Frontend: What's ACTUALLY Used

### Main Page (`src/app/page.tsx`)

**Imports:**
```typescript
// External libraries - KEEP
import { format, subDays } from 'date-fns';
import { QueryClientProvider } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Activity, Percent, Info, HelpCircle } from 'lucide-react';

// UI Components - KEEP
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CardSkeleton } from '@/components/loading/CardSkeleton';

// Custom Components - KEEP
import { PhaseSelect } from '@/components/filters/PhaseSelect';
import { ModeSelect } from '@/components/filters/ModeSelect';
import DateRangePicker from '@/components/filters/DateRangePicker';

// Hooks - KEEP
import { useTargetCpaData } from '@/lib/hooks/useTargetCpaData';
import { useTargetCpaMetrics } from '@/lib/hooks/useTargetCpaMetrics';

// Utils - KEEP (but most functions inside can be deleted)
import { getPhaseColor, getModeColor } from '@/lib/analytics/calculators';

// Types - KEEP
import type { TargetCpaRow } from '@/lib/db/types';
import type { DateRange } from '@/types/filters';

// Config - KEEP
import { queryClient } from '@/lib/query-client';
```

---

## API Calls Traced

### 1. useTargetCpaData → `/api/target-cpa`

**Route:** `src/app/api/target-cpa/route.ts`
**Status:** ✅ **KEEP** (actively used)

**Calls:**
- `getTargetCpaData()` from queries.ts ✅ **KEEP**
- Which calls `executeQuery()` ✅ **KEEP**

### 2. useTargetCpaMetrics → `/api/target-cpa/metrics`

**Route:** `src/app/api/target-cpa/metrics/route.ts`
**Status:** ✅ **KEEP** (actively used)

**Calls:**
- `getTargetCpaMetrics()` from queries.ts ✅ **KEEP**
- Which calls `executeQuery()` ✅ **KEEP**

### 3. ❌ ALL OTHER API ROUTES → UNUSED

---

## Database Layer: What's ACTUALLY Used

### ✅ KEEP - Used Queries

From `src/lib/db/queries.ts`:
1. `executeQuery()` - Base function ✅
2. `getTargetCpaData()` - Main data query ✅
3. `getTargetCpaMetrics()` - Metrics query ✅

### ❌ DELETE - Unused Queries

From `src/lib/db/queries.ts`:
1. ❌ `buildFilteredQuery()` - Burst protection
2. ❌ `getBurstProtectionData()` - Burst protection
3. ❌ `getAdvertisersList()` - Not used
4. ❌ `getCampaignsList()` - Not used
5. ❌ `getBlockingWindows()` - Blocking windows feature
6. ❌ `getCampaignsWithBothStrategies()` - Not used
7. ❌ `getPhaseDistribution()` - Replaced by combined query
8. ❌ `getModeDistribution()` - Replaced by combined query

**Total:** Delete 8 functions (~420 lines)

---

## Analytics Layer: What's ACTUALLY Used

From `src/lib/analytics/calculators.ts`:

### ✅ KEEP (2 functions)
- `getPhaseColor()` - Used by page.tsx
- `getModeColor()` - Used by page.tsx

### ❌ DELETE (9 functions + all burst protection code)

**Burst Protection Functions:**
- ❌ `calculateMetrics()` - lines 37-49
- ❌ `calculateKPIs()` - lines 51-123
- ❌ `calculateFeatureImpact()` - lines 125-191

**Unused Target CPA Functions:**
- ❌ `calculateStrategyMetrics()` - lines 197-254
- ❌ `calculateDifferencePercentage()` - lines 256-269
- ❌ `getDifferenceCategory()` - lines 271-280
- ❌ `getDifferenceColor()` - lines 282-293

**Total:** Delete ~250 lines from calculators.ts

### ❌ DELETE - Aggregators File

`src/lib/analytics/aggregators.ts` - Entirely burst protection
**Total:** Delete entire file (~200 lines)

---

## Components: What's ACTUALLY Used

### ✅ KEEP - UI Components (13 files)

**Base UI:**
- ✅ `ui/badge.tsx`
- ✅ `ui/button.tsx`
- ✅ `ui/card.tsx`
- ✅ `ui/label.tsx`
- ✅ `ui/switch.tsx`
- ✅ `ui/popover.tsx` (used by DateRangePicker)
- ✅ `ui/calendar.tsx` (used by DateRangePicker)
- ✅ `ui/select.tsx` (used by PhaseSelect/ModeSelect)

**Filters:**
- ✅ `filters/DateRangePicker.tsx`
- ✅ `filters/PhaseSelect.tsx`
- ✅ `filters/ModeSelect.tsx`

**Loading:**
- ✅ `loading/CardSkeleton.tsx`

**TOTAL:** 13 components

### ❌ DELETE - Unused Components (35+ files)

**Charts (8 files):**
- ❌ `charts/AccountSparkline.tsx`
- ❌ `charts/BlockingHeatmap.tsx`
- ❌ `charts/ChartTooltip.tsx`
- ❌ `charts/ComparisonChart.tsx`
- ❌ `charts/DepletionRateChart.tsx`
- ❌ `charts/FeatureDateIndicator.tsx`
- ❌ `charts/SpikeCountChart.tsx`
- ❌ `charts/WindowTimelineChart.tsx`

**Dashboard (10 files):**
- ❌ `dashboard/ChartTabs.tsx`
- ❌ `dashboard/DashboardFilters.tsx`
- ❌ `dashboard/DashboardHeader.tsx`
- ❌ `dashboard/DashboardLayout.tsx`
- ❌ `dashboard/DataTable.tsx`
- ❌ `dashboard/EmptyState.tsx`
- ❌ `dashboard/MetricsCards.tsx`
- ❌ `dashboard/TableHeader.tsx`
- ❌ `dashboard/TableRow.tsx`
- ❌ `dashboard/WindowDataControls.tsx`

**Filters (2 files):**
- ❌ `filters/AdvertiserSelect.tsx`
- ❌ `filters/CampaignSelect.tsx`

**Cards (3 files):**
- ❌ `cards/AnimatedNumber.tsx`
- ❌ `cards/MetricCard.tsx`
- ❌ `cards/TrendIndicator.tsx`

**Errors (1 file):**
- ❌ `errors/ErrorBanner.tsx`

**Loading (1 file):**
- ❌ `loading/ChartSkeleton.tsx`

**UI Components (10+ files - need to verify each):**
- ⚠️ `ui/command.tsx` - Check if used
- ⚠️ `ui/dialog.tsx` - Check if used
- ⚠️ `ui/scroll-area.tsx` - Check if used
- ⚠️ `ui/separator.tsx` - Check if used
- ⚠️ `ui/skeleton.tsx` - Check if used
- ⚠️ `ui/slider.tsx` - Check if used
- ⚠️ `ui/table.tsx` - Check if used
- ⚠️ `ui/tabs.tsx` - Check if used
- ⚠️ `ui/tooltip.tsx` - Check if used

**TOTAL:** Delete 25 components for sure, ~35 potentially

---

## Hooks: What's ACTUALLY Used

### ✅ KEEP (2 files)
- ✅ `hooks/useTargetCpaData.ts`
- ✅ `hooks/useTargetCpaMetrics.ts`

### ❌ DELETE (11 files)

**Burst Protection Hooks:**
- ❌ `hooks/useAdvertisers.ts`
- ❌ `hooks/useBurstProtectionData.ts`
- ❌ `hooks/useCampaigns.ts`
- ❌ `hooks/useChartData.ts`
- ❌ `hooks/useCSVExport.ts`
- ❌ `hooks/useFilters.ts`
- ❌ `hooks/useMetrics.ts`
- ❌ `hooks/useTableSort.ts`
- ❌ `hooks/useWindowData.ts`
- ❌ `hooks/useWindowsFromVertica.ts`

**Unused Target CPA Hooks:**
- ❌ `hooks/useTargetCpaCampaigns.ts`

**TOTAL:** Delete 11 hooks (~550 lines)

---

## API Routes: What's ACTUALLY Used

### ✅ KEEP (3 files)
- ✅ `api/target-cpa/route.ts`
- ✅ `api/target-cpa/metrics/route.ts`
- ✅ `api/pool-stats/route.ts` (utility for monitoring)

### ❌ DELETE (7 files)

**Burst Protection API:**
- ❌ `api/burst-protection/route.ts`
- ❌ `api/burst-protection/advertisers/route.ts`
- ❌ `api/burst-protection/campaigns/route.ts`
- ❌ `api/burst-protection/metrics/route.ts`
- ❌ `api/burst-protection/windows/route.ts`

**Unused Target CPA API:**
- ❌ `api/target-cpa/campaigns/route.ts`

**Debugging/Testing:**
- ❌ `api/test-db/route.ts` (can delete in production)

**TOTAL:** Delete 7 API routes (~700 lines)

---

## Types & Schemas: What's ACTUALLY Used

### ✅ KEEP - Types (6 types)

From `src/lib/db/types.ts`:
- ✅ `TargetCpaRow`
- ✅ `TargetCpaData`
- ✅ `TargetCpaFilters`
- ✅ `TargetCpaMetrics`
- ✅ `PhaseDistribution`
- ✅ `ModeDistribution`

### ❌ DELETE - Types (10 types)

From `src/lib/db/types.ts`:
- ❌ `BurstProtectionRow`
- ❌ `BurstProtectionData`
- ❌ `QueryFilters`
- ❌ `Advertiser`
- ❌ `DateRangeData`
- ❌ `Campaign`
- ❌ `EnrichedBurstProtectionRow`
- ❌ `QueryFiltersInternal`
- ❌ `TargetCpaCampaign`
- ❌ `StrategyMetrics`

### ✅ KEEP - Schemas (6 schemas)

From `src/lib/db/schema.ts`:
- ✅ `TargetCpaRowSchema`
- ✅ `TargetCpaDataSchema`
- ✅ `TargetCpaFiltersSchema`
- ✅ `TargetCpaMetricsSchema`
- ✅ `PhaseDistributionSchema`
- ✅ `ModeDistributionSchema`

### ❌ DELETE - Schemas (11 schemas)

From `src/lib/db/schema.ts`:
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

## Summary: Delete vs Keep

### Files to KEEP (19 files)

**Backend (6 files):**
1. `lib/db/vertica.ts` - DB connection
2. `lib/db/queries.ts` - 3 functions only
3. `lib/db/types.ts` - 6 types only
4. `lib/db/schema.ts` - 6 schemas only
5. `lib/db/query-builder.ts` - Helper functions
6. `lib/api/*` - Error handler, cache handler, param parser

**API Routes (3 files):**
7. `app/api/target-cpa/route.ts`
8. `app/api/target-cpa/metrics/route.ts`
9. `app/api/pool-stats/route.ts`

**Hooks (2 files):**
10. `lib/hooks/useTargetCpaData.ts`
11. `lib/hooks/useTargetCpaMetrics.ts`

**Utils (1 file):**
12. `lib/analytics/calculators.ts` - 2 functions only

**Pages (1 file):**
13. `app/page.tsx`

**Components (~13 files):**
14-26. UI components, filters, loading

### Files to DELETE (60+ files)

**API Routes:** 7 files
**Hooks:** 11 files
**Components:** 35+ files
**Queries:** 8 functions (~420 lines)
**Analytics:** 1 file + ~250 lines
**Types:** 10 types
**Schemas:** 11 schemas

---

## Estimated Impact

### Code Reduction
- **Before:** ~110 files, ~15,000 lines
- **After:** ~45 files, ~5,000 lines
- **Reduction:** 59% files, 67% lines

### Bundle Size
- **Before:** ~2.5MB (dev build)
- **After:** ~1.2MB (estimated)
- **Reduction:** 52%

### Maintenance
- **Before:** 110 files to maintain
- **After:** 45 files to maintain
- **Reduction:** 59% less to maintain

---

## Dependencies That Can Be Removed

After cleanup, check if these can be removed from `package.json`:

**Potentially Unused (need verification):**
- `react-countup` - Used in AnimatedNumber (deleted component)
- `framer-motion` - Used in chart animations (deleted components)
- `recharts` - Used for charts (deleted components)
- `cmdk` - Command palette (check if used)

**Keep:**
- `@radix-ui/*` - Used by UI components
- `@tanstack/react-query` - Core functionality
- `date-fns` - Used by DateRangePicker
- `lucide-react` - Icons used in page
- `vertica` - Database driver
- `generic-pool` - Connection pooling
- `node-cache` - Caching
- `zod` - Validation

---

## Cleanup Execution Order

### Phase 1: Delete API Routes (5 min)
```bash
rm -rf src/app/api/burst-protection/
rm src/app/api/target-cpa/campaigns/route.ts
rm src/app/api/test-db/route.ts
```

### Phase 2: Delete Hooks (5 min)
```bash
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
```

### Phase 3: Delete Components (10 min)
```bash
rm -rf src/components/charts/
rm -rf src/components/dashboard/
rm -rf src/components/cards/
rm -rf src/components/errors/
rm src/components/filters/AdvertiserSelect.tsx
rm src/components/filters/CampaignSelect.tsx
rm src/components/loading/ChartSkeleton.tsx
```

### Phase 4: Clean Database Layer (10 min)
- Edit `src/lib/db/queries.ts` - remove 8 functions
- Edit `src/lib/db/types.ts` - remove 10 types
- Edit `src/lib/db/schema.ts` - remove 11 schemas

### Phase 5: Clean Analytics Layer (5 min)
- Edit `src/lib/analytics/calculators.ts` - remove all except 2 functions
- Delete `src/lib/analytics/aggregators.ts`

### Phase 6: Verify & Test (10 min)
```bash
pnpm build
pnpm dev
# Test UI
# Verify no errors
```

**Total Time:** ~45 minutes

---

## Success Criteria

After cleanup:
- ✅ `pnpm build` succeeds
- ✅ No TypeScript errors
- ✅ App loads at http://localhost:3000
- ✅ Filters work (phase, mode, date, toggle)
- ✅ Metrics display correctly
- ✅ Data table displays
- ✅ Pagination works
- ✅ API endpoints return 200

---

## Conclusion

The app currently has **60+ unused files** (59% of codebase) from the old Burst Protection feature.

**Action:** Execute phased cleanup to remove all dead code.

**Risk:** Low - all unused code, easy to rollback via git.

**Benefit:** 67% less code, clearer structure, easier maintenance.

