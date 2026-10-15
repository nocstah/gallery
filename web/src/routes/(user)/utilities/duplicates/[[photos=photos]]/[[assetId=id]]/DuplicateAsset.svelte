<script lang="ts">
  import { lang, locale } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { getAllMetadataItems, type DifferingMetadataFields } from '$lib/utils/duplicate-utils';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { getAllAlbums, type AssetResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiBookmarkOutline, mdiHeart, mdiImageMultipleOutline, mdiMagnifyPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import InfoRow from './InfoRow.svelte';

  interface Props {
    asset: AssetResponseDto;
    isSelected: boolean;
    onSelectAsset: (asset: AssetResponseDto) => void;
    onViewAsset: (asset: AssetResponseDto) => void;
    differingMetadataFields: DifferingMetadataFields;
    showMore?: boolean;
    initialVisibleCount?: number;
  }

  let {
    asset,
    isSelected,
    onSelectAsset,
    onViewAsset,
    differingMetadataFields,
    showMore = false,
    initialVisibleCount = 5,
  }: Props = $props();

  const listFormat = $derived(new Intl.ListFormat($lang));
  const isFromExternalLibrary = $derived(!!asset.libraryId);

  const visibleMetadataItems = $derived(
    getAllMetadataItems(asset, $t, $locale)
      .filter(({ keys }) => keys.some((k) => differingMetadataFields[k]))
      .slice(0, showMore ? undefined : initialVisibleCount),
  );
</script>

<!-- Local Omarchy layer: a column on the ground, not a card. The photo is a tile (the theme's corner, a hairline inset,
     the accent border while pointed at); a photo to keep carries the ink frame of a selected photo, and every chip on it
     is strong glass with white text (upstream's green, red and primary chips). Its details follow in rows split by
     hairlines, with no tint behind the one to keep -->
<div class="ws-dup-asset">
  <div class="ws-dup-tile" class:ws-dup-kept={isSelected}>
    <button
      type="button"
      onclick={() => onSelectAsset(asset)}
      class="ws-dup-pick"
      aria-pressed={isSelected}
      aria-label={$t('keep')}
    >
      <img src={getAssetMediaUrl({ id: asset.id })} alt={$getAltText(toTimelineAsset(asset))} draggable="false" />

      {#if asset.isFavorite}
        <span class="ws-dup-favorite"><Icon icon={mdiHeart} size="20" /></span>
      {/if}

      <span class="ws-dup-chip ws-dup-state">{isSelected ? $t('keep') : $t('to_trash')}</span>

      {#if isFromExternalLibrary || asset.stack?.assetCount}
        <span class="ws-dup-chips">
          {#if isFromExternalLibrary}
            <span class="ws-dup-chip">{$t('external')}</span>
          {/if}
          {#if asset.stack?.assetCount}
            <span class="ws-dup-chip ws-dup-chip-data">
              {asset.stack.assetCount}
              <Icon icon={mdiImageMultipleOutline} size="14" />
            </span>
          {/if}
        </span>
      {/if}
    </button>

    <button type="button" onclick={() => onViewAsset(asset)} class="ws-dup-view" title={$t('view')}>
      <Icon aria-label={$t('view')} icon={mdiMagnifyPlus} flipped size="18" />
    </button>
  </div>

  <div class="ws-dup-rows">
    {#each visibleMetadataItems as { icon, title, render, tooltip, keys } (keys[0])}
      <InfoRow {icon} {title} {tooltip}>
        {render}
      </InfoRow>
    {/each}

    <!-- Albums always shown -->
    <InfoRow icon={mdiBookmarkOutline} title={$t('albums')}>
      {#await getAllAlbums({ assetId: asset.id })}
        {$t('scanning_for_album')}
      {:then albums}
        {#if albums.length === 1}
          {albums[0].albumName}
        {:else}
          <span title={listFormat.format(albums.map(({ albumName }) => albumName))}>
            {$t('in_albums', { values: { count: albums.length } })}
          </span>
        {/if}
      {/await}
    </InfoRow>
  </div>
</div>

<style>
  .ws-dup-asset {
    min-width: 0;
  }
  .ws-dup-tile {
    position: relative;
    aspect-ratio: var(--ws-dup-ratio, 4 / 3);
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-dup-pick {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    border-radius: inherit;
  }
  .ws-dup-pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }
  /* the frame over the photo: a hairline at rest, the accent border while pointed at (as every photo tile); a photo to
     keep carries the selected photo's ink frame, with a thin line of the ground inside it */
  .ws-dup-pick::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
    transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-dup-pick:is(:hover, :focus-visible)::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-dup-kept .ws-dup-pick::after {
    box-shadow:
      inset 0 0 0 calc(var(--ws-border) + 2px) var(--immich-ui-dark),
      inset 0 0 0 calc(var(--ws-border) + 3px) var(--immich-ui-light);
  }
  .ws-dup-kept .ws-dup-pick:is(:hover, :focus-visible)::after {
    box-shadow:
      inset 0 0 0 var(--ws-border) var(--ws-accent),
      inset 0 0 0 calc(var(--ws-border) + 2px) var(--immich-ui-dark),
      inset 0 0 0 calc(var(--ws-border) + 3px) var(--immich-ui-light);
  }
  .ws-dup-pick:focus-visible {
    outline: none;
  }
  .ws-dup-favorite {
    position: absolute;
    inset-inline-start: 0.5rem;
    bottom: 0.5rem;
    color: #fff;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5));
  }
  /* chips on the photo: strong glass, white text in the small caption type, the theme's corner */
  .ws-dup-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: #fff;
    font-size: var(--ws-text-micro);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }
  .ws-dup-chip-data {
    font-family: var(--ws-font-data);
    font-variant-numeric: tabular-nums;
  }
  .ws-dup-state {
    position: absolute;
    inset-inline-end: 0.5rem;
    bottom: 0.5rem;
  }
  .ws-dup-chips {
    position: absolute;
    inset-inline-end: 0.5rem;
    top: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }
  .ws-dup-view {
    position: absolute;
    inset-inline-start: 0.5rem;
    top: 0.5rem;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: #fff;
    transition: background-color 120ms;
  }
  .ws-dup-view:hover {
    background: rgb(10 10 12 / 0.82);
  }
  .ws-dup-view:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
  }
  .ws-dup-rows {
    margin-top: 0.25rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-dup-pick::after,
    .ws-dup-view {
      transition: none;
    }
  }
</style>
