<script lang="ts">
  // Local Omarchy layer: one photo of a series' memory as a small square tile (gallery/series): Gallery's thumbnail with
  // the owner's session, a clip's play mark and a favourite's heart in the tiles' corner chips, and the memory's cover
  // framed in ink, the inversion the layer marks a chosen one with. Its words name it by its place in the film.
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiHeart, mdiPlay } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { SeriesPhoto } from './series-api';

  type Props = {
    photo: SeriesPhoto;
    /** its place in the list, from 0 */
    index: number;
    cover?: boolean;
  };

  let { photo, index, cover = false }: Props = $props();

  const label = $derived(
    $t(photo.video ? 'memory_series_clip' : 'memory_series_photo', { values: { number: index + 1 } }),
  );
</script>

<span
  class="series-tile"
  data-cover={cover || undefined}
  data-video={photo.video || undefined}
  title={cover ? $t('memory_series_cover') : undefined}
>
  <img
    src={getAssetMediaUrl({ id: photo.id, size: AssetMediaSize.Thumbnail })}
    alt={label}
    loading="lazy"
    draggable="false"
  />
  {#if photo.video}
    <span class="series-tile-mark series-tile-clip" aria-hidden="true"><Icon icon={mdiPlay} size="14" /></span>
  {/if}
  {#if photo.favourite}
    <span class="series-tile-mark series-tile-heart">
      <Icon icon={mdiHeart} size="12" aria-hidden />
      <span class="sr-only">{$t('favorite')}</span>
    </span>
  {/if}
  {#if cover}
    <span class="sr-only">{$t('memory_series_cover')}</span>
  {/if}
</span>

<style>
  .series-tile {
    position: relative;
    display: block;
    width: var(--series-tile, 4.5rem);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
  /* the edge every tile has, and the cover's frame in ink */
  .series-tile::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
  }
  .series-tile[data-cover]::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--immich-ui-dark);
  }
  /* the corner chips of a photo's tile, on strong glass */
  .series-tile-mark {
    position: absolute;
    display: inline-grid;
    place-items: center;
    padding: 0.125rem;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    /* the caption's ink: it sits on the photo, not on the theme */
    color: #fff;
  }
  .series-tile-clip {
    top: 0.25rem;
    right: 0.25rem;
  }
  .series-tile-heart {
    bottom: 0.25rem;
    left: 0.25rem;
  }
</style>
