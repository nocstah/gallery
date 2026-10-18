<script lang="ts">
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { placeLine, placeYears, type PlaceStats } from '$lib/utils/place-stats';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  // Local Omarchy layer: a place as a window tile (DESIGN.md, Places), as Years, Months and the memories are: its photo
  // at full brightness under the caption scrim, which carries the name and, in data type, how many photos the place
  // holds and the years they span ("1,375 · 2010–2026", managers/place-stats); a hairline inside, the accent's inset
  // border for focus and the pointer. Upstream dimmed every photo to 75% under a centred name. Opens the Photos page
  // filtered to the place, the country with the city so the filter nests it (#989).

  interface Props {
    /** the place's photo (GET /search/cities: one per city) */
    assetId: string;
    city: string;
    country?: string | null;
    /** its count and years once they are in (null: they could not be read) */
    stats?: PlaceStats | null;
    class?: string;
  }

  let { assetId, city, country, stats, class: className = '' }: Props = $props();

  const label = $derived(
    stats ? $t('place_tile_label', { values: { place: city, count: stats.count, years: placeYears(stats) } }) : city,
  );
</script>

<a
  class="ws-place-tile {className}"
  href={Route.photos({ city, country: country ?? undefined })}
  draggable="false"
  aria-label={label}
  data-testid="place-tile"
>
  <img src={getAssetMediaUrl({ id: assetId, size: AssetMediaSize.Thumbnail })} alt="" loading="lazy" />
  <span class="ws-place-tile-caption" aria-hidden="true">
    <span class="ws-place-tile-name">{city}</span>
    {#if stats}
      <span class="ws-place-tile-data" lang={$locale}>{placeLine(stats, $locale)}</span>
    {/if}
  </span>
</a>

<style>
  .ws-place-tile {
    position: relative;
    display: block;
    aspect-ratio: 1;
    width: 100%;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, var(--immich-ui-light));
  }
  .ws-place-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* the window's edge: a hairline inside, the accent for focus and the pointer */
  .ws-place-tile::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
    transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-place-tile:hover::after,
  .ws-place-tile:focus-visible::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-place-tile:focus-visible {
    outline: none;
  }
  /* the caption scrim under white words, fixed (it sits on the photo, not on the theme): at least 55% black behind
     every word, what the name and its line, both small type, need for 4.5:1 over a white wall, easing out in the band
     above them as Years' scrim does (2026-10-18). It had faded from 55% at its foot to nothing, the name on about a
     quarter of that: 1.7:1 over a bright photo, 56 of 224 lines under AA on the AORUS */
  .ws-place-tile-caption {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 2.25rem 0.6rem 0.45rem;
    background: linear-gradient(
      to top,
      rgb(0 0 0 / 0.62),
      rgb(0 0 0 / 0.55) calc(100% - 2.25rem),
      rgb(0 0 0 / 0.39) calc(100% - 1.6rem),
      rgb(0 0 0 / 0.19) calc(100% - 0.95rem),
      rgb(0 0 0 / 0.06) calc(100% - 0.4rem),
      transparent
    );
    color: #fff;
  }
  .ws-place-tile-name {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font-size: var(--ws-text-ui);
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  /* full white like the name (85% left it at 4.1:1 over a white wall on the scrim's floor); the face and the size set
     it apart */
  .ws-place-tile-data {
    overflow: hidden;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-place-tile::after {
      transition: none;
    }
  }
</style>
