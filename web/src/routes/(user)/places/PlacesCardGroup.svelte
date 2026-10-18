<script lang="ts">
  import PlaceTile from '$lib/components/places/PlaceTile.svelte';
  import { placeStats } from '$lib/managers/place-stats.svelte';
  import { placesViewSettings } from '$lib/stores/preferences.store';
  import { type PlacesGroup, isPlacesGroupCollapsed, togglePlacesGroupCollapsing } from '$lib/utils/places-utils';
  import { type AssetResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiChevronRight } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    places: AssetResponseDto[];
    group?: PlacesGroup | undefined;
  }

  let { places, group = undefined }: Props = $props();

  let isCollapsed = $derived(!!group && isPlacesGroupCollapsed($placesViewSettings, group.id));
  let iconRotation = $derived(isCollapsed ? 'rotate-0' : 'rotate-90');
</script>

{#if group}
  <div class="grid">
    <button
      type="button"
      onclick={() => togglePlacesGroupCollapsing(group.id)}
      class="my-2 w-fit pe-2 pt-2 dark:text-immich-dark-fg"
      aria-expanded={!isCollapsed}
    >
      <Icon icon={mdiChevronRight} size="24" class="-mt-2.5 inline-block transition-all duration-250 {iconRotation}" />
      <span class="text-3xl font-bold text-black dark:text-white">{group.name}</span>
      <span class="ms-1.5">({$t('places_count', { values: { count: places.length } })})</span>
    </button>
    <hr class="dark:border-immich-dark-gray" />
  </div>
{/if}

<div class="mt-4">
  {#if !isCollapsed}
    <!-- Local Omarchy layer: the places fill the width at every width, as Albums and People do: square tiles at least
         9rem wide on the desktop's gap, two to a row on a phone. Upstream sized each tile from the window and capped it
         at 156px, which left a third of a phone's row and the end of every wider one empty. Each tile is a window with
         its count and years (PlaceTile), where upstream dimmed the photo under a centred name -->
    <div class="grid grid-auto-fill-36 gap-(--ws-gap)" data-testid="places-grid">
      {#each places as item (item.id)}
        {@const city = item.exifInfo?.city ?? ''}
        {@const country = item.exifInfo?.country}
        <PlaceTile assetId={item.id} {city} {country} stats={placeStats.get({ city, country })} />
      {/each}
    </div>
  {/if}
</div>
