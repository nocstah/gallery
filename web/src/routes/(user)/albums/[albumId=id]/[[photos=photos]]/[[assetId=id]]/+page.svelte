<script lang="ts">
  import { goto, invalidate, onNavigate } from '$app/navigation';
  import { navigating, page } from '$app/state';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import AlbumMap from '$lib/components/album-page/AlbumMap.svelte';
  import AlbumSharedSpaceLinks from '$lib/components/album-page/AlbumSharedSpaceLinks.svelte';
  import ActivityStatus from '$lib/components/asset-viewer/ActivityStatus.svelte';
  import ActivityViewer from '$lib/components/asset-viewer/ActivityViewer.svelte';
  import ActiveFiltersBar from '$lib/components/filter-panel/active-filters-bar.svelte';
  import FilterPanel from '$lib/components/filter-panel/filter-panel.svelte';
  import FilterToolbar from '$lib/components/filter-panel/filter-toolbar.svelte';
  import { clearTimelineTemporalFilter } from '$lib/utils/timeline-temporal-filters';
  import {
    clearFilters,
    createFilterState,
    getActiveFilterCount,
    loadFilterCollapsed,
    type FilterState,
  } from '$lib/components/filter-panel/filter-panel';
  import HeaderActionButton from '$lib/components/HeaderActionButton.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import SpecialAlbumAction from '$lib/components/timeline/actions/SpecialAlbumAction.svelte';
  import { albumFolders } from '$lib/managers/album-folders.svelte';
  import { offeredSpecialAlbums, specialAlbumOf } from '$lib/managers/special-albums.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RotateAction from '$lib/components/timeline/actions/RotateAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import TileContextMenu from '$lib/components/timeline/TileContextMenu.svelte';
  import SelectionGroup from '$lib/components/timeline/SelectionGroup.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AlbumPageViewMode } from '$lib/constants';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { assetMultiSelectManager, AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { registerAlbumContext, registerSelectionContext } from '$lib/managers/command-context-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset, TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import {
    getAlbumActions,
    getAlbumAssetsActions,
    handleDeleteAlbum,
    handleLinkAlbumToSpace,
    isAlbumEditor,
    isAlbumOwner,
  } from '$lib/services/album.service';
  import { getGlobalActions } from '$lib/services/app.service';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { SlideshowNavigation, SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
  import { handlePromiseError } from '$lib/utils';
  import { buildAlbumAssetPickerFilterConfig, buildAlbumDetailFilterConfig } from '$lib/utils/album-filter-config';
  import { buildAlbumAssetPickerOptions, buildAlbumTimelineOptions } from '$lib/utils/album-filter-options';
  import SearchAddAllToCollectionModal from '$lib/modals/SearchAddAllToCollectionModal.svelte';
  import { resolveFilterNames } from '$lib/utils/filter-name-resolution';
  import { filterStateToSearchTerms } from '$lib/utils/filter-search-terms';
  import type { SearchTerms } from '$lib/services/search.service';
  import { buildFilterStateUrl, isFilterStateUrlUnchanged, withoutAtParam } from '$lib/utils/filter-target';
  import { decodeFilterParams } from '$lib/utils/filter-url';
  import { lang } from '$lib/stores/preferences.store';
  import { handleError } from '$lib/utils/handle-error';
  import { isAlbumsRoute, navigate, type AssetGridRouteSearchParams } from '$lib/utils/navigation';
  import { handlePhotosRemoveFilter } from '$lib/utils/photos-filter-options';
  import {
    type ActivatableTimelineBucket,
    getTimelineBucketZoomTarget,
    getTimelineManagerTimeBuckets,
  } from '$lib/utils/timeline-zoom-navigation';
  import { getTimelineTopVisibleAnchor } from '$lib/managers/timeline-manager/timeline-anchor';
  import SmartSearchResults from '$lib/components/search/smart-search-results.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { buildSearchablePageUrl, getSearchablePageState } from '$lib/utils/searchable-page-search';
  import {
    buildSmartSearchFacetKey,
    buildSmartSearchFacetsParams,
    mapSmartSearchFacetsToFilterSuggestions,
  } from '$lib/utils/space-search';
  import { consumeTypedSearchNamesInto } from '$lib/utils/typed-search/typed-search-name-cache';
  import { quickTrashInAlbum, takeOutOfAlbum } from '$lib/utils/quick-trash';
  import { removeSearchResults, selectAllSearchResults, updateSearchResults } from '$lib/utils/search-result-selection';
  import {
    AlbumUserRole,
    AssetOrder,
    type AssetVisibility,
    getAlbumInfo,
    searchSmartFacets,
    updateAlbumInfo,
    type AlbumResponseDto,
    type AssetResponseDto,
    type SmartSearchFacetsResponseDto,
  } from '@immich/sdk';
  import {
    ActionButton,
    Button,
    CommandPaletteDefaultProvider,
    Icon,
    IconButton,
    modalManager,
    toastManager,
  } from '@immich/ui';
  import {
    mdiAccountEye,
    mdiAccountEyeOutline,
    mdiArrowLeft,
    mdiDotsVertical,
    mdiEyeOffOutline,
    mdiImageOutline,
    mdiImagePlusOutline,
    mdiLink,
    mdiLinkVariantPlus,
    mdiPlayOutline,
    mdiPresentationPlay,
    mdiTelevisionPlay,
  } from '@mdi/js';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import { MediaQuery, SvelteMap } from 'svelte/reactivity';
  import type { PageData } from './$types';
  import AlbumDescription from '$lib/components/album-page/AlbumDescription.svelte';
  import AlbumStory from '$lib/components/curator/AlbumStory.svelte';
  import SmartAlbumBadge from '$lib/components/curator/SmartAlbumBadge.svelte';
  import { curatorIsMine } from '$lib/utils/curator';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import AlbumBarTitle from '$lib/components/omarchy/AlbumBarTitle.svelte';
  import EmptyState from '$lib/components/omarchy/EmptyState.svelte';
  import AlbumPeopleStrip from '$lib/components/omarchy/AlbumPeopleStrip.svelte';
  import BarFilterButton from '$lib/components/omarchy/BarFilterButton.svelte';
  import { barSlot } from '$lib/managers/bar-slot.svelte';
  import { getAlbumDateRange } from '$lib/utils/date-time';

  interface Props {
    data: PageData;
  }

  let { data = $bindable() }: Props = $props();
  let { slideshowState, slideshowNavigation } = slideshowStore;
  let oldAt: AssetGridRouteSearchParams | null | undefined = $state();
  let album = $state(data.album);
  /**
   * E9 — the route already scopes the timeline to this album, and the server's `albumId` is a
   * SCALAR driving one inner join, so album ∩ album is impossible. A stray `?albumId=` must be
   * IGNORED: dropping it here keeps it out of the active-filter count, out of the chip bar, and
   * out of the next URL write. buildAlbumTimelineOptions already refuses to forward it.
   */
  const hydrateAlbumFilters = (url: URL): FilterState => ({
    ...createFilterState(),
    ...decodeFilterParams(url),
    albumId: undefined,
    sortOrder: getSearchablePageState(url).sortOrder,
  });

  let albumFilters = $state<FilterState>(hydrateAlbumFilters(page.url));
  let committedSearchQuery = $state(getSearchablePageState(page.url).query);
  const showSearchResults = $derived(committedSearchQuery.trim().length > 0);
  // Loaded smart-search results. The browse Timeline (and its TimelineManager) is unmounted while
  // these show, so the selection toolbar acts on this array instead — mirrors the space timeline.
  let searchResults = $state<AssetResponseDto[]>([]);
  // Local Omarchy layer: the photo a right-click lands on, in the album's grid or among its search results
  const findMenuAsset = (id: string) => {
    if (showSearchResults) {
      const found = searchResults.find((asset) => asset.id === id);
      return found ? toTimelineAsset(found) : undefined;
    }
    return timelineManager?.getTimelineMonthByAssetId(id)?.findAssetById({ id });
  };
  let searchIsLoading = $state(false);
  // Bumped to force a re-run of the current search (undo-delete restores the removed assets).
  let searchReloadToken = $state(0);
  // Token guard for the URL $effect below. Copied in spirit from photos/…/+page.svelte: without it,
  // our own goto() re-runs the effect, which re-runs goto(), forever. It is at-stripped because
  // closing the asset viewer writes `?at=<assetId>` (replaceScrollTarget), which is not a filter
  // change: re-hydrating on it is pure churn — the FilterState it would rebuild is identical, since
  // every filter is URL-backed. Rebuilding it anyway would needlessly re-create `filters` and, with
  // it, the timeline options object.
  let lastHandledFilterSearch = $state(withoutAtParam(page.url.search));
  let pickerFilters = $state(createFilterState());
  let timelineGrouping = $state<TimelineGrouping>('day');
  let temporalAnchor = $state<TimelineTemporalAnchor | undefined>();
  let albumPersonNames = new SvelteMap<string, string>();
  let albumTagNames = new SvelteMap<string, string>();
  let albumOwnerNames = new SvelteMap<string, string>();
  // Never populated: E9 drops `?albumId=` at hydrate, so an album chip can never appear on this
  // page. It exists only to satisfy resolveFilterNames' map pair.
  let albumAlbumNames = new SvelteMap<string, string>();
  let pickerPersonNames = new SvelteMap<string, string>();
  let pickerTagNames = new SvelteMap<string, string>();
  // An `?ownerId=` chip on an album is (all but always) one of the album's users, and they are
  // already in scope — seed from them so no request is made. resolveFilterNames only falls through
  // to a by-id fetch for an owner who is not an album user (a space contributor, say).
  $effect(() => {
    for (const { user } of album.albumUsers) {
      albumOwnerNames.set(user.id, user.name);
    }
    void resolveFilterNames(albumFilters, { albumNames: albumAlbumNames, ownerNames: albumOwnerNames });
  });
  let viewMode: AlbumPageViewMode = $state(AlbumPageViewMode.VIEW);
  let timelineManager = $state<TimelineManager>() as TimelineManager;
  let showAlbumUsers = $derived(timelineManager?.showAssetOwners ?? false);

  const timelineMultiSelectManager = new AssetMultiSelectManager();

  const handleFavorite = async () => {
    try {
      await activityManager.toggleLike();
    } catch (error) {
      handleError(error, $t('errors.cant_change_asset_favorite'));
    }
  };

  const handleStartSlideshow = async () => {
    const asset =
      $slideshowNavigation === SlideshowNavigation.Shuffle
        ? await timelineManager.getRandomAsset()
        : timelineManager.months[0]?.timelineDays[0]?.viewerAssets[0]?.asset;
    if (asset) {
      handlePromiseError(
        assetViewerManager.setAssetId(asset.id).then(() => ($slideshowState = SlideshowState.PlaySlideshow)),
      );
    }
  };

  // Local Omarchy layer: the bar's Close (its Escape shortcut) and the timeline's own Escape both hear one press, and
  // each would take one step (clear the selection, then go back to Albums): one press takes one step
  let escapeTaken = false;
  const handleEscape = async () => {
    if (escapeTaken) {
      return;
    }
    escapeTaken = true;
    setTimeout(() => (escapeTaken = false), 0);
    // Search mode unmounts <Timeline>, so `timelineManager` is undefined here on a directly-loaded
    // `?q=` URL — dereferencing it below would throw before anything else ran. Escape clears the
    // search instead, matching the space timeline's handler.
    if (showSearchResults) {
      clearAlbumSearch();
      return;
    }
    timelineManager.suspendTransitions = true;
    if (viewMode === AlbumPageViewMode.SELECT_THUMBNAIL) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }
    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      await handleCloseSelectAssets();
      return;
    }
    if (assetViewerManager.isViewing) {
      return;
    }
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }
    await backToAlbums();
  };

  // Local Omarchy layer: back to the folder the album sits in (managers/album-folders), the top of Albums when none
  // Local Omarchy layer: the album lives in the shell (2026-10-15): its dates and count sit in the bar beside its name
  const albumBarDescription = $derived.by(() => {
    const count = $t('items_count', { values: { count: album.assetCount } });
    return album.startDate
      ? `${getAlbumDateRange(album.startDate, album.endDate ?? album.startDate)} · ${count}`
      : count;
  });

  // ...on a phone its tools fold into the ⋮ (the bar has room for Share and the menu, not six icons)
  const narrowBar = new MediaQuery('max-width: 767px');
  const startAddPhotos = async () => {
    timelineManager.suspendTransitions = true;
    viewMode = AlbumPageViewMode.SELECT_ASSETS;
    oldAt = { at: assetViewerManager.gridScrollTarget?.at };
    await navigate(
      { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: { at: null } },
      { replaceState: true },
    );
  };

  // ...and a face in its details narrows it to that person, as the filter rail's People does
  const toggleAlbumPerson = (person: { id: string; name: string }) => {
    albumPersonNames.set(person.id, person.name);
    const personIds = albumFilters.personIds.includes(person.id)
      ? albumFilters.personIds.filter((id) => id !== person.id)
      : [...albumFilters.personIds, person.id];
    albumFilters = { ...albumFilters, personIds };
    syncAlbumFilterUrl(albumFilters);
  };

  const backToAlbums = async () => {
    await albumFolders.ready();
    await goto(Route.albums({ folder: albumFolders.folderOf(album.id) }));
  };

  // ...and the ⋮ menu's "hide this album from my timeline" says which way it goes, on a page opened straight from a link
  onMount(() => void albumFolders.ready());

  const refreshAlbum = async () => {
    album = await getAlbumInfo({ id: album.id });
  };

  const setModeToView = async () => {
    timelineManager.suspendTransitions = true;
    viewMode = AlbumPageViewMode.VIEW;
    await navigate(
      { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: { at: oldAt?.at } },
      { replaceState: true, forceNavigate: true },
    );
    oldAt = null;
  };

  const handleCloseSelectAssets = async () => {
    timelineMultiSelectManager.clear();
    await setModeToView();
  };

  // While search results are showing, <Timeline> is unmounted and its manager destroyed — every
  // bulk action has to mutate the results array instead, or it silently no-ops and the asset stays
  // on screen (#908, the same split the space timeline makes).
  const handleSetVisibility = (assetIds: string[]) => {
    if (showSearchResults) {
      removeSearchResults(searchResults, assetIds);
    } else {
      timelineManager?.removeAssets(assetIds);
    }
    assetMultiSelectManager.clear();
  };

  const onAlbumRemoveAssets = async ({ assetIds, albumIds }: { assetIds: string[]; albumIds: string[] }) => {
    if (albumIds.includes(album.id)) {
      await handleRemoveAssets(assetIds);
    }
  };

  const handleRemoveAssets = async (assetIds: string[]) => {
    if (showSearchResults) {
      removeSearchResults(searchResults, assetIds);
    } else {
      timelineManager?.removeAssets(assetIds);
    }
    await refreshAlbum();
  };

  const handleUndoRemoveAssets = async (assets: TimelineAsset[]) => {
    if (showSearchResults) {
      // Undo hands back TimelineAssets; the results list holds full AssetResponseDtos, so
      // re-running the search is how they come back.
      searchReloadToken++;
    } else {
      timelineManager?.upsertAssets(assets);
    }
    await refreshAlbum();
  };

  const handleBulkFavorite = (ids: string[], isFavorite: boolean) => {
    if (showSearchResults) {
      updateSearchResults(searchResults, ids, (asset) => (asset.isFavorite = isFavorite));
      return;
    }
    timelineManager?.update(ids, (asset) => (asset.isFavorite = isFavorite));
  };

  const handleBulkArchive = (ids: string[], visibility: AssetVisibility) => {
    if (showSearchResults) {
      updateSearchResults(searchResults, ids, (asset) => (asset.visibility = visibility));
      return;
    }
    timelineManager?.update(ids, (asset) => (asset.visibility = visibility));
  };

  const handleUpdateThumbnail = async (assetId: string) => {
    if (viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL) {
      return;
    }

    await updateThumbnail(assetId);

    viewMode = AlbumPageViewMode.VIEW;
    assetMultiSelectManager.clear();
  };

  const updateThumbnailUsingCurrentSelection = async () => {
    if (assetMultiSelectManager.assets.length !== 1) {
      return;
    }

    const [firstAsset] = assetMultiSelectManager.assets;
    assetMultiSelectManager.clear();
    await updateThumbnail(firstAsset.id);
  };

  const updateThumbnail = async (assetId: string) => {
    try {
      const response = await updateAlbumInfo({
        id: album.id,
        updateAlbumDto: {
          albumThumbnailAssetId: assetId,
        },
      });
      eventManager.emit('AlbumUpdate', response);
      toastManager.primary($t('album_cover_updated'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_album_cover'));
    }
  };

  onNavigate(async ({ to }) => {
    if (!isAlbumsRoute(to?.route.id) && album.assetCount === 0 && !album.albumName) {
      await handleDeleteAlbum(album, { notify: false, prompt: false });
    }
  });

  registerAlbumContext(() => album);
  registerSelectionContext({
    getAssets: () => (viewMode === AlbumPageViewMode.VIEW ? assetMultiSelectManager.assets : []),
    clearSelection: () => assetMultiSelectManager.clear(),
    canAddToAlbum: () => viewMode === AlbumPageViewMode.VIEW,
    // `showSearchResults` joins `timelineManager` as an availability condition: in search mode the
    // manager is gone but the handlers below are still meaningful — they act on the results array.
    getOnFavorite: () =>
      viewMode === AlbumPageViewMode.VIEW && (timelineManager || showSearchResults) ? handleBulkFavorite : undefined,
    getOnArchive: () =>
      viewMode === AlbumPageViewMode.VIEW && (timelineManager || showSearchResults) ? handleBulkArchive : undefined,
    getOnDelete: () =>
      viewMode === AlbumPageViewMode.VIEW && (timelineManager || showSearchResults) ? handleRemoveAssets : undefined,
    getOnUndoDelete: () =>
      viewMode === AlbumPageViewMode.VIEW && (timelineManager || showSearchResults)
        ? handleUndoRemoveAssets
        : undefined,
  });

  $effect(() => {
    if (data.album.id === album.id) {
      return;
    }

    album = data.album;
    albumFilters = hydrateAlbumFilters(page.url);
    committedSearchQuery = getSearchablePageState(page.url).query;
    searchIsLoading = false;
    smartFacetInFlight?.controller.abort();
    smartFacets = undefined;
    smartFacetKey = '';
    smartFacetInFlight = undefined;
    lastHandledFilterSearch = withoutAtParam(page.url.search);
    pickerFilters = createFilterState();
    albumPersonNames.clear();
    albumTagNames.clear();
    pickerPersonNames.clear();
    pickerTagNames.clear();
    timelineMultiSelectManager.clear();
    assetMultiSelectManager.clear();
    viewMode = AlbumPageViewMode.VIEW;
    timelineGrouping = 'day';
    temporalAnchor = undefined;
    oldAt = null;
  });

  $effect(() => {
    const nextFilterSearch = withoutAtParam(page.url.search);
    if (nextFilterSearch === lastHandledFilterSearch) {
      return;
    }

    untrack(() => {
      // Every filter — including the temporal picker's year/month — round-trips through the URL, so
      // rebuilding FilterState from the URL alone is lossless.
      const nextQuery = getSearchablePageState(page.url).query;
      // A NEW query invalidates the facets outright. Leaving them would let the previous query's
      // total and time buckets annotate the new results until the fresh ones land — and a failed
      // fetch returns the stale value, so they would never be corrected.
      if (nextQuery !== committedSearchQuery) {
        smartFacetInFlight?.controller.abort();
        smartFacetInFlight = undefined;
        smartFacets = undefined;
        smartFacetKey = '';
        searchResults = [];
      }
      albumFilters = {
        ...createFilterState(),
        ...hydrateAlbumFilters(page.url),
      };
      committedSearchQuery = nextQuery;
      searchIsLoading = false;
      lastHandledFilterSearch = nextFilterSearch;
      consumeTypedSearchNamesInto(page.url.pathname + page.url.search, albumPersonNames, albumTagNames);
    });
  });

  const containsEditors = $derived(album?.shared && album.albumUsers.some(({ role }) => role === AlbumUserRole.Editor));
  const albumUsers = $derived(showAlbumUsers && containsEditors ? album.albumUsers.map(({ user }) => user) : []);

  $effect(() => {
    if (!album.isActivityEnabled && activityManager.commentCount === 0) {
      assetViewerManager.closeActivityPanel();
    }
  });

  let smartFacets = $state<SmartSearchFacetsResponseDto>();
  let smartFacetKey = $state('');
  let smartFacetInFlight:
    | { key: string; controller: AbortController; promise: Promise<SmartSearchFacetsResponseDto | undefined> }
    | undefined;

  const emptyFilterSuggestions = () => ({
    countries: [],
    cities: [],
    cameraMakes: [],
    cameraModels: [],
    tags: [],
    people: [],
    ratings: [],
    mediaTypes: [],
    hasUnnamedPeople: false,
    hasFavorites: false,
    hasAssetsInAlbum: false,
    hasAssetsNotInAlbum: false,
  });

  /**
   * Facets for the ACTIVE search, scoped to this album — the source of the result count and of the
   * temporal picker's buckets while a query is running. Memoised on the request shape so a filter
   * change that cannot alter the facets (sortOrder) does not refetch.
   */
  async function loadAlbumSmartFacets(nextFilters: FilterState): Promise<SmartSearchFacetsResponseDto | undefined> {
    const query = committedSearchQuery.trim();
    if (!query) {
      return undefined;
    }

    const args = { query, filters: nextFilters, albumIds: searchAlbumIds, language: $lang };
    const key = buildSmartSearchFacetKey(args);
    if (smartFacets && smartFacetKey === key) {
      return smartFacets;
    }
    if (smartFacetInFlight?.key === key) {
      return smartFacetInFlight.promise;
    }

    smartFacetInFlight?.controller.abort();
    const controller = new AbortController();

    const promise = searchSmartFacets(
      { smartSearchFacetsDto: buildSmartSearchFacetsParams(args) },
      { signal: controller.signal },
    )
      .then((result) => {
        if (smartFacetInFlight?.key === key && !controller.signal.aborted) {
          smartFacets = result;
          smartFacetKey = key;
        }
        return result;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch smart search facets:', error);
        }
        return smartFacets;
      })
      .finally(() => {
        if (smartFacetInFlight?.key === key) {
          smartFacetInFlight = undefined;
        }
      });

    smartFacetInFlight = { key, controller, promise };
    return promise;
  }

  const searchTotal = $derived(showSearchResults ? smartFacets?.total : undefined);

  const albumFilterConfig = $derived.by(() => {
    const base = buildAlbumDetailFilterConfig(album.id);
    const provider = base.suggestionsProvider!;
    return {
      ...base,
      // Browse mode asks the album's own suggestion endpoint; query mode has to ask the SEARCH, or
      // the panel would offer facets the visible results do not contain. BOTH branches feed the
      // name maps — a chip picked from the facets has no other source for its label, and
      // ActiveFiltersBar falls back to rendering the raw `person:<uuid>` token without it.
      suggestionsProvider: async (filters: FilterState) => {
        const result = showSearchResults
          ? await loadAlbumSmartFacets(filters).then((facets) =>
              facets ? mapSmartSearchFacetsToFilterSuggestions(facets) : emptyFilterSuggestions(),
            )
          : await provider(filters);
        for (const person of result.people) {
          albumPersonNames.set(person.id, person.name);
        }
        for (const tag of result.tags) {
          albumTagNames.set(tag.id, tag.name);
        }
        return result;
      },
    };
  });

  const pickerFilterConfig = $derived.by(() => {
    const base = buildAlbumAssetPickerFilterConfig();
    const provider = base.suggestionsProvider!;
    return {
      ...base,
      suggestionsProvider: async (filters: FilterState) => {
        const result = await provider(filters);
        for (const person of result.people) {
          pickerPersonNames.set(person.id, person.name);
        }
        for (const tag of result.tags) {
          pickerTagNames.set(tag.id, tag.name);
        }
        return result;
      },
    };
  });

  const totalAssetCount = $derived(timelineManager?.assetCount ?? 0);

  // The bar prints the SEARCH total in its label, so the collect call has to run the same search.
  // Omitting the query sends `collectSearchResultAssetIds` down the metadata branch, which then
  // collects every asset in the album — "Add all 3" quietly adding 800.
  const handleAddAllToCollection = () => {
    const query = committedSearchQuery.trim();
    const terms: SearchTerms = { ...filterStateToSearchTerms(albumFilters), albumIds: [album.id] };
    if (query) {
      terms.query = query;
    }
    void modalManager.show(SearchAddAllToCollectionModal, {
      terms,
      total: showSearchResults ? (searchTotal ?? 0) : totalAssetCount,
      smartSearchEnabled: !!query,
      language: $lang,
    });
  };
  const hasTimelineMonths = $derived((timelineManager?.months?.length ?? 0) > 0);
  const activeFilterCount = $derived(
    getActiveFilterCount(viewMode === AlbumPageViewMode.SELECT_ASSETS ? pickerFilters : albumFilters),
  );
  const isTimelineEmpty = $derived(
    timelineManager?.isInitialized && !hasTimelineMonths && totalAssetCount === 0 && activeFilterCount === 0,
  );

  // Filter-panel collapse is driven here so a header filter button can reclaim the panel's space.
  let filterCollapsed = $state(loadFilterCollapsed(true)); // local Omarchy layer: the timeline leads
  const showFilteredEmptyState = $derived(
    timelineManager?.isInitialized && !hasTimelineMonths && totalAssetCount === 0 && activeFilterCount > 0,
  );
  const timeBuckets = $derived(getTimelineManagerTimeBuckets(timelineManager));
  // While a query is running the panel's temporal picker must bucket the MATCHES, not the album.
  const filterTimeBuckets = $derived(showSearchResults ? (smartFacets?.timeBuckets ?? []) : timeBuckets);
  const isBrowseTimeline = $derived(viewMode === AlbumPageViewMode.VIEW);

  // the filter panel's reopen button, while the panel is folded away
  const filterButtonShown = $derived(
    filterCollapsed &&
      isBrowseTimeline &&
      !assetMultiSelectManager.selectionActive &&
      (!isTimelineEmpty || showSearchResults),
  );
  // Local Omarchy layer: below 768px Years / Months / All float over the photos and Search here is the bar's own
  // search, so the filter button would stand alone in a row above them (52px on a phone): it goes first among the
  // bar's icons instead, as Photos keeps its own (managers/bar-slot), and the row is left to the filters in use
  $effect(() => {
    if (!narrowBar.current) {
      return;
    }
    barSlot.tools = albumTools;
    return () => {
      if (barSlot.tools === albumTools) {
        barSlot.tools = undefined;
      }
    };
  });

  /**
   * The album scope handed to smart search — this album alone, matching the browse timeline's own
   * `albumId` scope and the personal person tokens its filter panel speaks.
   */
  const searchAlbumIds = $derived([album.id]);

  /**
   * Browse order. An album carries its own `order`, but the navbar sort dropdown renders on every
   * searchable page — browse mode included — so an EXPLICIT `?sort=` has to win, or the control
   * would visibly do nothing here. Absent that param the album's own order stands.
   */
  const browseOrder = $derived.by(() => {
    if (!getSearchablePageState(page.url).hasExplicitSort) {
      return album.order ?? authManager.preferences.albums.defaultAssetOrder;
    }
    return albumFilters.sortOrder === 'asc' ? AssetOrder.Asc : AssetOrder.Desc;
  });

  const options = $derived.by(() => {
    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      return buildAlbumAssetPickerOptions(album.id, pickerFilters);
    }
    const albumOptions = buildAlbumTimelineOptions(album.id, browseOrder, albumFilters);
    return isBrowseTimeline ? { ...albumOptions, grouping: timelineGrouping } : albumOptions;
  });

  const isShared = $derived(viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : album.albumUsers.length > 1);

  $effect(() => {
    if (assetViewerManager.isViewing || !isShared) {
      return;
    }

    handlePromiseError(activityManager.init(album.id));
  });

  onDestroy(() => activityManager.reset());

  const isOwned = $derived(isAlbumOwner(album));

  let showActivityStatus = $derived(
    album.albumUsers.length > 1 &&
      !assetViewerManager.isViewing &&
      (album.isActivityEnabled || activityManager.commentCount > 0),
  );
  const isEditor = $derived(isAlbumEditor(album));
  // Local Omarchy layer: To do, Villa (managers/special-albums), when this album is one of them
  const special = $derived(specialAlbumOf(album.id));

  // Local Omarchy layer: Shift + middle-click on a photo here takes it out of this album only, like Delete in a Mac
  // Photos album (utils/quick-trash); a special album takes it out its own way, tag and archive too. The Add photos
  // picker shows the library instead, where the gesture still trashes.
  $effect(() => {
    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      return;
    }
    const albumId = album.id;
    const out = special;
    return quickTrashInAlbum(
      out ? (asset) => out.done([asset]) : isEditor ? (asset) => takeOutOfAlbum(albumId, [asset.id]) : undefined,
    );
  });

  const isSelectionMode = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? true : viewMode === AlbumPageViewMode.SELECT_THUMBNAIL,
  );
  const singleSelect = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : viewMode === AlbumPageViewMode.SELECT_THUMBNAIL,
  );
  const showArchiveIcon = $derived(viewMode !== AlbumPageViewMode.SELECT_ASSETS);
  const onSelect = ({ id }: { id: string }) => {
    if (viewMode !== AlbumPageViewMode.SELECT_ASSETS) {
      void handleUpdateThumbnail(id);
    }
  };
  const currentAssetIntersection = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? timelineMultiSelectManager : assetMultiSelectManager,
  );

  function handleTimelineGroupingChange(grouping: TimelineGrouping) {
    const anchor = getTimelineTopVisibleAnchor(timelineManager);
    timelineGrouping = grouping;
    temporalAnchor = anchor;
  }

  function handleTimelineBucketActivate(bucket: ActivatableTimelineBucket) {
    if (!isBrowseTimeline || assetMultiSelectManager.selectionActive) {
      return;
    }

    const result = getTimelineBucketZoomTarget(bucket);
    if (!result) {
      return;
    }

    timelineGrouping = result.grouping;
    temporalAnchor = result.anchor;
  }

  function syncAlbumFilterUrl(nextFilters: FilterState) {
    const nextUrl = buildFilterStateUrl(page.url, nextFilters);
    // NOT a string compare: buildFilterStateUrl re-appends the filter params last, so an unchanged
    // state on `?make=Apple&at=…`-style URLs can come back re-ordered. See filter-target.ts.
    if (isFilterStateUrlUnchanged(page.url, nextUrl)) {
      return;
    }
    void goto(nextUrl, { replaceState: true, keepFocus: true, noScroll: true });
  }

  $effect(() => globalSearchManager.registerSearchablePageFilters(() => albumFilters));

  const clearAlbumSearch = () => {
    searchIsLoading = false;
    const nextUrl = buildSearchablePageUrl(page.url, '', albumFilters.sortOrder, albumFilters);
    if (!nextUrl) {
      return;
    }
    void goto(nextUrl, { replaceState: true, keepFocus: true, noScroll: true });
  };

  function clearAlbumTemporalFilter() {
    albumFilters = clearTimelineTemporalFilter(albumFilters);
    temporalAnchor = undefined;
    syncAlbumFilterUrl(albumFilters);
  }

  const onAlbumDelete = async ({ id }: AlbumResponseDto) => {
    if (id !== album.id) {
      return;
    }

    await backToAlbums();
    viewMode = AlbumPageViewMode.VIEW;
  };

  const onAlbumAddAssets = async ({ albumIds, assetIds }: { albumIds: string[]; assetIds: string[] }) => {
    if (!albumIds.includes(album.id)) {
      return;
    }

    album = { ...album, assetCount: album.assetCount + assetIds.length };

    timelineMultiSelectManager.clear();
    await setModeToView();
  };

  const onAlbumShare = async () => {
    await refreshAlbum();
    await setModeToView();
  };

  const onAlbumUserUpdate = ({ albumId, userId, role }: { albumId: string; userId: string; role: AlbumUserRole }) => {
    if (albumId !== album.id) {
      return;
    }

    const albumUsers = album.albumUsers.map((albumUser) =>
      albumUser.user.id === userId ? { ...albumUser, role } : albumUser,
    );
    album = { ...album, albumUsers };
  };

  const onAlbumUpdate = async (newAlbum: AlbumResponseDto) => {
    album = newAlbum;

    // invalidating during navigation causes an infinite page load
    await navigating.complete;

    await invalidate('album:data');
  };

  const { Cast } = $derived(getGlobalActions($t));
  const Actions = $derived(getAlbumActions($t, album));
  const { AddAssets, Upload } = $derived(getAlbumAssetsActions($t, album, timelineMultiSelectManager.assets));

  const Close = $derived({
    title: $t('go_back'),
    icon: mdiArrowLeft,
    onAction: handleEscape,
    $if: () => !assetViewerManager.isViewing,
    shortcuts: { key: 'Escape' },
  });
