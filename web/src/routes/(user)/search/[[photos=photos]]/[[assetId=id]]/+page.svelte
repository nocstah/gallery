<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { ActionArray } from '$lib/actions/use-actions';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import SearchBarQuery from '$lib/components/omarchy/SearchBarQuery.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RotateAction from '$lib/components/timeline/actions/RotateAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import SpecialAlbumAction from '$lib/components/timeline/actions/SpecialAlbumAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import { QueryParameter } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { barSlot } from '$lib/managers/bar-slot.svelte';
  import { registerSelectionContext } from '$lib/managers/command-context-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { offeredSpecialAlbums } from '$lib/managers/special-albums.svelte';
  import type { Viewport } from '$lib/managers/timeline-manager/types';
  import SearchAddAllToCollectionModal from '$lib/modals/SearchAddAllToCollectionModal.svelte';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { countSearchResults, countSmartSearchResults, type SearchTerms } from '$lib/services/search.service';
  import { lang, locale } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl, handlePromiseError } from '$lib/utils';
  import { parseUtcDate } from '$lib/utils/date-time';
  import { handleError } from '$lib/utils/handle-error';
  import { isAlbumsRoute, isPeopleRoute } from '$lib/utils/navigation';
  import {
    getSearchModeText,
    isTextSearchMode,
    searchModeField,
    withSearchModeText,
    type TextSearchMode,
  } from '$lib/utils/search-mode-terms';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import {
    type AlbumResponseDto,
    AssetMediaSize,
    type AssetResponseDto,
    AssetVisibility,
    getPerson,
    getTagById,
    searchAssets,
    searchPerson,
    searchSmart,
  } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider, Icon, IconButton, modalManager } from '@immich/ui';
  import { mdiClose, mdiDotsVertical, mdiPlus, mdiSelectAll } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { MediaQuery } from 'svelte/reactivity';

  const viewport: Viewport = $state({ width: 0, height: 0 });
  let searchResultsElement: HTMLElement | undefined = $state();

  // Local Omarchy layer: the page lives in the shell (2026-10-15), so the shell's panel scrolls the results, not the
  // window: the grid follows that panel and is as tall as it
  let scroller = $state<HTMLElement>();
  const scrollerActions: ActionArray = [
    (node: HTMLElement) => {
      scroller = node;
      const resized = new ResizeObserver(() => (viewport.height = node.clientHeight));
      resized.observe(node);
      return {
        destroy: () => {
          resized.disconnect();
          scroller = undefined;
        },
      };
    },
  ];

  // The GalleryViewer pushes it's own history state, which causes weird
  // behavior for history.back(). To prevent that we store the previous page
  // manually and navigate back to that.
  let previousRoute = $state<string>(Route.explore());

  let nextPage = $state(1);
  let searchResultAlbums: AlbumResponseDto[] = $state([]);
  let searchResultAssets: AssetResponseDto[] = $state([]);
  let isLoading = $state(true);
  // Local Omarchy layer: the last search failed (handleError said why), so the page offers it again instead of
  // claiming there are no results; how many photos the search finds, when the statistics endpoint can count them, less
  // those taken out of the results since; and a counter that outdates answers still on their way for an older search
  let loadFailed = $state(false);
  let searchTotal = $state<number>();
  let removedCount = $state(0);
  let searchSerial = 0;

  let searchQuery = $derived(page.url.searchParams.get(QueryParameter.QUERY));
  let smartSearchEnabled = $derived(featureFlagsManager.value.smartSearch);
  // `query` normally carries JSON-encoded search terms, but a hand-typed, bookmarked or shared
  // `/search?query=beach` is plain text. JSON.parse throws on it (and on non-object JSON such as
  // `42` it yields a non-object), which used to take the whole page down; read those as a text query.
  const parseSearchTerms = (raw: string): SearchTerms => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as SearchTerms;
      }
    } catch {
      // fall through: not JSON
    }
    return { query: raw };
  };

  let terms = $derived<SearchTerms>(searchQuery ? parseSearchTerms(searchQuery) : {});
  let searchTermKeys = $derived(getVisibleSearchKeys(terms));
  const hasSearch = $derived(searchTermKeys.length > 0);

  // #830: this page is Gallery's global search surface, but a URL-driven search only ever
  // covered the caller's own (and partner) assets. A Space member who opened "Show similar
  // photos" on a photo shared with them — or pasted the same `queryAssetId` URL — got zero
  // results while the space owner got a long list. Opt into shared spaces the way the command
  // palette already does (#894); the server scopes them to spaces the member has kept in their
  // timeline. Spread before `terms` so an explicit value in the URL still wins, and skip it
  // entirely for a space-scoped URL — the server rejects `spaceId` + `withSharedSpaces`.
  // (Local Omarchy layer: shared by the search, its count and "Add all".)
  const searchTerms = $derived<SearchTerms>({ ...(!terms.spaceId && { withSharedSpaces: true }), ...terms });

  // Local Omarchy layer: the field in the bar holds the text the terms search by, in the mode it searches with
  // (smart, filename, description or OCR, the palette's modes); every other term is a chip under the bar. With no text
  // in the terms, the field starts in the mode the palette was last left in. Both are the user's to edit until the
  // search changes.
  const modeText = $derived(getSearchModeText(terms));
  const preferredMode = (): TextSearchMode =>
    isTextSearchMode(globalSearchManager.mode) ? globalSearchManager.mode : 'smart';
  let draft = $derived(modeText?.text ?? '');
  let mode = $derived<TextSearchMode>(modeText?.mode ?? untrack(preferredMode));
  const chipKeys = $derived(searchTermKeys.filter((key) => !modeText || key !== searchModeField[modeText.mode]));

  // ...on a phone the field keeps the bar; the count moves under it, as it does when the bar is too narrow for it
  const narrowBar = new MediaQuery('max-width: 767px');
  let barRoomy = $state(!narrowBar.current);

  $effect(() => {
    // we want this to *only* be reactive on `terms`
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    terms;
    untrack(() => {
      scroller?.scrollTo({ top: 0 });
      handlePromiseError(onSearchQueryUpdate());
    });
  });

  afterNavigate(({ from }) => {
    // Prevent setting previousRoute to the current page.
    if (from?.url && from.route.id !== page.route.id) {
      previousRoute = from.url.href;
    }
    const route = from?.route?.id;

    if (isPeopleRoute(route)) {
      previousRoute = Route.photos();
    }

    if (isAlbumsRoute(route)) {
      previousRoute = Route.explore();
    }
  });

  // Local Omarchy layer: what leaves the results leaves the count too
  const removeResults = (assetIds: string[]) => {
    const assetIdSet = new Set(assetIds);
    const before = searchResultAssets.length;
    searchResultAssets = searchResultAssets.filter((asset: AssetResponseDto) => !assetIdSet.has(asset.id));
    removedCount += before - searchResultAssets.length;
  };

  const onAssetDelete = (assetIds: string[]) => {
    removeResults(assetIds);
  };

  const handleSetVisibility = (assetIds: string[]) => {
    assetMultiSelectManager.clear();
    onAssetDelete(assetIds);
  };

  const onFavorite = (ids: string[], isFavorite: boolean) => {
    for (const id of ids) {
      const asset = searchResultAssets.find((asset) => asset.id === id);
      if (asset) {
        asset.isFavorite = isFavorite;
      }
    }
  };

  const onArchive = (ids: string[], visibility: AssetVisibility) => {
    // Local Omarchy layer: the search asks for Timeline unless told otherwise (loadNextPage), so what is archived (To do,
    // Villa) leaves the results, as it leaves the timeline
    if ((terms.visibility ?? AssetVisibility.Timeline) !== visibility) {
      removeResults(ids);
      return;
    }
    for (const id of ids) {
      const asset = searchResultAssets.find((asset) => asset.id === id);
      if (asset) {
        asset.visibility = visibility;
      }
    }
  };

  const onUndoDelete = () => {
    void onSearchQueryUpdate();
  };

  registerSelectionContext({
    getAssets: () => assetMultiSelectManager.assets,
    clearSelection: () => assetMultiSelectManager.clear(),
    canAddToAlbum: () => true,
    getOnFavorite: () => onFavorite,
    getOnArchive: () => onArchive,
    getOnDelete: () => onAssetDelete,
    getOnUndoDelete: () => onUndoDelete,
  });

  const handleSelectAll = () => {
    assetMultiSelectManager.selectAssets(searchResultAssets.map((asset) => toTimelineAsset(asset)));
  };

  async function onSearchQueryUpdate() {
    searchSerial++;
    nextPage = 1;
    searchResultAssets = [];
    searchResultAlbums = [];
    loadFailed = false;
    searchTotal = undefined;
    removedCount = 0;
    // Local Omarchy layer: nothing asked yet (a bare /search): the page says how to search rather than listing
    // every photo, which is what an empty search finds
    if (!hasSearch) {
      isLoading = false;
      return;
    }
    void countResults(searchSerial);
    await loadNextPage(true);
  }

  // Local Omarchy layer: the count of a search the statistics endpoint can count (a place, a description, OCR text),
  // or of a smart search when the server cuts its ranking off at a distance (smartSearchHasCutoff); without that a
  // smart search ranks every photo, so its count is what has loaded, with a + while more follow
  const countResults = async (serial: number) => {
    const terms = { visibility: AssetVisibility.Timeline, ...searchTerms };
    const smart = ('query' in searchTerms || 'queryAssetId' in searchTerms) && smartSearchEnabled;
    if (smart && !featureFlagsManager.value.smartSearchHasCutoff) {
      return;
    }
    try {
      const total = smart ? await countSmartSearchResults(terms, { language: $lang }) : await countSearchResults(terms);
      if (serial === searchSerial) {
        searchTotal = total;
      }
    } catch {
      // only the count is missing: the pages still say how many as they come
    }
  };

  // eslint-disable-next-line svelte/valid-prop-names-in-kit-pages
  export const loadNextPage = async (force?: boolean) => {
    if (!hasSearch || !nextPage || (isLoading && !force)) {
      return;
    }
    const serial = searchSerial;
    isLoading = true;

    const searchDto: SearchTerms = { page: nextPage, withExif: true, ...searchTerms };

    try {
      const { albums, assets } =
        ('query' in searchDto || 'queryAssetId' in searchDto) && smartSearchEnabled
          ? await searchSmart({
              smartSearchDto: { visibility: AssetVisibility.Timeline, ...searchDto, language: $lang },
            })
          : await searchAssets({ metadataSearchDto: { visibility: AssetVisibility.Timeline, ...searchDto } });

      // Local Omarchy layer: a search refined since this one was asked has cleared the results for its own
      if (serial !== searchSerial) {
        return;
      }
      searchResultAlbums.push(...albums.items);
      searchResultAssets.push(...assets.items);

      nextPage = Number(assets.nextPage) || 0;
    } catch (error) {
      if (serial !== searchSerial) {
        return;
      }
      loadFailed = true;
      handleError(error, $t('loading_search_results_failed'));
    } finally {
      if (serial === searchSerial) {
        isLoading = false;
      }
    }
  };

  // Local Omarchy layer: the field's search, run in place: its text in the mode beside it, with the chips' terms kept.
  // The same search again (Enter on an unchanged field) runs it again.
  const search = async (text: string, searchMode: TextSearchMode) => {
    const next = withSearchModeText(terms, searchMode, text);
    if (Route.search(next) === Route.search(terms)) {
      await onSearchQueryUpdate();
      return;
    }
    assetMultiSelectManager.clear();
    await goto(Route.search(next), { keepFocus: true, noScroll: true });
  };

  // ...and a mode picked beside the field searches its text that way; the palette opens in that mode from then on
  const changeMode = (next: TextSearchMode) => {
    mode = next;
    globalSearchManager.setMode(next);
    if (draft.trim()) {
      void search(draft, next);
    }
  };

  // Local Omarchy layer: the number of results, in data type: exact once every page has loaded or when the search can
  // be counted, otherwise what has loaded so far with a + (a smart search ranks every photo, best match first)
  const resultCount = $derived.by(() => {
    if (!hasSearch || loadFailed || (isLoading && searchResultAssets.length === 0)) {
      return;
    }
    if (!nextPage) {
      return { count: searchResultAssets.length, exact: true };
    }
    if (searchTotal !== undefined) {
      return { count: Math.max(searchTotal - removedCount, searchResultAssets.length), exact: true };
    }
    return { count: searchResultAssets.length, exact: false };
  });
  // (none for no results: the page says so in words)
  const countText = $derived(
    resultCount && resultCount.count > 0
      ? $t(resultCount.exact ? 'spaces_search_result_count' : 'spaces_search_result_count_more', {
          values: { count: resultCount.count },
        })
      : undefined,
  );

  // Local Omarchy layer: every result into an album or a Space, once the count is known (never "all" of a ranking)
  const canAddAll = $derived(!!resultCount?.exact && resultCount.count > 0);
  const handleAddAll = () => {
    if (!resultCount?.exact) {
      return;
    }
    void modalManager.show(SearchAddAllToCollectionModal, {
      terms: { visibility: AssetVisibility.Timeline, ...searchTerms },
      total: resultCount.count,
      smartSearchEnabled,
      language: $lang,
    });
  };

  function getHumanReadableDate(dateString: string) {
    const date = parseUtcDate(dateString).startOf('day');
    return date.toLocaleString(
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      },
      { locale: $locale },
    );
  }

  function getHumanReadableSearchKey(key: keyof SearchTerms): string {
    const keyMap: Partial<Record<keyof SearchTerms, string>> = {
      takenAfter: $t('start_date'),
      takenBefore: $t('end_date'),
      visibility: $t('in_archive'),
      isFavorite: $t('favorite'),
      isNotInAlbum: $t('not_in_any_album'),
      isInAlbum: $t('in_any_album'),
      type: $t('media_type'),
      query: $t('context'),
      city: $t('city'),
      country: $t('country'),
      state: $t('state'),
      make: $t('camera_brand'),
      model: $t('camera_model'),
      lensModel: $t('lens_model'),
      personIds: $t('people'),
      tagIds: $t('tags'),
      originalFileName: $t('file_name_text'),
      originalPath: $t('full_path_or_folder'),
      description: $t('description'),
      // Local Omarchy layer: the chip's own words ("Similar to"), not upstream's "Query Asset ID"
      queryAssetId: $t('search_similar_to'),
      ocr: $t('ocr'),
    };
    return keyMap[key] || key;
  }

  const isScopedPersonToken = (personId: string) =>
    personId.startsWith('person:') || personId.startsWith('space-person:');

  async function getPersonName(personIds: string[]) {
    const scopedPersonIds = personIds.filter((personId) => isScopedPersonToken(personId));
    const scopedPeople =
      scopedPersonIds.length > 0 ? await searchPerson({ name: '', withHidden: true, withSharedSpaces: true }) : [];
    const scopedPeopleByFilterId = new Map(
      scopedPeople.map((person) => [person.filterId ?? `person:${person.id}`, person]),
    );

    const personNames = await Promise.all(
      personIds.map(async (personId) => {
        if (isScopedPersonToken(personId)) {
          const person = scopedPeopleByFilterId.get(personId);

          return person?.name || $t('no_name');
        }

        const person = await getPerson({ id: personId });

        if (person.name === '') {
          return $t('no_name');
        }

        return person.name;
      }),
    );

    return personNames.join(', ');
  }

  async function getTagNames(tagIds: string[] | null) {
    if (tagIds === null) {
      return $t('untagged');
    }
    const tagNames = await Promise.all(
      tagIds.map(async (tagId) => {
        const tag = await getTagById({ id: tagId });

        return tag.value;
      }),
    );

    return tagNames.join(', ');
  }

  const onAlbumAddAssets = ({ assetIds }: { assetIds: string[] }) => {
    assetMultiSelectManager.clear();

    if (terms.isNotInAlbum) {
      removeResults(assetIds);
    }
  };

  function getObjectKeys<T extends object>(obj: T): (keyof T)[] {
    return Object.keys(obj) as (keyof T)[];
  }

  function getVisibleSearchKeys(terms: SearchTerms) {
    return getObjectKeys(terms).filter((key) => key !== 'withSharedSpaces');
  }

  function removeFilter(key: keyof SearchTerms) {
    assetMultiSelectManager.clear();
    void goto(Route.search(Object.fromEntries(Object.entries(terms).filter(([termKey]) => termKey !== key))));
  }

  // Local Omarchy layer: the search's own part of the one bar (OmarchyBar), while the page is open
  $effect(() => {
    barSlot.content = searchBar;
    return () => {
      if (barSlot.content === searchBar) {
        barSlot.content = undefined;
      }
    };
  });
