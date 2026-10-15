<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import PersonBarTitle from '$lib/components/omarchy/PersonBarTitle.svelte';
  import PeopleMergeSelector from '$lib/components/people/people-merge-selector.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '$lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import SearchAddAllToCollectionModal from '$lib/modals/SearchAddAllToCollectionModal.svelte';
  import { PersonPageViewMode, QueryParameter, SessionStorageKey } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset, TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import PersonMergeSuggestionModal from '$lib/modals/PersonMergeSuggestionModal.svelte';
  import PersonSuggestionBanner from '$lib/components/faces-page/person-suggestion-banner.svelte';
  import PersonSuggestionReviewModal from '$lib/modals/PersonSuggestionReviewModal.svelte';
  import RepresentativeFacePickerModal from '$lib/modals/RepresentativeFacePickerModal.svelte';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import {
    getPersonActions,
    getPersonFacesPage,
    getPersonFaceThumbnail,
    isSpaceEditor,
    nameChangedDone,
    updatePersonName,
    updatePersonRepresentativeFace,
  } from '$lib/services/person.service';
  import { lang, locale } from '$lib/stores/preferences.store';
  import { loadSpaces, userInteraction } from '$lib/stores/user.svelte';
  import { websocketEvents } from '$lib/stores/websocket';
  import { getGlobalPersonThumbnailUrl } from '$lib/utils/global-person-route';
  import {
    createCrossOwnerMergeHandlers,
    runMergeWithCrossOwnerConfirmation,
    runScopedMergeWithCrossOwnerConfirmation,
  } from '$lib/utils/cross-owner-merge';
  import { handleError } from '$lib/utils/handle-error';
  import { isSpaceScopedPerson, toScopedPersonRef } from '$lib/utils/scoped-person-ref';
  import { normalizeSearchString } from '$lib/utils/string-utils';
  import { getTimelineBucketZoomTarget, type ActivatableTimelineBucket } from '$lib/utils/timeline-zoom-navigation';
  import { getTimelineTopVisibleAnchor } from '$lib/managers/timeline-manager/timeline-anchor';

  import {
    AssetVisibility,
    confirmPersonFaceSuggestion,
    confirmSpacePersonFaceSuggestion,
    detachScopedPerson,
    dismissPersonFaceSuggestion,
    dismissSpacePersonFaceSuggestion,
    getAllPeople,
    getPersonFaceSuggestions,
    getPerson,
    getSpacePersonFaceSuggestions,
    ignorePersonFaceSuggestion,
    ignoreSpacePersonFaceSuggestion,
    mergePersonLegacy,
    searchPerson,
    Type2 as ScopedPersonProfileType,
    type BulkIdResponseDto,
    type PersonFaceResponseDto,
    type PersonFaceSuggestionResponseDto,
    type PersonResponseDto,
  } from '@immich/sdk';
  import {
    ActionButton,
    Button,
    CommandPaletteDefaultProvider,
    ContextMenuButton,
    IconButton,
    modalManager,
    toastManager,
    type ActionItem,
  } from '@immich/ui';
  import {
    mdiAccountBoxOutline,
    mdiAccountMultipleCheckOutline,
    mdiArrowLeft,
    mdiDotsVertical,
    mdiHeart,
    mdiHeartOutline,
  } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import UnmergeFaceSelector from './UnmergeFaceSelector.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let person = $derived(data.person);
  let thumbnailData = $derived(getScopedThumbnailUrl(person));

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  let timelineGrouping = $state<TimelineGrouping>('day');
  let temporalAnchor = $state<TimelineTemporalAnchor | undefined>();
  let numberOfAssets = $derived(timelineManager?.isInitialized ? timelineManager.assetCount : data.statistics.assets);

  const handleAddAllToCollection = () => {
    void modalManager.show(SearchAddAllToCollectionModal, {
      terms: {
        visibility: AssetVisibility.Timeline,
        personIds: [data.person.filterId ?? data.person.id],
        withSharedSpaces: true,
      },
      total: numberOfAssets,
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
    grouping: timelineGrouping,
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
    if ($page.url.searchParams.get(QueryParameter.ACTION) === 'merge') {
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
      $t('cmdk_preview_photo_count', { values: { count: numberOfAssets } }),
      featureFlagsManager.value.peopleStatistics ? $t('faces_count', { values: { count: data.statistics.faces } }) : '',
      person.birthDate ? $t('person_birthdate', { values: { date: birthday(person.birthDate) } }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );

  // ...and on a phone its tools fold into the ⋮ (the bar has room for Merge and the menu, not the heart too)
  const narrowBar = new MediaQuery('max-width: 767px');

  const updateAssetCount = async () => {
    await invalidateAll();
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

  const getMergeDisplayName = (person: PersonResponseDto) => person.name;

  const loadMergePeople = async (sortFaces: boolean, person: PersonResponseDto) => {
    const data = await getAllPeople({
      withHidden: false,
      withSharedSpaces: true,
      closestPersonId: sortFaces ? person.id : undefined,
    });
    return data.people;
  };

  // Runs a scoped merge, transparently handling the cross-owner boundary (issue #733):
  // - a descriptive `blocked` error is shown as a clean toast (never the raw server string);
  // - a `confirmationRequired` response prompts a strong confirmation, then re-runs with the
  //   acknowledgement so the server commits the cross-owner merge.
  // Returns the number of merged people, or `undefined` when nothing was merged (blocked/declined).
  const mergeScopedPeopleWithCrossOwnerConfirmation = async (
    targetPerson: PersonResponseDto,
    sourcePeople: PersonResponseDto[],
  ): Promise<number | undefined> => {
    const committed = await runScopedMergeWithCrossOwnerConfirmation(
      {
        target: toScopedPersonRef(targetPerson),
        sources: sourcePeople.map((sourcePerson) => toScopedPersonRef(sourcePerson)),
      },
      createCrossOwnerMergeHandlers(),
    );
    return committed ? sourcePeople.length : undefined;
  };

  // Same as above, for the classic `POST /people/:id/merge` endpoint, which can now also 403/409
  // across an owner boundary. Returns the number of *successfully* merged sources (mirroring the
  // per-id BulkIdResponseDto results), or `undefined` when nothing was merged (blocked/declined).
  const mergePersonWithCrossOwnerConfirmation = async (
    targetPerson: PersonResponseDto,
    sourcePeople: PersonResponseDto[],
  ): Promise<number | undefined> => {
    let results: BulkIdResponseDto[] = [];
    const committed = await runMergeWithCrossOwnerConfirmation(async (confirmCrossOwner) => {
      results = await mergePersonLegacy({
        id: targetPerson.id,
        mergePersonDto: confirmCrossOwner
          ? { ids: sourcePeople.map(({ id }) => id), confirmCrossOwner: true }
          : { ids: sourcePeople.map(({ id }) => id) },
      });
    }, createCrossOwnerMergeHandlers());
    return committed ? results.filter(({ success }) => success).length : undefined;
  };

  const mergePeople = async (targetCandidate: PersonResponseDto, selectedPeople: PersonResponseDto[]) => {
    const targetPerson = person;
    const sourcePeople =
      targetCandidate.id === targetPerson.id
        ? selectedPeople
        : [targetCandidate, ...selectedPeople.filter((selectedPerson) => selectedPerson.id !== targetPerson.id)];
    const usesScopedRepair =
      isSpaceScopedPerson(targetPerson) || sourcePeople.some((sourcePerson) => isSpaceScopedPerson(sourcePerson));

    const mergedCount = usesScopedRepair
      ? await mergeScopedPeopleWithCrossOwnerConfirmation(targetPerson, sourcePeople)
      : await mergePersonWithCrossOwnerConfirmation(targetPerson, sourcePeople);

    if (mergedCount === undefined) {
      // Cross-owner merge was blocked or the user declined the confirmation — nothing merged.
      return;
    }

    const mergedPerson = await getPerson({ id: targetPerson.id });
    toastManager.primary($t('merged_people_count', { values: { count: mergedCount } }));
    return mergedPerson;
  };

  const handleSwapMergePerson = async (person: PersonResponseDto) => {
    const profile = person.primaryProfile;
    if (profile?.type === 'space-person' && profile.spaceId) {
      await goto(
        Route.viewSpacePerson(profile.spaceId, profile.id, { previousRoute: Route.people(), action: 'merge' }),
      );
      return;
    }

    await goto(Route.viewPerson(person, { previousRoute: Route.people(), action: 'merge' }));
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

    const result = await searchPerson({ name: personName, withHidden: true });

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
    if ($page.url.searchParams.has(QueryParameter.ACTION)) {
      $page.url.searchParams.delete(QueryParameter.ACTION);
      await goto($page.url);
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
  $effect(() => {
    if (personSpaceId) {
      loadSpaces();
    }
  });
  const canEditSpacePerson = $derived(
    !personSpaceId || isSpaceEditor(userInteraction.recentSpaces, personSpaceId, authManager.user.id),
  );

  let suggestionTotal = $state(0);
  let suggestionPreviews = $state<PersonFaceSuggestionResponseDto[]>([]);

  type SuggestionTarget = { type: 'person'; personId: string } | { type: 'space'; spaceId: string; personId: string };

  /**
   * A space member who holds no person row for this identity reaches the shared person through this
   * (global) route from the main People list — their primary profile IS the space profile, and the
   * owner-only person endpoints do not know that id. Route those reads and verdicts at the shared
   * space endpoints instead, so suggestions are not a /spaces-only affordance. The server returns an
   * empty page to members below editor, which keeps the banner hidden for viewers.
   */
  const getSuggestionTarget = (target: PersonResponseDto): SuggestionTarget => {
    const profile = target.primaryProfile;
    return profile?.type === 'space-person' && profile.spaceId
      ? { type: 'space', spaceId: profile.spaceId, personId: profile.id }
      : { type: 'person', personId: target.id };
  };

  const fetchSuggestions = (target: SuggestionTarget, page: number, size: number) =>
    target.type === 'space'
      ? getSpacePersonFaceSuggestions({ id: target.spaceId, personId: target.personId, page, size })
      : getPersonFaceSuggestions({ id: target.personId, page, size });

  // F24/S11b: the four action endpoints answer 200 with `{ acted }` — the acted/no-op signal is in the body
  // precisely because `oazapfts.ok()` resolves to the body and discards the status code for every 2xx, so a
  // 200-vs-204 contract could never reach a caller. These pass straight through to the modal; a genuine
  // 4xx/5xx still rejects into its handleError path.
  const confirmSuggestion = (target: SuggestionTarget, assetFaceId: string) =>
    target.type === 'space'
      ? confirmSpacePersonFaceSuggestion({ id: target.spaceId, personId: target.personId, assetFaceId })
      : confirmPersonFaceSuggestion({ id: target.personId, assetFaceId });

  const dismissSuggestion = (target: SuggestionTarget, assetFaceId: string) =>
    target.type === 'space'
      ? dismissSpacePersonFaceSuggestion({ id: target.spaceId, personId: target.personId, assetFaceId })
      : dismissPersonFaceSuggestion({ id: target.personId, assetFaceId });

  const ignoreSuggestion = (target: SuggestionTarget, assetFaceId: string) =>
    target.type === 'space'
      ? ignoreSpacePersonFaceSuggestion({ id: target.spaceId, personId: target.personId, assetFaceId })
      : ignorePersonFaceSuggestion({ id: target.personId, assetFaceId });

  const loadSuggestionSummary = async (currentPerson: PersonResponseDto) => {
    try {
      const res = await fetchSuggestions(getSuggestionTarget(currentPerson), 1, 5);
      if (currentPerson.id !== person.id) {
        return;
      }
      suggestionTotal = res.total;
      suggestionPreviews = res.items;
    } catch {
      if (currentPerson.id !== person.id) {
        return;
      }
      suggestionTotal = 0;
      suggestionPreviews = [];
    }
  };

  const openSuggestionReview = async () => {
    const currentPerson = person;
    const currentTarget = getSuggestionTarget(currentPerson);
    const currentThumbnailUrl = getScopedThumbnailUrl(currentPerson);

    const result = await modalManager.show(PersonSuggestionReviewModal, {
      person: currentPerson,
      referenceThumbnailUrl: currentThumbnailUrl,
      loadPage: ({ page, size }: { page: number; size: number }) => fetchSuggestions(currentTarget, page, size),
      confirm: (assetFaceId: string) => confirmSuggestion(currentTarget, assetFaceId),
      dismiss: (assetFaceId: string) => dismissSuggestion(currentTarget, assetFaceId),
      ignore: (assetFaceId: string) => ignoreSuggestion(currentTarget, assetFaceId),
    });
    await loadSuggestionSummary(currentPerson);
    if (result && result.confirmed > 0) {
      await invalidateAll();
      thumbnailData = getScopedThumbnailUrl(person, Date.now().toString());
    }
  };

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  function handleTimelineGroupingChange(grouping: TimelineGrouping) {
    const anchor = getTimelineTopVisibleAnchor(timelineManager);
    timelineGrouping = grouping;
    temporalAnchor = anchor;
  }

  function handleTimelineBucketActivate(bucket: ActivatableTimelineBucket) {
    if (assetMultiSelectManager.selectionActive) {
      return;
    }

    const result = getTimelineBucketZoomTarget(bucket);
    if (!result) {
      return;
    }

    timelineGrouping = result.grouping;
    temporalAnchor = result.anchor;
  }

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
  const SelectRepresentativeFace: ActionItem = {
    title: $t('select_representative_face'),
    icon: mdiAccountBoxOutline,
    $if: () => canEditSpacePerson,
    onAction: async () => {
      const updated = await modalManager.show(RepresentativeFacePickerModal, {
        title: $t('select_representative_face'),
        loadFaces: ({ page, size }: { page: number; size: number }) => getPersonFacesPage(person, { page, size }),
        updateFace: async (faceId: string) => {
          person = await updatePersonRepresentativeFace(person, faceId);
        },
        getThumbnailUrl: (face: PersonFaceResponseDto) => getPersonFaceThumbnail(person, face.id),
        canUpdate: true,
      });

      if (updated) {
        thumbnailData = getScopedThumbnailUrl(person, Date.now().toString());
      }
    },
  };

  const Merge: ActionItem = {
    title: $t('merge_people'),
    icon: mdiAccountMultipleCheckOutline,
    $if: () => canEditSpacePerson,
    onAction: () => {
      viewMode = PersonPageViewMode.MERGE_PEOPLE;
    },
  };

  const SeparateFromGroupedPerson: ActionItem = {
    title: $t('separate_from_grouped_person'),
    icon: mdiAccountMultipleCheckOutline,
    onAction: async () => {
      const isConfirm = await modalManager.showDialog({ prompt: $t('separate_from_grouped_person_prompt') });
      if (!isConfirm) {
        return;
      }

      try {
        await detachScopedPerson({
          detachScopedPersonDto: { profile: { type: ScopedPersonProfileType.Person, id: person.id } },
        });
        await invalidateAll();
        toastManager.primary($t('separate_from_grouped_person'));
      } catch (error) {
        handleError(error, $t('errors.unable_to_save_name'));
      }
    },
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
  ]);

  $effect(() => {
    const currentPerson = person;
    suggestionTotal = 0;
    suggestionPreviews = [];
    void loadSuggestionSummary(currentPerson);
  });
</script>

<OnEvents
  {onPersonUpdate}
  onPersonAssetDelete={handlePersonAssetDelete}
  onAssetsDelete={updateAssetCount}
  onAssetsArchive={updateAssetCount}
  onAssetsUnarchive={updateAssetCount}
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
    use:scrollMemoryClearer={{
      routeStartsWith: Route.people(),
      beforeClear: () => {
        sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      },
    }}
  >
    <!-- Sticky grouping switcher: lives outside the scrolling timeline so it stays visible (see Tags); on the page's
         gutter, as the album's toolbar row -->
    <TimelineRouteGroupingBar
      grouping={timelineGrouping}
      hidden={assetMultiSelectManager.selectionActive || viewMode !== PersonPageViewMode.VIEW_ASSETS}
      class="ps-0"
      resultCount={numberOfAssets}
      onGroupingChange={handleTimelineGroupingChange}
      onAddAllToCollection={handleAddAllToCollection}
    />
    <div class="relative min-h-0 flex-1">
      {#key person.id}
        <Timeline
          enableRouting={true}
          {person}
          bind:timelineManager
          {options}
          assetInteraction={assetMultiSelectManager}
          onEscape={handleEscape}
          {temporalAnchor}
          onTimelineBucketActivate={handleTimelineBucketActivate}
          onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
          grouping={timelineGrouping}
          onGroupingChange={handleTimelineGroupingChange}
        >
          <!-- Defence in depth, not the primary gate: the server already returns an empty page (`total: 0`)
               to space members below editor (loadSuggestionSummary/fetchSuggestions above), which is what
               actually keeps this hidden from viewers today. `canEditSpacePerson` is always true for a
               personal (non-space) person — only a space-scoped profile is role-gated. This client-side
               check exists so that a future relaxation of that read gate ("let viewers see what is
               pending") does not also silently expose the review action — it must be relaxed here
               explicitly, not by accident. -->
          {#if viewMode === PersonPageViewMode.VIEW_ASSETS && canEditSpacePerson}
            <!-- Local Omarchy layer: the person's details under the bar, scrolling away with the photos: the faces
                 found that could be them (their name, count and birthday are in the bar) -->
            <section class="ws-person-details" data-testid="person-details">
              <PersonSuggestionBanner
                {person}
                snoozeId={getSuggestionTarget(person).personId}
                total={suggestionTotal}
                previews={suggestionPreviews}
                referenceThumbnailUrl={thumbnailData}
                onReview={openSuggestionReview}
              />
            </section>
          {/if}
        </Timeline>
      {/key}
    </div>
  </div>
</UserPageLayout>

<!-- Local Omarchy layer: selecting swaps the bar for its own, after the shell as on Photos -->
{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {@const Actions = getAssetBulkActions($t)}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
    <ActionButton action={Actions.CreateSharedLink} />
    <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
    <ActionButton action={Actions.AddToAlbum} />
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
      <ArchiveAction
        menuItem
        unarchive={assetMultiSelectManager.isAllArchived}
        onArchive={(ids, visibility) =>
          timelineManager.update(ids, (asset) => {
            asset.visibility = visibility;
          })}
      />
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
  <PeopleMergeSelector
    {person}
    getDisplayName={getMergeDisplayName}
    getThumbnailUrl={getScopedThumbnailUrl}
    loadPeople={loadMergePeople}
    {mergePeople}
    searchPeople={(name) => searchPerson({ name, withHidden: true, withSharedSpaces: true })}
    onBack={handleGoBack}
    onMerge={handleMerge}
    onSwapPerson={handleSwapMergePerson}
  />
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
