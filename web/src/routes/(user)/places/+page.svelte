<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import { placeFaces } from '$lib/managers/place-faces.svelte';
  import { placeStats } from '$lib/managers/place-stats.svelte';
  import PlacesControls from './PlacesControls.svelte';
  import type { PageData } from './$types';
  import { type AssetResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { locale } from '$lib/stores/preferences.store';
  import { rankPlaces } from '$lib/utils/place-stats';
  import Places from './PlacesList.svelte';
  import { placesViewSettings } from '$lib/stores/preferences.store';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  type AssetWithCity = AssetResponseDto & {
    exifInfo: {
      city: string;
    };
  };

  let searchQuery = $state('');
  let searchResultCount = $state(0);
  let placesGroups: string[] = $state([]);

  let cities = $derived(data.items.filter((item): item is AssetWithCity => !!item.exifInfo?.city));

  // Local Omarchy layer: the places that hold the most photos first (managers/place-stats; upstream: by the city's
  // name), each with its count and years. The grid waits for the counts (a moment at most) and keeps the order it
  // first took, so no tile moves under the reader's eyes; a count that comes later only fills its tile in. A place
  // the Photos page would show nothing for (its photos all archived, or another account's) is left out.
  const PATIENCE_MS = 2000;
  const keyOf = (item: AssetWithCity) => ({ city: item.exifInfo.city, country: item.exifInfo.country });
  let order = $state<string[]>();
  onMount(() => {
    const items = cities;
    void placeStats
      .settle(
        items.map((item) => keyOf(item)),
        PATIENCE_MS,
      )
      .then(() => {
        const ranked = rankPlaces(items, keyOf, (place) => placeStats.get(place), $locale);
        order = ranked.map(({ id }) => id);
        // Local Omarchy layer: the first screen's faces asked for first, the places with the most photos first
        // (managers/place-faces); each tile asks for its own as it comes near the view
        placeFaces.request(ranked.slice(0, placeFaces.firstScreen()).map((item) => keyOf(item)));
      });
  });
  let places = $derived.by(() => {
    if (!order) {
      return [];
    }
    const byId = new Map(cities.map((item) => [item.id, item]));
    return order
      .map((id) => byId.get(id))
      .filter((item): item is AssetWithCity => !!item && placeStats.get(keyOf(item))?.count !== 0);
  });
  let countVisiblePlaces = $derived(searchQuery ? searchResultCount : order ? places.length : cities.length);

  let innerHeight: number = $state(0);
</script>

<svelte:window bind:innerHeight />

<UserPageLayout
  title={$t('places')}
  description={countVisiblePlaces === 0 && !searchQuery ? undefined : `(${countVisiblePlaces.toLocaleString($locale)})`}
>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <PlacesControls {placesGroups} bind:searchQuery />
    </div>
  {/snippet}

  {#if order}
    <Places
      {places}
      userSettings={$placesViewSettings}
      {searchQuery}
      bind:searchResultCount
      bind:placesGroupIds={placesGroups}
      onClearSearch={() => (searchQuery = '')}
    />
  {:else}
    <div class="flex items-center justify-center py-16">
      <LoadingSpinner size="giant" />
    </div>
  {/if}
</UserPageLayout>