</script>

<OnEvents {onAlbumAddAssets} />

<!-- Local Omarchy layer: the search's query, its mode and its count in the one bar -->
{#snippet searchBar()}
  <SearchBarQuery
    bind:draft={() => draft, (value) => (draft = value)}
    committed={modeText?.text ?? ''}
    {mode}
    count={countText}
    narrow={narrowBar.current}
    bind:roomy={barRoomy}
    autofocus={!hasSearch}
    smartUnavailable={!smartSearchEnabled || !globalSearchManager.mlHealthy}
    onSubmit={() => void search(draft, mode)}
    onModeChange={changeMode}
    onBack={() => goto(previousRoute)}
  />
{/snippet}

<!-- Local Omarchy layer: search lives in the shell like every page (2026-10-15; upstream opened it on its own with a
     back arrow, and this fork showed a notice there pointing to Ctrl+K): the sidebar stays, the query is a field in the
     one bar, the other terms are chips over the results, and the selection bar takes the bar's place (below the
     shell) -->
<UserPageLayout hideNavbar={assetMultiSelectManager.selectionActive} barFitsNavbar use={scrollerActions}>
  {#if hasSearch && ((countText && !barRoomy) || chipKeys.length > 0 || canAddAll)}
    <div class="ws-search-terms" data-testid="search-terms">
      {#if countText && !barRoomy}
        <span class="ws-search-terms-count" data-testid="search-result-count">{countText}</span>
      {/if}
      {#each chipKeys as searchKey (searchKey)}
        {@const value = terms[searchKey]}
        <span class="ws-search-term">
          {#if searchKey === 'queryAssetId' && typeof value === 'string'}
            <!-- a photo to find others like: the photo itself, small -->
            <span class="ws-search-term-key">{$t('search_similar_to')}</span>
            <img
              class="ws-search-term-photo"
              src={getAssetMediaUrl({ id: value, size: AssetMediaSize.Thumbnail })}
              alt=""
              draggable="false"
            />
          {:else}
            <span class="ws-search-term-key">{getHumanReadableSearchKey(searchKey as keyof SearchTerms)}</span>
            {#if value !== true}
              <span class="ws-search-term-value">
                {#if (searchKey === 'takenAfter' || searchKey === 'takenBefore') && typeof value === 'string'}
                  {getHumanReadableDate(value)}
                {:else if searchKey === 'personIds' && Array.isArray(value)}
                  {#await getPersonName(value) then personName}
                    {personName}
                  {/await}
                {:else if searchKey === 'tagIds' && (Array.isArray(value) || value === null)}
                  {#await getTagNames(value) then tagNames}
                    {tagNames}
                  {/await}
                {:else if searchKey === 'rating'}
                  {$t('rating_count', { values: { count: value ?? 0 } })}
                {:else if value === null || value === ''}
                  {$t('unknown')}
                {:else}
                  {value}
                {/if}
              </span>
            {/if}
          {/if}
          <button
            type="button"
            class="ws-search-term-remove"
            aria-label={$t('remove_filter')}
            title={$t('remove_filter')}
            onclick={() => removeFilter(searchKey)}
          >
            <Icon icon={mdiClose} size="14" />
          </button>
        </span>
      {/each}
      {#if canAddAll && resultCount}
        <button type="button" class="ws-search-add-all" onclick={handleAddAll} data-testid="add-all-to-collection">
          <Icon icon={mdiPlus} size="16" aria-hidden />
          <span>{$t('add_all_search_results', { values: { count: resultCount.count } })}</span>
        </button>
      {/if}
    </div>
  {/if}

  <section
    class="ws-search-results"
    bind:clientWidth={viewport.width}
    bind:this={searchResultsElement}
    data-testid="search-results"
  >
    {#if !hasSearch}
      <!-- Local Omarchy layer: the empty states say why and offer the next step (DESIGN.md, Empty State) -->
      <div class="ws-empty" data-testid="search-empty">
        <h2 class="ws-empty-title">{$t('search_your_photos')}</h2>
        <p class="ws-empty-body">{$t('search_page_empty_body')}</p>
        <div class="ws-empty-actions">
          <a class="ws-empty-link" href={Route.explore()}>{$t('explore')}</a>
        </div>
      </div>
    {:else if searchResultAssets.length > 0}
      <GalleryViewer
        assets={searchResultAssets}
        assetInteraction={assetMultiSelectManager}
        onEndReached={loadNextPage}
        showArchiveIcon={true}
        {viewport}
        onReload={onSearchQueryUpdate}
        slidingWindowOffset={searchResultsElement?.offsetTop ?? 0}
        enableGrouping
        scrollElement={scroller}
      />
    {:else if loadFailed}
      <div class="ws-empty" data-testid="search-failed">
        <h2 class="ws-empty-title">{$t('loading_search_results_failed')}</h2>
        <div class="ws-empty-actions">
          <button type="button" class="ws-empty-action" onclick={() => void onSearchQueryUpdate()}>
            {$t('retry')}
          </button>
        </div>
      </div>
    {:else if !isLoading}
      <div class="ws-empty" data-testid="search-no-results">
        <h2 class="ws-empty-title">{$t('no_results')}</h2>
        <p class="ws-empty-body">{$t('no_results_description')}</p>
        <!-- a text that no file name, description or photo holds may still be what a photo shows -->
        {#if modeText && modeText.mode !== 'smart' && smartSearchEnabled}
          <div class="ws-empty-actions">
            <button type="button" class="ws-empty-action" onclick={() => changeMode('smart')}>
              {$t('search_by_context')}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if isLoading}
      <div class="flex items-center justify-center py-16">
        <LoadingSpinner size="giant" />
      </div>
    {/if}
  </section>
</UserPageLayout>

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {@const Actions = getAssetBulkActions($t)}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />

    <ActionButton action={Actions.CreateSharedLink} />
    <IconButton
      shape="round"
      color="secondary"
      variant="ghost"
      aria-label={$t('select_all')}
      icon={mdiSelectAll}
      onclick={handleSelectAll}
    />
    <ActionButton action={Actions.AddToAlbum} />
    <FavoriteAction removeFavorite={assetMultiSelectManager.isAllFavorite} {onFavorite} />

    {#if assetMultiSelectManager.isAllUserOwned}
      <!-- Local Omarchy layer: into a special album (To do B, Villa V), as on Photos -->
      {#each offeredSpecialAlbums() as special (special.key)}
        <SpecialAlbumAction {special} {onArchive} />
      {/each}
      <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
        <ActionMenuItem action={Actions.AddToAlbum} />
        <DownloadAction menuItem />
        <RotateAction />
        <ChangeDate menuItem />
        <ChangeDescription menuItem />
        <ChangeLocation menuItem />
        <ArchiveAction menuItem unarchive={assetMultiSelectManager.isAllArchived} {onArchive} />
        <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        <ActionMenuItem action={Actions.Tag} />
        <DeleteAssets menuItem {onAssetDelete} onUndoDelete={onSearchQueryUpdate} />
        <hr />
        <ActionMenuItem action={Actions.RegenerateThumbnailJob} />
        <ActionMenuItem action={Actions.RefreshMetadataJob} />
        <ActionMenuItem action={Actions.TranscodeVideoJob} />
      </ButtonContextMenu>
    {:else}
      <DownloadAction />
    {/if}
  </AssetSelectControlBar>
{/if}

<style>
  /* the search's other terms, over the results and scrolling away with them: each a chip in the field's hairline with
     its name in muted ink and its value in ink; then "Add all" at the row's end. On a phone (or a narrow bar) the count
     leads the row */
  .ws-search-terms {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding-bottom: 0.75rem;
  }
  .ws-search-terms-count {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    white-space: nowrap;
  }
  .ws-search-term {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    max-width: 100%;
    height: 2rem;
    padding-inline: 0.625rem 0.25rem;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    font-size: var(--ws-text-meta);
  }
  .ws-search-term-key {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-search-term-value {
    min-width: 0;
    max-width: min(36rem, 55vw);
    overflow: hidden;
    color: var(--immich-ui-dark);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-search-term-photo {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--ws-radius);
    object-fit: cover;
  }
  .ws-search-term-remove {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-search-term-remove:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-search-term-remove:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* Photos' "Add all" in its filter row: a quiet ink tint, at the row's end */
  .ws-search-add-all {
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
    height: 2rem;
    margin-inline-start: auto;
    padding-inline: 0.625rem 0.75rem;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 10%, transparent);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 600;
    white-space: nowrap;
  }
  .ws-search-add-all:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 16%, transparent);
  }
  .ws-search-add-all:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* the grid's Years / Months / All row starts on the page's gutter, as the photos under it do (it keeps upstream's
     1rem inset elsewhere) */
  .ws-search-results :global([data-testid='gallery-viewer'] > [data-testid='filter-toolbar-root']) {
    padding-inline-start: 0;
  }
</style>
