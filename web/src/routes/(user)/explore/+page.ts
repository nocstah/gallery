import { getAllPeople, getAssetsByCity, getExploreData, MemorySearchOrder } from '@immich/sdk';
import { memoryManager } from '$lib/managers/memory-manager.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  memoryManager.setFilters({ size: 12, order: MemorySearchOrder.Desc });
  await memoryManager.applyPreferences();

  const [explore, people, cities] = await Promise.all([
    getExploreData(),
    getAllPeople({ withHidden: false, withSharedSpaces: true }),
    // Local Omarchy layer: every place, for the row of those that hold the most photos (managers/place-stats); a
    // failure leaves the row out rather than the page
    getAssetsByCity().catch(() => []),
    memoryManager.refresh(),
  ]);
  const $t = await getFormatter();

  return {
    explore,
    people,
    cities,
    meta: {
      title: $t('explore'),
    },
  };
}) satisfies PageLoad;
