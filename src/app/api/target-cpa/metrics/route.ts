import { NextRequest } from 'next/server';
import { getTargetCpaMetrics } from '@/lib/db/queries';
import { TargetCpaFiltersSchema } from '@/lib/db/schema';
import { handleApiError } from '@/lib/api/error-handler';
import { checkCache, setCache, createCachedResponse } from '@/lib/api/cache-handler';
import { parseQueryParams } from '@/lib/api/param-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('=== Target CPA Metrics API Called ===');

    const validatedParams = parseQueryParams(request, TargetCpaFiltersSchema);
    console.log('Validated params:', validatedParams);

    const cacheOptions = {
      keyPrefix: 'tcpa:metrics',
      keyParams: {
        startDate: validatedParams.startDate,
        endDate: validatedParams.endDate,
        campaignId: validatedParams.campaignId,
        phase: validatedParams.phase,
        mode: validatedParams.mode,
        onlyWithBothPointers: validatedParams.onlyWithBothPointers,
      },
      ttl: 300,
    };

    const cachedData = checkCache<{
      metrics: unknown;
      metadata: unknown;
    }>(request, cacheOptions);

    if (cachedData) {
      return createCachedResponse(cachedData, {
        cached: true,
        query_time_ms: 0,
        cache_age_ms: Date.now() - startTime,
      });
    }

    console.log('Executing Target CPA metrics query...');
    const metrics = await getTargetCpaMetrics(validatedParams);
    console.log('Metrics calculated:', metrics);

    const metadata = {
      query_time_ms: Date.now() - startTime,
      filters_applied: {
        date_range: validatedParams.startDate && validatedParams.endDate,
        campaign: !!validatedParams.campaignId,
        phase: !!validatedParams.phase,
        mode: !!validatedParams.mode,
        only_with_both_pointers: !!validatedParams.onlyWithBothPointers,
      },
    };

    const responseData = {
      metrics,
      metadata,
    };

    setCache(responseData, cacheOptions);

    return createCachedResponse(responseData, {
      cached: false,
      query_time_ms: Date.now() - startTime,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
