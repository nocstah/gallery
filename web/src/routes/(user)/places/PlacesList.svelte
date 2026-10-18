<script lang="ts">
  import EmptyState from '$lib/components/omarchy/EmptyState.svelte';
  import { placeStats } from '$lib/managers/place-stats.svelte';
  import { PlacesGroupBy, type PlacesViewSettings } from '$lib/stores/preferences.store';
  import { normalizeSearchString } from '$lib/utils/string-utils';
  import { type AssetResponseDto } from '@immich/sdk';
  import { groupBy } from 'lodash-es';
  import PlacesCardGroup from './PlacesCardGroup.svelte';

  import { type PlacesGroup } from '$lib/utils/places-utils';
  import { t } from 'svelte-i18n';

  interface Props {
    places?: AssetResponseDto[];
    searchQuery?: string;
    searchResultCount: number;
    userSettings: PlacesViewSettings;
    placesGroupIds?: string[];
    /** Local Omarchy layer: empties the search field, the next step when a search finds no place */
    onClearSearch?: () => void;
  }

  let {
    places = $bindable([]),
    searchQuery = '',
    // eslint-disable-next-line no-useless-assignment
    searchResultCount = $bindable(0),
    userSettings,
    // eslint-disable-next-line no-useless-assignment
    placesGroupIds = $bindable([]),
    onClearSearch,
  }: Props = $props();

  interface PlacesGroupOption {
    [option: string]: (places: AssetResponseDto[]) => PlacesGroup[];
  }

  const groupOptions: PlacesGroupOption = {
    /** No grouping */
    [PlacesGroupBy.None]: (places): PlacesGroup[] => {
      return [
        {
          id: $t('places'),
          name: $t('places'),
          places,
        },
      ];
    },

    /** Group by year */
    [PlacesGroupBy.Country]: (places): PlacesGroup[] => {
      const unknownCountry = $t('unknown_country');

      const groupedByCountry = groupBy(places, (place) => {
        return place.exifInfo?.country ?? unknownCountry;
      });

      // Local Omarchy layer: the countries that hold the most photos first, as the places within them already stand
      // (managers/place-stats); upstream sorted them by name. Places without a country stay at the end.
      const photosIn = (places: AssetResponseDto[]) =>
        places.reduce(
          (sum, place) =>
            sum + (placeStats.get({ city: place.exifInfo?.city ?? '', country: place.exifInfo?.country })?.count ?? 0),
          0,
        );
      const sortedByCountryName = Object.entries(groupedByCountry).sort(([a, inA], [b, inB]) => {
        // We make sure empty albums stay at the end of the list
        if (a === unknownCountry) {
          return 1;
        }
        return b === unknownCountry ? -1 : photosIn(inB) - photosIn(inA) || a.localeCompare(b);
      });

      return sortedByCountryName.map(([country, places]) => ({
        id: country,
        name: country,
        places,
      }));
    },
  };

  const filteredPlaces = $derived.by(() => {
    const searchQueryNormalized = normalizeSearchString(searchQuery);
    return searchQueryNormalized
      ? places.filter((place) => normalizeSearchString(place.exifInfo?.city ?? '').includes(searchQueryNormalized))
      : places;
  });

  const groupingFunction = $derived(groupOptions[userSettings.groupBy] ?? groupOptions[PlacesGroupBy.None]);
  const groupedPlaces = $derived(groupingFunction(filteredPlaces));

  $effect(() => {
    searchResultCount = filteredPlaces.length;
  });

  $effect(() => {
    placesGroupIds = groupedPlaces.map(({ id }) => id);
  });
</script>

<!-- Local Omarchy layer: the empty states stand on the gutter in the Empty State's grammar (DESIGN.md, Places), where
     upstream centred a crossed-out marker over "No places"; and a search that finds no place says so (it left the page
     blank) -->
{#if places.length > 0 && filteredPlaces.length === 0}
  <EmptyState
    title={$t('places_no_match', { values: { query: searchQuery.trim() } })}
    action={onClearSearch ? { label: $t('filter_sheet_picker_clear_search'), onclick: onClearSearch } : undefined}
    testId="places-no-match"
  />
{:else if places.length > 0}
  {#if userSettings.groupBy === PlacesGroupBy.None}
    <PlacesCardGroup places={groupedPlaces[0].places} />
  {:else}
    {#each groupedPlaces as placeGroup (placeGroup.id)}
      <PlacesCardGroup places={placeGroup.places} group={placeGroup} />
    {/each}
  {/if}
{:else}
  <EmptyState title={$t('places_empty_title')} body={$t('places_empty_body')} testId="places-empty" />
{/if}
