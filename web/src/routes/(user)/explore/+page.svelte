<script lang="ts">
  import { lazyComponent } from '$lib/utils/lazy-component.svelte';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import PersonIndicator from '$lib/components/faces-page/PersonIndicator.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import EmptyState from '$lib/components/omarchy/EmptyState.svelte';
  import PlaceTile from '$lib/components/places/PlaceTile.svelte';
  import SingleGridRow from '$lib/components/shared-components/SingleGridRow.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { memoryManager } from '$lib/managers/memory-manager.svelte';
  import { placeStats } from '$lib/managers/place-stats.svelte';
  import { Route } from '$lib/route';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { locale, peopleViewSettings } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl, memoryLaneTitle } from '$lib/utils';
  import { getGlobalPersonHref, getGlobalPersonThumbnailUrl } from '$lib/utils/global-person-route';
  import {
    getAssetInfo,
    AssetMediaSize,
    type AssetResponseDto,
    type PersonResponseDto,
    type SearchExploreResponseDto,
  } from '@immich/sdk';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import MemoryCard from '$lib/components/memories/MemoryCard.svelte';
  import { memoryFacts } from '$lib/managers/memory-facts.svelte';
  import { memoryCardLine, type MemoryCard as MemoryCardModel } from '$lib/utils/memory-cards';
  import { memoryCover } from '$lib/utils/memory-title';
  import { sortPeople } from '$lib/utils/people-utils';
  import { rankPlaces, type PlaceKey } from '$lib/utils/place-stats';
  import { workspaceGap } from '$lib/managers/VirtualScrollManager/VirtualScrollManager.svelte';
  import { pxOf } from '$lib/utils/review-grid';
  import { tileRowColumns } from '$lib/utils/tile-row';
  import { weekSpread, weekYearDays } from '$lib/utils/week-across-years';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import Portal from '$lib/elements/Portal.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const getFieldItems = (items: SearchExploreResponseDto[], field: string) => {
    const targetField = items.find((item) => item.fieldName === field);
    return targetField?.items || [];
  };

  let recents = $derived(
    getFieldItems(data.explore, 'createdAt').sort((a, b) => new Date(b.value).getTime() - new Date(a.value).getTime()),
  );

  // Local Omarchy layer: Explore's rows in the Places, People and Memories pages' own order (DESIGN.md, Explore), each
  // on the page's one gutter under a heading of the section-label style with View all at its end. Upstream listed the
  // people by name and the places by the first twelve names with five photos, dimmed, and the memories as the server
  // made them, one card per rule and day.

  // the people as the People page orders them (its sort: favourites first, then the most photos by default)
  let people = $state(sortPeople(data.people.people, $peopleViewSettings.sortBy));

  // the places that hold the most photos, as the Places page orders them (managers/place-stats, which the two share):
  // the row waits for the counts (a moment at most) and keeps the order it first took
  type City = AssetResponseDto & { exifInfo: { city: string } };
  const PLACES_PATIENCE_MS = 2000;
  const cities = $derived(data.cities.filter((item): item is City => !!item.exifInfo?.city));
  const keyOf = (item: City): PlaceKey => ({ city: item.exifInfo.city, country: item.exifInfo.country });
  let places = $state<City[]>();
  onMount(() => {
    const items = cities;
    void placeStats
      .settle(
        items.map((item) => keyOf(item)),
        PLACES_PATIENCE_MS,
      )
      .then(() => {
        places = rankPlaces(items, keyOf, (place) => placeStats.get(place), $locale).filter(
          (item) => placeStats.get(keyOf(item))?.count !== 0,
        );
      });
  });

  // the memories as the Memories page shows them (memoryManager.cards): those that read the same as one card, today's
  // first, each with its kind; the upcoming ones wait for their day. The cards wait for Curator's facts (a moment at
  // most), which title them, pick their covers and tell which read the same.
  $effect(() => {
    memoryFacts.request(memoryManager.memories.map(({ id }) => id));
  });
  const memoriesReady = $derived(memoryFacts.settledAll(memoryManager.memories.map(({ id }) => id)));
  const cards = $derived(memoriesReady ? memoryManager.cards.filter(({ section }) => section !== 'upcoming') : []);

  // this week across the years: a row too short for every year shows a spread of them (the newest, five, ten and twenty
  // years ago, the oldest, and between), and All N years at the heading's end opens them all (utils/week-across-years)
  let weekSlots = $state(1);
  let weekOpen = $state(false);
  const weekShown = $derived(weekOpen ? data.week : weekSpread(data.week, weekSlots, new Date().getFullYear()));

  // recently added: square tiles of at least 9rem (the Places tiles'), as many as fit one row; fewer than it holds are
  // widened a little to fill it (utils/tile-row: the server sends twelve, the AORUS's row holds fourteen)
  let recentWidth = $state(0);
  const recentColumns = $derived.by(() => {
    const rem = typeof document === 'undefined' ? 16 : pxOf(getComputedStyle(document.documentElement).fontSize, 16);
    return tileRowColumns(recentWidth, recents.length, { min: 9 * rem, gap: workspaceGap() });
  });

  let hasPeople = $derived(data.people.total > 0);

  const onPersonThumbnailReady = ({ id }: { id: string }) => {
    for (const person of people) {
      if (person.id === id) {
        person.updatedAt = new Date().toISOString();
      }
    }
  };

  const onViewAsset = async (id: string) => {
    const asset = await getAssetInfo({ ...authManager.params, id });
    assetViewerManager.setAsset(asset);
  };

  const assetCursor = $derived({
    current: assetViewerManager.asset!,
  });

  const getPersonHref = (person: PersonResponseDto) => getGlobalPersonHref(person, Route.explore());

  const getPersonThumbnail = (person: PersonResponseDto) => getGlobalPersonThumbnailUrl(person);

  // Mounting the viewer through `{#await}` leaves it permanently unreactive on reopen.
  // See lazyComponent().
  const LazyAssetViewer = lazyComponent(() => import('$lib/components/asset-viewer/AssetViewer.svelte'));
