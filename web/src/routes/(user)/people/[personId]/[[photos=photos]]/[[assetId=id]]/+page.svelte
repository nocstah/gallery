<script lang="ts">
  import { scrollMemoryClearer } from '#lib/actions/scroll-memory.svelte.ts';
  import ActionMenuItem from '#lib/components/ActionMenuItem.svelte';
  import OnEvents from '#lib/components/OnEvents.svelte';
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import PersonBarTitle from '#lib/components/omarchy/PersonBarTitle.svelte';
  import ButtonContextMenu from '#lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '#lib/components/shared-components/context-menu/MenuOption.svelte';
  import AssetSelectControlBar from '#lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '#lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '#lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import ChangeDate from '#lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '#lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '#lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '#lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '#lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '#lib/components/timeline/actions/FavoriteAction.svelte';
  import SelectAllAssets from '#lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '#lib/components/timeline/actions/SetVisibilityAction.svelte';
  import { PersonPageViewMode, QueryParameter, SessionStorageKey } from '#lib/constants.ts';
  import { timelineGroupingProps } from '#lib/gallery/filtered-timeline/timeline-grouping.svelte.ts';
  import MoveToActions from '#lib/gallery/moves/MoveToActions.svelte';
  import { getMovePersonActions } from '#lib/gallery/moves/move-person-actions.ts';
  import MergeFaceSelector from '#lib/gallery/people/MergeFaceSelector.svelte';
  import PersonSuggestions from '#lib/gallery/people/PersonSuggestions.svelte';
  import {
    getPersonPageActions,
    getPersonTypeAction,
    isSpaceEditor,
    updatePersonName,
  } from '#lib/gallery/people/person.service.ts';
  import TimelinePhotoMenu from '#lib/gallery/photo-menu/TimelinePhotoMenu.svelte';
  import { getAllSpacesQuery } from '#lib/gallery/spaces/space.query.ts';
  import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
  import { assetViewerManager } from '#lib/managers/asset-viewer-manager.svelte.ts';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { featureFlagsManager } from '#lib/managers/feature-flags-manager.svelte.ts';
  import { thumbnailZoomManager } from '#lib/managers/thumbnail-zoom-manager.svelte.ts';
  import { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
  import type { TimelineAsset } from '#lib/managers/timeline-manager/types.ts';
  import PersonMergeSuggestionModal from '#lib/modals/PersonMergeSuggestionModal.svelte';
  import SearchAddAllToCollectionModal from '#lib/modals/SearchAddAllToCollectionModal.svelte';
  import { queryClient } from '#lib/queries/client.ts';
  import { Route } from '#lib/route.ts';
  import { getAssetBulkActions } from '#lib/services/asset.service.ts';
  import { getPersonActions, nameChangedDone } from '#lib/services/person.service.ts';
  import { lang, locale } from '#lib/stores/preferences.store.ts';
  import { websocketEvents } from '#lib/stores/websocket.ts';
  import { curatorIsMine } from '#lib/utils/curator.ts';
  import { getGlobalPersonThumbnailUrl } from '#lib/utils/global-person-route.ts';
  import { handleError } from '#lib/utils/handle-error.ts';
  import { personPhotoCount } from '#lib/utils/person-photo-count.ts';
  import { normalizeSearchString } from '#lib/utils/string-utils.ts';
  import { AssetVisibility, searchPerson, type PersonResponseDto } from '@immich/sdk';
  import {
    ActionButton,
    Button,
    CommandPaletteDefaultProvider,
    ContextMenuButton,
    IconButton,
    modalManager,
    type ActionItem,
  } from '@immich/ui';
  import { mdiAccountMultipleCheckOutline, mdiArrowLeft, mdiDotsVertical, mdiHeart, mdiHeartOutline } from '@mdi/js';
  import { createQuery } from '@tanstack/svelte-query';
  import { DateTime } from 'luxon';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { MediaQuery } from 'svelte/reactivity';
  import { goto, refreshAll } from '$app/navigation';
  import { page } from '$app/state';
  import type { PageData } from './$types';
  import UnmergeFaceSelector from './UnmergeFaceSelector.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let person = $derived(data.person);
  let thumbnailData = $derived(getScopedThumbnailUrl(person));

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const timelineGrouping = timelineGroupingProps(() => timelineManager);
  let totalMatchingAssets = $derived(
    timelineManager?.isInitialized ? timelineManager.ungroupedAssetCount : data.statistics.assets,
  );
  // Local Omarchy layer: the bar counts the photos it shows, a folded stack as its one photo (utils/person-photo-count)
  let shownAssets = $derived(timelineManager?.isInitialized ? timelineManager.assetCount : data.statistics.assets);
  const groupPersonStacks = $derived(curatorIsMine() && !thumbnailZoomManager.expandStacks);

  const handleAddAllToCollection = () => {
    void modalManager.show(SearchAddAllToCollectionModal, {
      terms: {
        visibility: AssetVisibility.Timeline,
        personIds: [data.person.filterId ?? data.person.id],
        withSharedSpaces: true,
      },
      total: totalMatchingAssets,
      smartSearchEnabled: false,
      language: $lang,
    });
  };
  const baseTimelineOptions = $derived({
    visibility: AssetVisibility.Timeline,
    personIds: [data.person.filterId ?? data.person.id],
    withPartners: true,
    withSharedSpaces: true,
  });
  const options = $derived({
    ...baseTimelineOptions,
    grouping: timelineGrouping.grouping,
    groupPersonStacks,
    personPhotoSearch: true,
  });

  let viewMode: PersonPageViewMode = $state(PersonPageViewMode.VIEW_ASSETS);
  let personMerge1: PersonResponseDto | undefined = $state();
  let personMerge2: PersonResponseDto | undefined = $state();
  let potentialMergePeople: PersonResponseDto[] = $state([]);
  let isSuggestionSelectedByUser = $state(false);

  let personName = $derived(person.name);

  function getScopedThumbnailUrl(person: PersonResponseDto, updatedAt?: string): string {
    return getGlobalPersonThumbnailUrl(person, { updatedAt });
  }

  onMount(() => {
    if (page.url.searchParams.get(QueryParameter.ACTION) === 'merge') {
      viewMode = PersonPageViewMode.MERGE_PEOPLE;
    }

    return websocketEvents.on('on_person_thumbnail', (personId: string) => {
      if (person.id === personId) {
        thumbnailData = getScopedThumbnailUrl(person, Date.now().toString());
      }
    });
  });

  // Local Omarchy layer: the person lives in the shell (2026-10-15). The back arrow, Escape and hiding the person go
  // up to People, as an album's go to its folder (upstream went back to wherever the page was opened from)
  const backToPeople = () => goto(Route.people());

  const handleEscape = async () => {
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }

    await backToPeople();
  };

  // ...the bar's description: how many photos (never "assets"), the faces where the server counts them, and the
  // birthday when it is known
  const birthday = (birthDate: string) =>
    DateTime.fromISO(birthDate).toLocaleString(
      { month: 'short', day: 'numeric', year: 'numeric' },
      { locale: $locale },
    );
  const personBarDescription = $derived(
    [
      ...personPhotoCount($t, shownAssets, totalMatchingAssets),
      featureFlagsManager.value.peopleStatistics ? $t('faces_count', { values: { count: data.statistics.faces } }) : '',
      person.birthDate ? $t('person_birthdate', { values: { date: birthday(person.birthDate) } }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );

  // ...and on a phone its tools fold into the ⋮ (the bar has room for Merge and the menu, not the heart too)
  const narrowBar = new MediaQuery('max-width: 767px');

  const updateAssetCount = async () => {
    await refreshAll();
  };

  const handleUnmerge = () => {
    timelineManager.removeAssets(assetMultiSelectManager.assets.map((a) => a.id));
    assetMultiSelectManager.clear();
    viewMode = PersonPageViewMode.VIEW_ASSETS;
  };

  const handleReassignAssets = () => {
    viewMode = PersonPageViewMode.UNASSIGN_ASSETS;
  };

  const handleMerge = async (person: PersonResponseDto) => {
    await updateAssetCount();
    await handleGoBack();

    data = { ...data, person };
  };

  const handleMergeSuggestion = async (): Promise<{ merged: boolean }> => {
    if (!personMerge1 || !personMerge2) {
      return { merged: false };
    }

    const result = await modalManager.show(PersonMergeSuggestionModal, {
      personToMerge: personMerge1,
      personToBeMergedInto: personMerge2,
      potentialMergePeople,
    });

    if (!result) {
      return { merged: false };
    }

    const [, personToBeMergedInto] = result;

    if (personToBeMergedInto.name !== personName && person.id === personToBeMergedInto.id) {
      await updateAssetCount();
      return { merged: true };
    }
    await goto(Route.viewPerson(personToBeMergedInto), { replaceState: true });
    return { merged: true };
  };

  const handleSuggestPeople = async (person2: PersonResponseDto) => {
    if (person.id !== person2.id) {
      potentialMergePeople = [];
      personMerge1 = person;
      personMerge2 = person2;
      isSuggestionSelectedByUser = true;

      await handleMergeSuggestion();
      // Local Omarchy layer: a person picked from the bar's name field only offers the merge; the next rename is a
      // rename again (left set, the flag swallowed it)
      isSuggestionSelectedByUser = false;
    }
  };

  const changeName = async () => {
    const before = person.name;
    viewMode = PersonPageViewMode.VIEW_ASSETS;
    person.name = personName;

    if (isSuggestionSelectedByUser) {
      // User canceled the merge
      isSuggestionSelectedByUser = false;
      return;
    }

    try {
      person = await updatePersonName(person, personName);
      // Local Omarchy layer: the toast gains an Undo, kept in the bar's undo history too (services/person)
      nameChangedDone($t, person, before);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const handleNameChange = async (name: string) => {
    potentialMergePeople = [];
    personName = name;

    if (person.name === personName) {
      return;
    }
    if (name === '') {
      await changeName();
      return;
    }

    const result = await searchPerson({ name: personName, withHidden: true, withSharedSpaces: true });

    const normalizedPersonName = normalizeSearchString(personName);
    const existingPerson = result.find(
      ({ name, id }: PersonResponseDto) =>
        normalizeSearchString(name) === normalizedPersonName && id !== person.id && name,
    );
    if (existingPerson) {
      personMerge2 = existingPerson;
      personMerge1 = person;
      potentialMergePeople = result
        .filter(
          (person: PersonResponseDto) =>
            normalizeSearchString(personMerge2?.name ?? '') === normalizeSearchString(person.name) &&
            person.id !== personMerge2?.id &&
            person.id !== personMerge1?.id &&
            !person.isHidden,
        )
        .slice(0, 3);
      const { merged } = await handleMergeSuggestion();
      if (merged) {
        return;
      }
    }
    await changeName();
  };

  const handleGoBack = async () => {
    viewMode = PersonPageViewMode.VIEW_ASSETS;
    if (page.url.searchParams.has(QueryParameter.ACTION)) {
      const url = new URL(page.url.href);
      url.searchParams.delete(QueryParameter.ACTION);
      await goto(url);
    }
  };

  const handleDeleteAssets = async (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    await updateAssetCount();
  };

  const handleUndoDeleteAssets = async (assets: TimelineAsset[]) => {
    timelineManager.upsertAssets(assets);
    await updateAssetCount();
  };

  // Space-person writes need the owner/editor role, read from the spaces list; offered until it says
  // otherwise (the server enforces the role on every write regardless).
  const personSpaceId = $derived(
    person.primaryProfile?.type === 'space-person' ? person.primaryProfile.spaceId : undefined,
  );
  const spacesQuery = createQuery(
    () => ({ ...getAllSpacesQuery(), enabled: !!personSpaceId }),
    () => queryClient,
  );
  const canEditSpacePerson = $derived(
    !personSpaceId || isSpaceEditor(spacesQuery.data, personSpaceId, authManager.user.id),
  );

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  const onPersonUpdate = async (response: PersonResponseDto) => {
    if (response.id !== person.id) {
      return;
    }

    if (response.isHidden) {
      await backToPeople();
      return;
    }

    person = response;
  };

  const handlePersonAssetDelete = async ({ id, assetId }: { id: string; assetId: string }) => {
    if (id !== person.id) {
      return;
    }
    timelineManager.removeAssets([assetId]);
    await updateAssetCount();
  };

  const { SetDateOfBirth, Favorite, Unfavorite, HidePerson, ShowPerson } = $derived(
    getPersonActions($t, person, { canEditSpacePerson }),
  );
  const refreshThumbnail = () => (thumbnailData = getScopedThumbnailUrl(person, Date.now().toString()));
  const { SelectRepresentativeFace, SeparateFromGroupedPerson } = getPersonPageActions($t, {
    getPerson: () => person,
    canEditSpacePerson: () => canEditSpacePerson,
    onPersonUpdate: (updated) => (person = updated),
    onThumbnailUpdate: refreshThumbnail,
  });
  const ChangePersonType = $derived(getPersonTypeAction($t, person, refreshAll));

  const Merge: ActionItem = {
    title: $t('merge_people'),
    icon: mdiAccountMultipleCheckOutline,
    $if: () => canEditSpacePerson,
    onAction: () => {
      viewMode = PersonPageViewMode.MERGE_PEOPLE;
    },
    shortcuts: { key: 'm' },
  };

  // Local Omarchy layer: the bar's own buttons are Merge (labelled) and the heart; the ⋮ holds the rest, and on a phone
  // the heart too
  const FavoriteToggle = $derived(person.isFavorite ? Unfavorite : Favorite);
  const menuItems = $derived([
    ...(narrowBar.current ? [Favorite, Unfavorite] : []),
    SelectRepresentativeFace,
    SetDateOfBirth,
    HidePerson,
    ShowPerson,
    SeparateFromGroupedPerson,
    ChangePersonType,
    ...getMovePersonActions($t, person),
  ]);

  const personActionsEnabled = $derived(!assetViewerManager.isViewing && !assetMultiSelectManager.selectionActive);
</script>

<OnEvents
  {onPersonUpdate}
  onPersonAssetDelete={handlePersonAssetDelete}
  onAssetsDelete={updateAssetCount}
  onAssetsArchive={updateAssetCount}
  onAssetsUnarchive={updateAssetCount}
/>
<CommandPaletteDefaultProvider
  name={$t('person')}
  actions={personActionsEnabled
    ? [SelectRepresentativeFace, SetDateOfBirth, HidePerson, ShowPerson, Merge, Favorite, Unfavorite]
    : []}
/>

{#snippet personBarLeading()}
  <IconButton
    shape="round"
    variant="ghost"
    color="secondary"
    icon={mdiArrowLeft}
    aria-label={$t('back')}
    class="shrink-0"
    onclick={() => backToPeople()}
  />
  <PersonBarTitle
    {person}
    thumbnailUrl={thumbnailData}
    editable={canEditSpacePerson}
    onRename={handleNameChange}
    onPick={handleSuggestPeople}
  />
{/snippet}

{#snippet personBarButtons()}
  {#if Merge.$if?.() ?? true}
    <Button
      leadingIcon={Merge.icon}
      variant="ghost"
      size="small"
      color="secondary"
      onclick={(event: MouseEvent) => Merge.onAction({ event, action: Merge })}
      aria-label={Merge.title}
    >
      <span class="ws-action-label">{Merge.title}</span>
    </Button>
  {/if}
  {#if !narrowBar.current && (FavoriteToggle.$if?.() ?? true)}
    <IconButton
      shape="round"
      variant="ghost"
      color="secondary"
      icon={person.isFavorite ? mdiHeart : mdiHeartOutline}
      aria-label={FavoriteToggle.title}
      aria-pressed={!!person.isFavorite}
      onclick={(event: MouseEvent) => FavoriteToggle.onAction({ event, action: FavoriteToggle })}
    />
  {/if}
  <ContextMenuButton items={menuItems} color="secondary" aria-label={$t('menu')} />
{/snippet}

<!-- Local Omarchy layer: the person lives in the shell like every page (2026-10-15): the sidebar stays, and the one bar
     carries the back arrow to People, their face and name (renamed in place), how many photos and their birthday, and
     the page's own buttons, Merge first. Selecting, merging and fixing a match swap the bar for theirs (below the shell) -->
<UserPageLayout
  hideNavbar={assetMultiSelectManager.selectionActive || viewMode !== PersonPageViewMode.VIEW_ASSETS}
  barFitsNavbar
  scrollbar={false}
  description={personBarDescription}
  leading={personBarLeading}
  buttons={personBarButtons}
>
  <div
    class="flex h-full flex-col overflow-hidden"
    data-testid="person-page"
    {@attach scrollMemoryClearer({
      routeStartsWith: Route.people(),
      beforeClear: () => {
        sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      },
    })}
  >
    <!-- Sticky grouping switcher: lives outside the scrolling timeline so it stays visible (see Tags); on the page's
         gutter, as the album's toolbar row -->
    <TimelineRouteGroupingBar
      {...timelineGrouping.barProps}
      hidden={assetMultiSelectManager.selectionActive || viewMode !== PersonPageViewMode.VIEW_ASSETS}
      class="ps-0"
      resultCount={totalMatchingAssets}
      onAddAllToCollection={handleAddAllToCollection}
    />
    <div class="relative min-h-0 flex-1">
      {#key person.id}
        <!-- Local Omarchy layer: the person's timeline ends where it begins (TimelineBeginning), as Photos does -->
        <Timeline
          beginning
          enableRouting={true}
          {person}
          bind:timelineManager
          {options}
          withStacked={groupPersonStacks}
          assetInteraction={assetMultiSelectManager}
          onEscape={handleEscape}
          {...timelineGrouping.timelineProps}
        >
          {#if viewMode === PersonPageViewMode.VIEW_ASSETS}
            <!-- Local Omarchy layer: the person's details under the bar, scrolling away with the photos: the faces
                 found that could be them (their name, count and birthday are in the bar). PersonSuggestions shows
                 its banner only to those who can edit the person (canEditSpacePerson) -->
            <section class="ws-person-details" data-testid="person-details">
              <PersonSuggestions {person} {canEditSpacePerson} {thumbnailData} onConfirmed={refreshThumbnail} />
            </section>
          {/if}
        </Timeline>
      {/key}
    </div>
  </div>
</UserPageLayout>

<!-- Local Omarchy layer: right-click menu on the person's photos, acting on the selection like the bar below
     (gallery/photo-menu) -->
{#if viewMode === PersonPageViewMode.VIEW_ASSETS}
  <TimelinePhotoMenu
    page="person"
    {timelineManager}
    reveal
    downloadName={person.name || 'immich'}
    {person}
    onFixMatch={handleReassignAssets}
    onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
    onArchive={(ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))}
    onVisibilitySet={handleSetVisibility}
    onAssetDelete={(assetIds) => handleDeleteAssets(assetIds)}
    onUndoDelete={(assets) => handleUndoDeleteAssets(assets)}
  />
{/if}

<!-- Local Omarchy layer: selecting swaps the bar for its own, after the shell as on Photos -->
{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {const Actions = $derived(getAssetBulkActions($t))}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
    <ActionButton action={Actions.CreateSharedLink} />
    <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
    <!-- Local Omarchy layer: Add to album by its name, the ink primary, as on Photos -->
    <span class="ws-primary-action ws-select-labelled contents"
      ><ActionButton action={Actions.AddToAlbum} type="button" /></span
    >
    <FavoriteAction
      removeFavorite={assetMultiSelectManager.isAllFavorite}
      onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
    />
    <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
      <DownloadAction menuItem filename={person.name || 'immich'} />
      <MenuOption
        icon={mdiAccountMultipleCheckOutline}
        text={$t('fix_incorrect_match')}
        onClick={handleReassignAssets}
      />
      <ChangeDate menuItem />
      <ChangeDescription menuItem />
      <ChangeLocation menuItem />
      <MoveToActions menuItem {person} />
      <ActionMenuItem action={Actions.Archive} />
      <ActionMenuItem action={Actions.Unarchive} />
      <ActionMenuItem action={Actions.Tag} />
      <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
      <DeleteAssets
        menuItem
        onAssetDelete={(assetIds) => handleDeleteAssets(assetIds)}
        onUndoDelete={(assets) => handleUndoDeleteAssets(assets)}
      />
    </ButtonContextMenu>
  </AssetSelectControlBar>
{/if}

{#if viewMode === PersonPageViewMode.UNASSIGN_ASSETS}
  <UnmergeFaceSelector
    assetIds={assetMultiSelectManager.assets.map((a) => a.id)}
    personAssets={person}
    onClose={() => (viewMode = PersonPageViewMode.VIEW_ASSETS)}
    onConfirm={handleUnmerge}
  />
{/if}

{#if viewMode === PersonPageViewMode.MERGE_PEOPLE}
  <MergeFaceSelector {person} onBack={handleGoBack} onMerge={handleMerge} />
{/if}

<style>
  /* Local Omarchy layer: the person's details under the bar, on the album page's rhythm (0.5rem between parts, 1rem
     before the photos), and nothing at all when there is nothing to say */
  .ws-person-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0 0 1rem;
  }
  .ws-person-details:not(:has(*)) {
    display: none;
  }
  /* the faces found that could be them, as one calm row on the gutter instead of a card (styled through the banner's
     own hooks, which the space person page shares): the person's face and the question, the count in data type, the
     candidates as small round faces, Review in ink and Not now as a quiet word; a narrow screen wraps it */
  .ws-person-details :global([data-testid='person-suggestion-banner']) {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.25rem;
    max-width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
  }
  .ws-person-details :global([data-testid='person-suggestion-banner'] > :first-child) {
    gap: 0.75rem;
  }
  .ws-person-details :global([data-testid='suggestion-banner-reference']) {
    width: 1.75rem;
    height: 1.75rem;
  }
  .ws-person-details :global([data-testid='suggestion-banner-reference'] + p) {
    font-size: var(--ws-text-ui);
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .ws-person-details :global([data-testid='person-suggestion-banner'] > :first-child > p) {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-person-details :global([data-testid='person-suggestion-banner'] :has(> [data-testid='face-crop'])) {
    width: 2.5rem;
  }
  .ws-person-details :global([data-testid='person-suggestion-banner'] :has(> div > [data-testid='face-crop'])) {
    gap: 0.25rem;
  }
  /* a face stays round */
  .ws-person-details :global([data-testid='face-crop']) {
    border-radius: 9999px;
  }
  .ws-person-details :global([data-testid='suggestion-snooze-btn']) {
    background: transparent;
    color: var(--immich-ui-muted);
  }
  .ws-person-details :global([data-testid='suggestion-snooze-btn']:hover) {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    color: var(--immich-ui-dark);
  }
</style>
