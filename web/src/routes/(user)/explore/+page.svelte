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
  import { weekYearDays } from '$lib/utils/week-across-years';
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
        <h2 class="ws-sharing-heading" id="explore-week">{$t('explore_week_across_years')}</h2>
        <SingleGridRow class="grid grid-flow-col grid-auto-fill-28 gap-(--ws-gap) md:grid-auto-fill-48">
          {#snippet children({ itemCount })}
            {#each data.week.slice(0, itemCount) as year (year.year)}
              <a class="ws-week-year" href={Route.photos({ at: year.assetId })} draggable="false">
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
          {/snippet}
        </SingleGridRow>
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
        <div class="flex h-24 max-w-fit flex-wrap gap-x-1 overflow-hidden md:h-42">
          {#each recents as item (item.data.id)}
            <button
              type="button"
              class="relative h-full flex-auto"
              onclick={() => onViewAsset(item.data.id)}
              draggable="false"
            >
              <img
                src={getAssetMediaUrl({ id: item.data.id, size: AssetMediaSize.Thumbnail })}
                alt={$getAltText(toTimelineAsset(item.data))}
                class="size-full min-w-max rounded-xl object-cover"
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
  /* a year of this week: a window tile, as Years and Months are, the year in display numerals on the caption scrim
     and its days in data type */
  .ws-week-year {
    position: relative;
    display: block;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, var(--immich-ui-light));
  }
  .ws-week-year img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ws-week-year::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
    transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-week-year:hover::after,
  .ws-week-year:focus-visible::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-week-year:focus-visible {
    outline: none;
  }
  .ws-week-year-caption {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    padding: 2.5rem 0.7rem 0.6rem;
    background: linear-gradient(to top, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.2) 60%, transparent);
    color: #fff;
  }
  .ws-week-year-number {
    font-family: var(--font-display);
    font-size: var(--ws-text-display);
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
    color: rgb(255 255 255 / 0.85);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-week-year::after {
      transition: none;
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
