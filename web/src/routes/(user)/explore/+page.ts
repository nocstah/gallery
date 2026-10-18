import {
  type AssetResponseDto,
  getAllPeople,
  getAssetsByCity,
  getExploreData,
  getTimeBucketCovers,
  getTimeBuckets,
  MemorySearchOrder,
  TimeBucketSize,
} from '@immich/sdk';
import { createFilterState } from '$lib/components/filter-panel/filter-panel';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { memoryManager } from '$lib/managers/memory-manager.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { buildPhotosTimelineOptions } from '$lib/utils/photos-filter-options';
import { weekDaysAcrossYears, weekYears, type WeekYear } from '$lib/utils/week-across-years';
import type { PageLoad } from './$types';

/**
 * Local Omarchy layer: this week in every past year with photos in it, one photo each (utils/week-across-years), from
 * the Photos page's own timeline: its months, then the covers of this week's days in the years that have photos in
 * the week's months. Two requests; a failure leaves the row out.
 */
const loadWeekAcrossYears = async (): Promise<WeekYear[]> => {
  if (!authManager.authenticated) {
    return [];
  }
  const scope = buildPhotosTimelineOptions(createFilterState(), authManager.user.id) as Parameters<
    typeof getTimeBuckets
  >[0];
  const today = new Date();
  const months = await getTimeBuckets({ ...authManager.params, ...scope, bucketSize: TimeBucketSize.Month });
  const days = weekDaysAcrossYears(today, months);
  if (days.length === 0) {
    return [];
  }
  const covers = await getTimeBucketCovers({
    ...authManager.params,
    ...scope,
    bucketSize: TimeBucketSize.Day,
    timeBuckets: days.map(({ key }) => key),
  });
  return weekYears(today, days, covers);
};

export const load = (async ({ url }) => {
  await authenticate(url);
  memoryManager.setFilters({ size: 12, order: MemorySearchOrder.Desc });
  await memoryManager.applyPreferences();

  const [explore, people, cities, week] = await Promise.all([
    getExploreData(),
    getAllPeople({ withHidden: false, withSharedSpaces: true }),
    // Local Omarchy layer: every place, for the row of those that hold the most photos (managers/place-stats); a
    // failure leaves the row out rather than the page
    getAssetsByCity().catch((): AssetResponseDto[] => []),
    loadWeekAcrossYears().catch((): WeekYear[] => []),
    memoryManager.refresh(),
  ]);
  const $t = await getFormatter();

  return {
    explore,
    people,
    cities,
    week,
    meta: {
      title: $t('explore'),
    },
  };
}) satisfies PageLoad;