</script>

<OnEvents
  onSharedLinkCreate={refreshAlbum}
  onSharedLinkDelete={refreshAlbum}
  {onAlbumDelete}
  {onAlbumAddAssets}
  {onAlbumRemoveAssets}
  {onAlbumShare}
  {onAlbumUserUpdate}
  onAlbumUserDelete={refreshAlbum}
  {onAlbumUpdate}
/>
<CommandPaletteDefaultProvider name={$t('album')} actions={[AddAssets, Upload, Close, ...Object.values(Actions)]} />

{#snippet albumBarLeading()}
  <IconButton
    shape="round"
    variant="ghost"
    color="secondary"
    icon={mdiArrowLeft}
    aria-label={$t('back')}
    onclick={() => backToAlbums()}
  />
  <AlbumBarTitle {album} {isEditor} onUpdate={(albumName) => (album = { ...album, albumName })} />
{/snippet}

{#snippet albumBarButtons()}
  {#if Actions.Share.$if?.() ?? true}
    <Button
      leadingIcon={Actions.Share.icon}
      variant="ghost"
      size="small"
      color="secondary"
      onclick={(event: MouseEvent) => Actions.Share.onAction({ event, action: Actions.Share })}
    >
      <span class="ws-action-label">{$t('share')}</span>
    </Button>
  {/if}
  {#if !narrowBar.current}
    <!-- Local Omarchy layer: one Play with its ways of showing the album on a screen (DESIGN.md, Album page): a
         slideshow here, Room across the room (never for To do, Villa or QR, which keep their photos out of sight) and
         Cast when a cast target is around. They stood side by side as three screen icons; Cast is in the View menu too -->
    {#if album.assetCount > 0}
      <ButtonContextMenu
        icon={mdiPlayOutline}
        title={$t('play')}
        color="secondary"
        offset={{ x: 175, y: 25 }}
        data-testid="album-play"
      >
        <MenuOption icon={mdiPresentationPlay} text={$t('slideshow')} onClick={handleStartSlideshow} />
        {#if !special}
          <MenuOption
            icon={mdiTelevisionPlay}
            text={$t('room')}
            onClick={() => goto(Route.room({ album: album.id }))}
            testId="album-room"
          />
        {/if}
        {#if Cast.$if?.() ?? true}
          <MenuOption icon={Cast.icon} text={$t('cast')} onClick={(event) => Cast.onAction({ action: Cast, event })} />
        {/if}
      </ButtonContextMenu>
    {/if}

    {#if isEditor}
      <IconButton
        variant="ghost"
        shape="round"
        color="secondary"
        aria-label={$t('add_photos')}
        onclick={startAddPhotos}
        icon={mdiImagePlusOutline}
      />
    {/if}

    {#if featureFlagsManager.value.map}
      <AlbumMap {album} filters={albumFilters} />
    {/if}

    <ActionButton action={Actions.Download} />
  {/if}

  <!-- Local Omarchy layer: there for every album but To do, Villa and QR, since any other can be pinned to the
       sidebar (stores/pinned-albums) -->
  {#if isOwned || album.albumUsers.length > 1 || narrowBar.current || Actions.Pin.$if?.()}
    <ButtonContextMenu icon={mdiDotsVertical} title={$t('album_options')} color="secondary" offset={{ x: 175, y: 25 }}>
      {#if narrowBar.current}
        {#if isEditor}
          <MenuOption icon={mdiImagePlusOutline} text={$t('add_photos')} onClick={startAddPhotos} />
        {/if}
        {#if album.assetCount > 0}
          <MenuOption icon={mdiPresentationPlay} text={$t('slideshow')} onClick={handleStartSlideshow} />
          {#if !special}
            <MenuOption
              icon={mdiTelevisionPlay}
              text={$t('room_play')}
              onClick={() => goto(Route.room({ album: album.id }))}
              testId="album-room"
            />
          {/if}
        {/if}
        <ActionMenuItem action={Actions.Download} />
      {/if}
      {#if containsEditors}
        <MenuOption
          icon={showAlbumUsers ? mdiAccountEye : mdiAccountEyeOutline}
          text={showAlbumUsers ? $t('hide_asset_owners') : $t('view_asset_owners')}
          onClick={() => timelineManager.toggleShowAssetOwners()}
        />
      {/if}
      <ActionMenuItem action={Actions.Options} />
      {#if isOwned && album.assetCount > 0}
        <MenuOption
          icon={mdiImageOutline}
          text={$t('select_album_cover')}
          onClick={() => (viewMode = AlbumPageViewMode.SELECT_THUMBNAIL)}
        />
      {/if}

      {#if isOwned}
        <MenuOption
          icon={mdiLinkVariantPlus}
          text={$t('link_album_to_space')}
          onClick={async () => {
            if (await handleLinkAlbumToSpace(album)) {
              await refreshAlbum();
            }
          }}
        />
      {/if}
      <ActionMenuItem action={Actions.Pin} />
      <ActionMenuItem action={Actions.MoveToFolder} />
      <ActionMenuItem action={Actions.Merge} />
      <ActionMenuItem action={Actions.ToggleTimeline} />
      <ActionMenuItem action={Actions.MakeBook} />
      <ActionMenuItem action={Actions.Delete} />
      <ActionMenuItem action={Actions.Leave} />
    </ButtonContextMenu>
  {/if}
{/snippet}

<!-- Local Omarchy layer: the filter button among the bar's icons below 768px (see filterButtonShown) -->
{#snippet albumTools()}
  {#if filterButtonShown}
    <BarFilterButton active={getActiveFilterCount(albumFilters) > 0} onclick={() => (filterCollapsed = false)} />
  {/if}
{/snippet}

<!-- Local Omarchy layer: the album lives in the shell like every page (2026-10-15): the sidebar stays, with the album
     lit in its tree, and the one bar carries its back arrow, its name (renamed in place), its dates and count and its
     own buttons, Share first. Selecting, adding photos and choosing a cover swap the bar for theirs (below the shell) -->
<UserPageLayout
  hideNavbar={viewMode !== AlbumPageViewMode.VIEW || assetMultiSelectManager.selectionActive}
  barFitsNavbar
  scrollbar={false}
  description={albumBarDescription}
  leading={albumBarLeading}
  buttons={albumBarButtons}
>
  <div class="flex h-full overflow-hidden" use:scrollMemoryClearer={{ routeStartsWith: Route.albums() }}>
    <div class="relative w-full shrink">
      <!-- Local Omarchy layer: a box, not a second <main>: the album lives in the shell, whose main holds it -->
      <div class="relative h-full overflow-hidden">
        <div class="flex h-full" data-testid="discovery-timeline">
          <div class="h-full shrink-0">
            <div class="h-full overflow-hidden" data-testid="album-filter-panel-surface">
              {#if viewMode === AlbumPageViewMode.SELECT_ASSETS}
                {#key `picker-${album.id}`}
                  <FilterPanel
                    config={pickerFilterConfig}
                    bind:filters={pickerFilters}
                    {timeBuckets}
                    storageKey="gallery-filter-visible-sections-album-detail"
                    hidden={isTimelineEmpty}
                  />
                {/key}
              {:else}
                <!-- Keyed on the search too: switching between browse and query mode swaps the whole
                   suggestions provider, so the panel has to re-run it rather than keep browse facets. -->
                {#key `album-${album.id}:${showSearchResults ? `search-${committedSearchQuery.trim()}:${$lang}` : 'browse'}`}
                  <FilterPanel
                    config={albumFilterConfig}
                    bind:filters={albumFilters}
                    bind:collapsed={filterCollapsed}
                    externalToggle
                    timeBuckets={filterTimeBuckets}
                    storageKey="gallery-filter-visible-sections-album-detail"
                    hidden={isTimelineEmpty && !showSearchResults}
                    personNames={albumPersonNames}
                    tagNames={albumTagNames}
                    onFiltersChange={syncAlbumFilterUrl}
                  />
                {/key}
              {/if}
            </div>
          </div>

          <div class="flex flex-1 flex-col overflow-hidden">
            {#if viewMode === AlbumPageViewMode.SELECT_ASSETS && getActiveFilterCount(pickerFilters) > 0}
              <ActiveFiltersBar
                filters={pickerFilters}
                resultCount={totalAssetCount}
                personNames={pickerPersonNames}
                tagNames={pickerTagNames}
                onRemoveFilter={(type, id) => {
                  pickerFilters = handlePhotosRemoveFilter(pickerFilters, type, id);
                }}
                onClearAll={() => {
                  pickerFilters = clearFilters(pickerFilters);
                }}
              />
            {:else if viewMode !== AlbumPageViewMode.SELECT_ASSETS}
              {#snippet albumFiltersBar()}
                <ActiveFiltersBar
                  embedded
                  filters={albumFilters}
                  resultCount={showSearchResults ? searchTotal : totalAssetCount}
                  personNames={albumPersonNames}
                  tagNames={albumTagNames}
                  ownerNames={albumOwnerNames}
                  onRemoveFilter={(type, id) => {
                    if (type === 'timeline') {
                      clearAlbumTemporalFilter();
                    } else {
                      albumFilters = handlePhotosRemoveFilter(albumFilters, type, id);
                      syncAlbumFilterUrl(albumFilters);
                    }
                  }}
                  onClearAll={() => {
                    albumFilters = clearFilters(albumFilters);
                    temporalAnchor = undefined;
                    syncAlbumFilterUrl(albumFilters);
                  }}
                  searchQuery={committedSearchQuery}
                  onClearSearch={clearAlbumSearch}
                  onAddAllToCollection={handleAddAllToCollection}
                />
              {/snippet}
              <FilterToolbar
                class="ps-0"
                grouping={timelineGrouping}
                onGroupingChange={handleTimelineGroupingChange}
                showGrouping={isBrowseTimeline && !showSearchResults && !assetMultiSelectManager.selectionActive}
                showFilters={getActiveFilterCount(albumFilters) > 0 || showSearchResults}
                filters={albumFiltersBar}
                showFilterButton={filterButtonShown && !narrowBar.current}
                filterActive={getActiveFilterCount(albumFilters) > 0}
                onExpandFilters={() => (filterCollapsed = false)}
                showSearchButton={isBrowseTimeline && !assetMultiSelectManager.selectionActive}
                onSearch={() => globalSearchManager.open()}
              />
            {/if}

            {#if showSearchResults && viewMode !== AlbumPageViewMode.SELECT_ASSETS}
              <SmartSearchResults
                searchQuery={committedSearchQuery}
                bind:isLoading={searchIsLoading}
                bind:results={searchResults}
                reloadToken={searchReloadToken}
                filters={albumFilters}
                albumIds={searchAlbumIds}
                language={$lang}
                {isShared}
                total={searchTotal}
              />
            {:else if showFilteredEmptyState}
              <!-- Local Omarchy layer: Photos' own words for a filter that finds nothing, in the Empty State's grammar on
                   the gutter, as a Space's album says it; upstream centred an English line and a link -->
              <EmptyState
                title={$t('timeline_empty_filtered_title')}
                body={$t(
                  viewMode === AlbumPageViewMode.SELECT_ASSETS
                    ? 'space_album_no_photos_to_add_match_filters'
                    : 'timeline_empty_filtered_subtitle',
                )}
                action={{
                  label: $t('timeline_empty_clear_filters'),
                  onclick: () => {
                    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
                      pickerFilters = clearFilters(pickerFilters);
                    } else {
                      albumFilters = clearFilters(albumFilters);
                      temporalAnchor = undefined;
                      syncAlbumFilterUrl(albumFilters);
                    }
                  },
                }}
                testId="empty-state-message"
              />
            {:else}
              <Timeline
                enableRouting={viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : true}
                {album}
                {albumUsers}
                bind:timelineManager
                {options}
                assetInteraction={currentAssetIntersection}
                {isShared}
                {isSelectionMode}
                {singleSelect}
                {showArchiveIcon}
                {onSelect}
                onEscape={handleEscape}
                withStacked={true}
                onTimelineBucketActivate={isBrowseTimeline ? handleTimelineBucketActivate : undefined}
                temporalAnchor={isBrowseTimeline ? temporalAnchor : undefined}
                onTemporalAnchorResolved={isBrowseTimeline ? () => (temporalAnchor = undefined) : undefined}
                grouping={isBrowseTimeline ? timelineGrouping : 'day'}
                onGroupingChange={isBrowseTimeline ? handleTimelineGroupingChange : undefined}
              >
                {#if viewMode !== AlbumPageViewMode.SELECT_ASSETS}
                  {#if viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL}
                    <!-- Local Omarchy layer: the album's details under the bar, scrolling away with its photos: how a smart,
                       special or hidden album works, its description, Curator's story, who it is shared with and the
                       people in it (its name, dates and count are in the bar) -->
                    <section class="ws-album-details">
                      <!-- Local Omarchy layer: a smart album says so, with Edit search and Stop updating; Curator keeps
                         it, so only for Curator's owner (curatorIsMine) -->
                      {#if curatorIsMine()}
                        <SmartAlbumBadge albumId={album.id} />
                      {/if}

                      <!-- Local Omarchy layer: a special album says how it works; empty, it says how photos get there
                         instead (below) -->
                      {#if special && album.assetCount > 0}
                        <p class="ws-album-note">{$t(special.words.note)}</p>
                      {/if}
                      <!-- Local Omarchy layer: hidden from my timeline (managers/album-folders) says so, with the way back
                         right beside it -->
                      {#if !special && albumFolders.hiddenFromTimeline(album.id)}
                        <p class="ws-album-note ws-album-hidden-note" data-testid="album-hidden-note">
                          <span class="ws-hidden-mark">
                            <Icon icon={mdiEyeOffOutline} size="14" aria-hidden={true} />
                            {$t('album_not_in_photos')}
                          </span>
                          {$t('album_not_in_photos_note')}
                          <button
                            type="button"
                            class="ws-empty-link"
                            onclick={() => albumFolders.toggleTimeline(album)}
                          >
                            {$t('album_show_in_photos')}
                          </button>
                        </p>
                      {/if}

                      <!-- rbac-6: owner-only — the server populates album.sharedSpaceLinks only for
                         the album owner, so this self-hides for every other caller. -->
                      <AlbumSharedSpaceLinks {album} />

                      <div class="ws-album-description">
                        <AlbumDescription
                          id={album.id}
                          {isEditor}
                          bind:description={
                            () => album.description, (description) => (album = { ...album, description })
                          }
                        />
                      </div>
                      <!-- Local Omarchy layer: the story of the event or trip the album holds, Curator's, so only for
                         Curator's owner (curatorIsMine) -->
                      {#if curatorIsMine()}
                        <AlbumStory albumId={album.id} description={album.description} />
                      {/if}

                      <!-- who it is shared with, people and a link, as one row that opens the Share sheet -->
                      {#if album.albumUsers.length > 1 || (album.hasSharedLink && isOwned)}
                        <button
                          type="button"
                          class="ws-album-shared"
                          onclick={(event) => Actions.Share.onAction({ event, action: Actions.Share })}
                        >
                          <span>{$t('shared_with')}</span>
                          <span class="ws-album-shared-people">
                            {#each album.albumUsers.filter(({ user }) => user.id !== authManager.user.id) as { user } (user.id)}
                              <UserAvatar {user} size="sm" />
                            {/each}
                          </span>
                          {#if album.hasSharedLink && isOwned}
                            <span class="ws-album-shared-links">
                              <Icon icon={mdiLink} size="14" aria-hidden={true} />
                              {$t('shared_links')}
                            </span>
                          {/if}
                        </button>
                      {/if}

                      <AlbumPeopleStrip
                        albumId={album.id}
                        selected={albumFilters.personIds}
                        onToggle={toggleAlbumPerson}
                        onMore={() => (filterCollapsed = false)}
                      />
                    </section>
                  {/if}

                  {#if album.assetCount === 0 && special}
                    <div class="ws-empty">
                      <h2 class="ws-empty-title">{$t(special.words.emptyTitle)}</h2>
                      <p class="ws-empty-body">{$t(special.words.emptyBody)}</p>
                      <div class="ws-empty-actions">
                        <button
                          type="button"
                          class="ws-empty-action"
                          onclick={() => (viewMode = AlbumPageViewMode.SELECT_ASSETS)}
                        >
                          {$t('select_photos')}
                        </button>
                      </div>
                    </div>
                  {:else if album.assetCount === 0}
                    <!-- Local Omarchy layer: the Empty State on the gutter, as a Space's album and the special albums
                         say it; upstream centred "ADD PHOTOS" over a rounded grey slab that was the button -->
                    <div id="empty-album">
                      <EmptyState
                        title={$t('space_album_empty_title')}
                        body={$t(isEditor ? 'album_empty_body' : 'space_album_empty_subtitle_viewer')}
                        action={isEditor
                          ? { label: $t('select_photos'), onclick: () => (viewMode = AlbumPageViewMode.SELECT_ASSETS) }
                          : undefined}
                      />
                    </div>
                  {/if}
                {/if}
              </Timeline>
            {/if}
          </div>
        </div>

        {#if showActivityStatus}
          <div class="absolute inset-e-0 bottom-0 z-2 me-12 mb-6">
            <ActivityStatus
              disabled={!album.isActivityEnabled}
              isLiked={activityManager.isLiked}
              numberOfComments={activityManager.commentCount}
              numberOfLikes={undefined}
              onFavorite={handleFavorite}
            />
          </div>
        {/if}
      </div>

      <!-- Local Omarchy layer: right-click menu on the album's photos (the owner: "a right click in albums that allows to
         reveal original photo in the photo view"), acting on the selection like the bar below; Show in Photos leads -->
      {#if viewMode === AlbumPageViewMode.VIEW && (showSearchResults || timelineManager)}
        <TileContextMenu
          grid={showSearchResults ? '[data-testid="gallery-viewer"]' : '#asset-grid'}
          findAsset={findMenuAsset}
          withStackItems={false}
          reveal
          assetInteraction={assetMultiSelectManager}
        >
          <!-- Local Omarchy layer: what a person does most leads (Favorite, Add to album, New album, Share, then the
               special albums: a special album's way out, or the others); the menu puts its own downloads and copies
               with Download, and the edits and the ways out of the album come last -->
          {@const MenuActions = getAssetBulkActions($t, { album })}
          <FavoriteAction
            menuItem
            removeFavorite={assetMultiSelectManager.isAllFavorite}
            onFavorite={handleBulkFavorite}
          />
          <ActionMenuItem action={MenuActions.AddToAlbum} hint />
          <ActionMenuItem action={MenuActions.NewAlbum} hint />
          <ActionMenuItem action={MenuActions.CreateSharedLink} />
          {#if assetMultiSelectManager.isAllUserOwned}
            {#if special}
              <SpecialAlbumAction {special} done menuItem />
            {/if}
            {#each offeredSpecialAlbums() as other (other.key)}
              {#if other !== special}
                <SpecialAlbumAction special={other} menuItem onArchive={handleBulkArchive} />
              {/if}
            {/each}
          {/if}
          {#snippet downloads()}
            <DownloadAction menuItem filename={album.albumName} />
          {/snippet}
          {#snippet more()}
            {@const Edits = getAssetBulkActions($t, { album })}
            {#if isEditor && assetMultiSelectManager.assets.length === 1}
              <MenuOption
                text={$t('set_as_album_cover')}
                icon={mdiImageOutline}
                onClick={() => updateThumbnailUsingCurrentSelection()}
              />
            {/if}
            {#if assetMultiSelectManager.isAllUserOwned}
              <RotateAction />
              <ActionMenuItem action={Edits.Tag} hint />
              <ChangeDate menuItem />
              <ChangeLocation menuItem />
              <ChangeDescription menuItem />
            {/if}
            <hr />
            <ActionMenuItem action={Edits.RemoveFromAlbum} hint />
            {#if assetMultiSelectManager.isAllUserOwned}
              <ArchiveAction menuItem unarchive={assetMultiSelectManager.isAllArchived} onArchive={handleBulkArchive} />
              <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
              <DeleteAssets menuItem onAssetDelete={handleRemoveAssets} onUndoDelete={handleUndoRemoveAssets} />
            {/if}
          {/snippet}
        </TileContextMenu>
      {/if}
    </div>
    {#if album.albumUsers.length > 1 && album && assetViewerManager.isShowActivityPanel && authManager.authenticated && !assetViewerManager.isViewing}
      <div class="flex">
        <div
          transition:fly={{ duration: 150 }}
          id="activity-panel"
          class="z-2 w-90 overflow-y-auto transition-all md:w-115 dark:border-l dark:border-s-immich-dark-gray"
          translate="yes"
        >
          <ActivityViewer disabled={!album.isActivityEnabled} albumUsers={album.albumUsers} albumId={album.id} />
        </div>
      </div>
    {/if}
  </div>
</UserPageLayout>

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {@const Actions = getAssetBulkActions($t, { album })}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
    <!-- Local Omarchy layer: the actions in groups split by hairlines (SelectionGroup), as on Photos: the selection
         itself, what keeps or shares it (Add to album by its name, where it was a bare +), a special album's way out,
         and the rest under the ⋮ -->
    <SelectionGroup>
      <SelectAllAssets
        timelineManager={showSearchResults ? undefined : timelineManager}
        assetInteraction={assetMultiSelectManager}
        onSelectAll={showSearchResults
          ? () => selectAllSearchResults(searchResults, assetMultiSelectManager)
          : undefined}
      />
    </SelectionGroup>
    <SelectionGroup>
      <span class="ws-select-labelled contents"><ActionButton action={Actions.AddToAlbum} type="button" /></span>
      <ActionButton action={Actions.CreateSharedLink} />
      <!-- #763: no isAllUserOwned gate — a favorite is a per-user overlay row, so any asset the
               viewer can read is favoritable, including another member's in a shared space. -->
      <FavoriteAction removeFavorite={assetMultiSelectManager.isAllFavorite} onFavorite={handleBulkFavorite}
      ></FavoriteAction>
    </SelectionGroup>
    <!-- Local Omarchy layer: in a special album its way out (Mark done, Remove from Villa) puts the photos back
             where they came from; its key does the same -->
    {#if special && assetMultiSelectManager.isAllUserOwned}
      <SelectionGroup>
        <span class="ws-primary-action contents"><SpecialAlbumAction {special} done /></span>
      </SelectionGroup>
    {/if}
    <SelectionGroup>
      <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')} offset={{ x: 175, y: 25 }}>
        <DownloadAction menuItem filename={album.albumName} />
        {#if assetMultiSelectManager.isAllUserOwned}
          <RotateAction />
          <ChangeDate menuItem />
          <ChangeDescription menuItem />
          <ChangeLocation menuItem />
          <ArchiveAction menuItem unarchive={assetMultiSelectManager.isAllArchived} onArchive={handleBulkArchive} />
          {#each offeredSpecialAlbums() as other (other.key)}
            {#if other !== special}
              <SpecialAlbumAction special={other} menuItem onArchive={handleBulkArchive} />
            {/if}
          {/each}
          <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        {/if}
        {#if isEditor && assetMultiSelectManager.assets.length === 1}
          <MenuOption
            text={$t('set_as_album_cover')}
            icon={mdiImageOutline}
            onClick={() => updateThumbnailUsingCurrentSelection()}
          />
        {/if}

        <ActionMenuItem action={Actions.Tag} />

        <ActionMenuItem action={Actions.RemoveFromAlbum} />
        {#if assetMultiSelectManager.isAllUserOwned}
          <DeleteAssets menuItem onAssetDelete={handleRemoveAssets} onUndoDelete={handleUndoRemoveAssets} />
        {/if}
      </ButtonContextMenu>
    </SelectionGroup>
  </AssetSelectControlBar>
{:else if viewMode === AlbumPageViewMode.SELECT_ASSETS}
  <ControlAppBar onClose={handleCloseSelectAssets} class="ws-select-bar">
    {#snippet leading()}
      <p class="text-lg dark:text-immich-dark-fg">
        {#if !timelineMultiSelectManager.selectionActive}
          {$t('add_to_album')}
        {:else}
          {$t('selected_count', { values: { count: timelineMultiSelectManager.assets.length } })}
        {/if}
      </p>
    {/snippet}

    {#snippet trailing()}
      <HeaderActionButton action={Upload} />
      <HeaderActionButton action={AddAssets} />
    {/snippet}
  </ControlAppBar>
{:else if viewMode === AlbumPageViewMode.SELECT_THUMBNAIL}
  <ControlAppBar onClose={() => (viewMode = AlbumPageViewMode.VIEW)} class="ws-select-bar">
    {#snippet leading()}
      {$t('select_album_cover')}
    {/snippet}
  </ControlAppBar>
{/if}

<style>
  ::placeholder {
    color: rgb(60, 60, 60);
    opacity: 0.6;
  }

  ::-ms-input-placeholder {
    /* Edge 12 -18 */
    color: white;
  }
</style>