</script>

<OnEvents {onPersonThumbnailReady} />

<UserPageLayout title={data.meta.title}>
  <div class="ws-sharing ws-explore">
    {#if data.week.length > 0}
      <!-- this week in every past year with photos in it, newest first, each year's numeral in the display face over
           the photo of its day nearest today's (utils/week-across-years); a year opens Photos at that photo -->
      <section class="ws-sharing-section" aria-labelledby="explore-week">
        <h2 class="ws-sharing-heading" id="explore-week">
          {$t('explore_week_across_years')}
          {#if weekOpen || data.week.length > weekSlots}
            <button
              type="button"
              class="ws-sharing-heading-action"
              aria-expanded={weekOpen}
              aria-controls="explore-week-years"
              onclick={() => (weekOpen = !weekOpen)}
            >
              {weekOpen ? $t('show_less') : $t('explore_week_all_years', { values: { count: data.week.length } })}
            </button>
          {/if}
        </h2>
        <!-- one row of as many as fit (five on a phone), all of them in rows once opened -->
        <div id="explore-week-years">
          <SingleGridRow bind:itemCount={weekSlots} class="grid grid-cols-5 gap-(--ws-gap) md:grid-auto-fill-48">
            {#each weekShown as year (year.year)}
              <a class="ws-explore-tile ws-week-year" href={Route.photos({ at: year.assetId })} draggable="false">
                <img
                  src={getAssetMediaUrl({
                    id: year.assetId,
                    size: AssetMediaSize.Thumbnail,
                    cacheKey: year.thumbhash ?? undefined,
                  })}
                  alt=""
                  loading="lazy"
                />
                <span class="ws-week-year-caption">
                  <span class="ws-week-year-number">{year.year}</span>
                  <span class="ws-week-year-days" lang={$locale}>{weekYearDays(year, $locale)}</span>
                </span>
              </a>
            {/each}
          </SingleGridRow>
        </div>
      </section>
    {/if}

    {#if hasPeople}
      <section class="ws-sharing-section" aria-labelledby="explore-people">
        <h2 class="ws-sharing-heading" id="explore-people">
          {$t('people')}
          <a class="ws-sharing-heading-action" href={Route.people()} draggable="false">{$t('view_all')}</a>
        </h2>
        <SingleGridRow class="grid grid-flow-col grid-auto-fill-20 gap-x-4 md:grid-auto-fill-28">
          {#snippet children({ itemCount })}
            {#each people.slice(0, itemCount) as person (person.id)}
              <a href={getPersonHref(person)} class="text-center">
                <div class="@container relative">
                  <ImageThumbnail
                    circle
                    shadow
                    url={getPersonThumbnail(person)}
                    altText={person.name}
                    widthStyle="100%"
                  />
                  <PersonIndicator {person} />
                </div>
                <p class="mt-2 text-sm font-medium text-ellipsis dark:text-white">{person.name}</p>
              </a>
            {/each}
          {/snippet}
        </SingleGridRow>
      </section>
    {/if}

    {#if cities.length > 0}
      <section class="ws-sharing-section" aria-labelledby="explore-places">
        <h2 class="ws-sharing-heading" id="explore-places">
          {$t('places')}
          <a class="ws-sharing-heading-action" href={Route.places()} draggable="false">{$t('view_all')}</a>
        </h2>
        <!-- the Places page's tiles at its size, on the desktop's gap; until the counts are in, their frames hold
             the row's place so nothing below it moves -->
        <SingleGridRow class="grid grid-flow-col grid-auto-fill-36 gap-(--ws-gap)">
          {#snippet children({ itemCount })}
            {#if places}
              {#each places.slice(0, itemCount) as item (item.id)}
                <PlaceTile
                  assetId={item.id}
                  city={item.exifInfo.city}
                  country={item.exifInfo.country}
                  stats={placeStats.get(keyOf(item))}
                />
              {/each}
            {:else}
              {#each cities.slice(0, itemCount) as item (item.id)}
                <div class="ws-explore-waiting" aria-hidden="true"></div>
              {/each}
            {/if}
          {/snippet}
        </SingleGridRow>
      </section>
    {/if}

    {#if cards.length > 0}
      <section class="ws-sharing-section" aria-labelledby="explore-memories">
        <h2 class="ws-sharing-heading" id="explore-memories">
          {$t('memories')}
          <a class="ws-sharing-heading-action" href={Route.memories()} draggable="false">{$t('view_all')}</a>
        </h2>
        <!-- the Memories page's cards, as many as fit one row; on a phone its first two, one under the other at the full
             width as there, so a title and its line keep to a line each (upstream's carousel set them in portrait,
             four lines a title, its arrow on the third card) -->
        {#snippet memoryCard(card: MemoryCardModel)}
          {@const cover = memoryCover(card.lead, memoryFacts.get(card.lead.id))}
          <MemoryCard
            class="size-full"
            item={{
              id: card.lead.id,
              title: $memoryLaneTitle(card.lead),
              subtitle: memoryCardLine(card, $t, $locale),
              href: Route.viewMemory({ id: card.lead.id, assetId: card.assets[0].id }),
              alt: $t('memory_lane_title', {
                values: { title: $getAltText(toTimelineAsset(cover.asset ?? card.assets[0])) },
              }),
              src: getAssetMediaUrl({ id: cover.id, cacheKey: cover.asset?.thumbhash }),
              isSaved: card.isSaved,
              type: card.lead.type,
            }}
          />
        {/snippet}
        {#if mediaQueryManager.maxMd}
          <div class="grid grid-cols-1 gap-(--ws-gap)">
            {#each cards.slice(0, 2) as card (card.lead.id)}
              {@render memoryCard(card)}
            {/each}
          </div>
        {:else}
          <SingleGridRow class="grid grid-flow-col grid-auto-fill-72 gap-(--ws-gap)">
            {#snippet children({ itemCount })}
              {#each cards.slice(0, itemCount) as card (card.lead.id)}
                {@render memoryCard(card)}
              {/each}
            {/snippet}
          </SingleGridRow>
        {/if}
      </section>
    {/if}

    {#if recents.length > 0}
      <section class="ws-sharing-section" aria-labelledby="explore-recent">
        <h2 class="ws-sharing-heading" id="explore-recent">
          {$t('recently_added')}
          <a class="ws-sharing-heading-action" href={Route.recentlyAdded()} draggable="false">{$t('view_all')}</a>
        </h2>
        <!-- Local Omarchy layer: square window tiles of at least the Places tiles' size on the desktop's gap, one row,
             as every row here (upstream: a collage of strips wrapped at uneven widths, 4px apart) -->
        <div
          bind:clientWidth={recentWidth}
          class="grid gap-(--ws-gap)"
          style:grid-template-columns={`repeat(${recentColumns}, minmax(0, 1fr))`}
        >
          {#each recents.slice(0, recentColumns) as item (item.data.id)}
            <button type="button" class="ws-explore-tile" onclick={() => onViewAsset(item.data.id)} draggable="false">
              <img
                src={getAssetMediaUrl({ id: item.data.id, size: AssetMediaSize.Thumbnail })}
                alt={$getAltText(toTimelineAsset(item.data))}
                loading="lazy"
                draggable="false"
              />
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if !hasPeople && cities.length === 0 && recents.length === 0}
      <EmptyState title={$t('nothing_here_yet')} body={$t('no_explore_results_message')} />
    {/if}
  </div>
</UserPageLayout>

{#if assetViewerManager.isViewing}
  {#if LazyAssetViewer.current}
    {@const AssetViewer = LazyAssetViewer.current}
    <Portal target="body">
      <AssetViewer
        cursor={assetCursor}
        showNavigation={false}
        onClose={() => assetViewerManager.showAssetViewer(false)}
      />
    </Portal>
  {/if}
{/if}

<style>
  /* a window tile, as Years, Months and Places are: the photo at full brightness, a hairline inside, the accent's
     border inside for the pointer and the focus */
  .ws-explore-tile {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, var(--immich-ui-light));
  }
  .ws-explore-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ws-explore-tile::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
    transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-explore-tile:hover::after,
  .ws-explore-tile:focus-visible::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-explore-tile:focus-visible {
    outline: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-explore-tile::after {
      transition: none;
    }
  }
  /* a year of this week: the year in display numerals on the caption scrim, sized to its tile, and its days in data
     type (left to its label on a tile too narrow for them: a phone's row of five) */
  .ws-week-year {
    container-type: inline-size;
  }
  /* the scrim holds at least 48% black behind the numeral and the days, so over a white wall the numeral keeps 3:1 and
     the days 4.5:1 (it faded from behind the numeral: 1.8:1 at the brightest), and eases out in the band above them */
  .ws-week-year-caption {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    padding: 2.25rem clamp(0.35rem, 5cqi, 0.7rem) clamp(0.35rem, 5cqi, 0.6rem);
    background: linear-gradient(
      to top,
      rgb(0 0 0 / 0.66),
      rgb(0 0 0 / 0.48) calc(100% - 2.25rem),
      rgb(0 0 0 / 0.34) calc(100% - 1.6rem),
      rgb(0 0 0 / 0.17) calc(100% - 0.95rem),
      rgb(0 0 0 / 0.05) calc(100% - 0.4rem),
      transparent
    );
    color: #fff;
  }
  .ws-week-year-number {
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 30cqi, var(--ws-text-display));
    font-weight: 800;
    font-variation-settings:
      'wdth' 75,
      'opsz' 96;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
    line-height: 0.85;
  }
  .ws-week-year-days {
    margin-top: 0.4rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgb(255 255 255 / 0.95);
    white-space: nowrap;
  }
  @container (max-width: 6.5rem) {
    .ws-week-year-days {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
  /* a place tile's frame while the counts come in */
  .ws-explore-waiting {
    aspect-ratio: 1;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, var(--immich-ui-light));
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
  }
</style>
