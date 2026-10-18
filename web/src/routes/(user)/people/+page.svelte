<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import PeopleFaceStatisticsInfo from '$lib/components/people/people-face-statistics-info.svelte';
  import PeopleManagementGrid from '$lib/components/people/people-management-grid.svelte';
  import type { ManagedPerson } from '$lib/components/people/people-types';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import SearchPeople from '$lib/components/faces-page/PeopleSearch.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EmptyState from '$lib/components/omarchy/EmptyState.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import { PEOPLE_PAGE_SIZE, QueryParameter, SessionStorageKey } from '$lib/constants';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { personSpans } from '$lib/managers/person-spans.svelte';
  import PersonMergeSuggestionModal from '$lib/modals/PersonMergeSuggestionModal.svelte';
  import { Route } from '$lib/route';
  import { getPersonActions, isSpaceEditor, nameChangedDone, updatePersonName } from '$lib/services/person.service';
  import Dropdown from '$lib/elements/Dropdown.svelte';
  import { locale, PeopleFilterBy, PeopleSortBy, peopleViewSettings } from '$lib/stores/preferences.store';
  import { loadSpaces, userInteraction } from '$lib/stores/user.svelte';
  import { websocketEvents } from '$lib/stores/websocket';
  import { normalizeSearchString } from '$lib/utils/string-utils';
  import { handlePromiseError } from '$lib/utils';
  import { getGlobalPersonHref, getGlobalPersonThumbnailUrl } from '$lib/utils/global-person-route';
  import { handleError } from '$lib/utils/handle-error';
  import { clearQueryParam } from '$lib/utils/navigation';
  import { peopleFilterToTypeParam as filterToTypeParam, resolvePeopleFilterBy } from '$lib/utils/people-filter';
  import { appendUniqueById, sortPeople } from '$lib/utils/people-utils';
  import { isRepeatedName, personSpanLine, repeatedNames } from '$lib/utils/person-names';
  import { formatPeopleHeaderDescription } from '$lib/utils/people-statistics';
  import { placeYears } from '$lib/utils/place-stats';
  import {
    getAllPeople,
    getPeopleFaceStatistics,
    getPerson,
    searchPerson,
    updatePerson,
    type PersonResponseDto,
  } from '@immich/sdk';
  import { Button, modalManager, toastManager } from '@immich/ui';
  import {
    mdiAccountMultipleCheckOutline,
    mdiAccountOffOutline,
    mdiDotsVertical,
    mdiAccountGroupOutline,
    mdiAccountMultipleOutline,
    mdiPaw,
    mdiSortAlphabeticalAscending,
    mdiSortNumericDescending,
  } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let searchName = $state('');
  let newName = $state('');
  let currentPage = $state(1);
  let nextPage = $state(data.people.hasNextPage ? 2 : null);
  let personMerge1 = $state<PersonResponseDto>();
  let personMerge2 = $state<PersonResponseDto>();
  let potentialMergePeople: PersonResponseDto[] = $state([]);
  let editingPerson: PersonResponseDto | null = $state(null);
  let searchedPeopleLocal: PersonResponseDto[] = $state([]);
  let searchPeopleElement = $state<ReturnType<typeof SearchPeople>>();
  // The grid has two independent next-page triggers (the IntersectionObserver and the rAF sentinel
  // re-check), and both are gated on the `loading` prop below. Without it the same page is fetched
  // concurrently and appended twice.
  let loadingPage = $state(false);
  // Totals for the currently applied type filter. The overview-statistics endpoint is unfiltered, so
  // once a filter is active the header has to read the filtered list's own total instead, or it
  // reports the whole library above a filtered grid. `load` already applied the persisted filter, so
  // seed this from its response rather than leaving the header wrong until the first filter change.
  let listTotals = $state<{ total: number; hidden: number } | null>(data.peopleListTotals ?? null);

  onMount(() => {
    const getSearchedPeople = $page.url.searchParams.get(QueryParameter.SEARCHED_PEOPLE);
    if (getSearchedPeople) {
      searchName = getSearchedPeople;
      if (searchPeopleElement) {
        handlePromiseError(searchPeopleElement.searchPeople(true, searchName));
      }
    }

    return websocketEvents.on('on_person_thumbnail', (personId: string) => {
      for (const person of people) {
        if (person.id === personId) {
          person.updatedAt = new Date().toISOString();
        }
      }
    });
  });

  const loadInitialScroll = () =>
    new Promise<void>((resolve) => {
      // Load up to previously loaded page when returning.
      let newNextPage = sessionStorage.getItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      if (newNextPage && nextPage) {
        let startingPage = nextPage,
          pagesToLoad = Number.parseInt(newNextPage) - nextPage;

        if (pagesToLoad) {
          loadingPage = true;
          handlePromiseError(
            Promise.all(
              Array.from({ length: pagesToLoad }, (_, i) => {
                return getAllPeople({
                  withHidden: true,
                  withSharedSpaces: true,
                  page: startingPage + i,
                  size: PEOPLE_PAGE_SIZE,
                  // Restoring scroll must page over the SAME filtered list the first page came
                  // from; without this, returning to a filtered grid appends unfiltered people.
                  $type: filterToTypeParam(peopleFilterBy),
                });
              }),
            )
              .then((pages) => {
                for (const page of pages) {
                  people = appendUniqueById(people, page.people);
                }
                currentPage = startingPage + pagesToLoad - 1;
                nextPage = pages.at(-1)?.hasNextPage ? startingPage + pagesToLoad : null;
                resolve(); // wait until extra pages are loaded
              })
              .finally(() => {
                loadingPage = false;
              }),
          );
        } else {
          resolve();
        }
        sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      }
    });

  const loadNextPage = async () => {
    if (loadingPage || !nextPage) {
      return;
    }

    loadingPage = true;
    try {
      const { people: newPeople, hasNextPage } = await getAllPeople({
        withHidden: true,
        withSharedSpaces: true,
        page: nextPage,
        size: PEOPLE_PAGE_SIZE,
        $type: filterToTypeParam(peopleFilterBy),
      });
      people = appendUniqueById(people, newPeople);
      if (nextPage !== null) {
        currentPage = nextPage;
      }
      nextPage = hasNextPage ? nextPage + 1 : null;
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_people'));
    } finally {
      loadingPage = false;
    }
  };

  const handleSearch = async () => {
    const getSearchedPeople = $page.url.searchParams.get(QueryParameter.SEARCHED_PEOPLE);
    if (getSearchedPeople !== searchName) {
      $page.url.searchParams.set(QueryParameter.SEARCHED_PEOPLE, searchName);
      await goto($page.url, { keepFocus: true });
    }
  };

  const handleMerge = async () => {
    if (!editingPerson || !personMerge1 || !personMerge2) {
      return;
    }

    const response = await modalManager.show(PersonMergeSuggestionModal, {
      personToMerge: personMerge1,
      personToBeMergedInto: personMerge2,
      potentialMergePeople,
    });

    if (!response) {
      await updateName(personMerge1, newName);
      return;
    }

    const [personToMerge, personToBeMergedInto] = response;

    const mergedPerson = await getPerson({ id: personToBeMergedInto.id });

    people = people.filter((person: PersonResponseDto) => person.id !== personToMerge.id);
    people = people.map((person: PersonResponseDto) => (person.id === personToBeMergedInto.id ? mergedPerson : person));

    if (personToBeMergedInto.name !== newName && editingPerson.id === personToBeMergedInto.id) {
      /*
       *
       * If the user merges one of the suggested people into the person he's editing, it's merging the suggested person AND renames
       * the person he's editing
       *
       */
      try {
        await updatePerson({ id: personToBeMergedInto.id, personUpdateDto: { name: newName } });

        for (const person of people) {
          if (person.id === personToBeMergedInto.id) {
            person.name = newName;
            break;
          }
        }
        toastManager.primary($t('change_name_successfully'));
      } catch (error) {
        handleError(error, $t('errors.unable_to_save_name'));
      }
    }
  };

  const handleMergePeople = async (detail: PersonResponseDto) => {
    await goto(Route.viewPerson(detail, { previousRoute: Route.people(), action: 'merge' }));
  };

  const onResetSearchBar = async () => {
    await clearQueryParam(QueryParameter.SEARCHED_PEOPLE, $page.url);
  };

  let people = $derived(data.people.people);

  let visiblePeople = $derived(people.filter((people) => !people.isHidden));
  let overviewStatistics = $derived(data.peopleStatistics);
  let peopleCountStatistics = $derived(listTotals ?? overviewStatistics ?? data.people);
  let hasUnsupportedStatsFilter = $derived(
    !!$page.url.searchParams.get(QueryParameter.SEARCHED_PEOPLE) || !!searchName.trim(),
  );
  let countVisiblePeople = $derived(
    searchName ? searchedPeopleLocal.length : peopleCountStatistics.total - peopleCountStatistics.hidden,
  );
  let peopleStatisticsEnabled = $derived(featureFlagsManager.value.peopleStatistics);
  let headerDescription = $derived(
    formatPeopleHeaderDescription({
      visiblePeopleCount: countVisiblePeople,
      detectedFaceCount: overviewStatistics?.detectedFaceCount,
      locale: $locale,
      faceSingular: $t('face'),
      facePlural: $t('faces'),
      includeFaceCount: peopleStatisticsEnabled && !!overviewStatistics && !hasUnsupportedStatsFilter,
      showZeroPeople:
        hasUnsupportedStatsFilter || (peopleStatisticsEnabled && (overviewStatistics?.detectedFaceCount ?? 0) > 0),
    }),
  );
  let showFaceStatisticsInfo = $derived(
    peopleStatisticsEnabled && !!overviewStatistics && !hasUnsupportedStatsFilter && !!headerDescription,
  );
  let globalFaceStatisticsCacheKey = $derived(`user:${authManager.user.id}:global:people:withSharedSpaces=true`);
  const loadGlobalFaceStatistics = () => getPeopleFaceStatistics({ withSharedSpaces: true });
  const peopleSortOptions = [PeopleSortBy.PhotoCount, PeopleSortBy.Name];
  const peopleSortIcons: Record<PeopleSortBy, string> = {
    [PeopleSortBy.PhotoCount]: mdiSortNumericDescending,
    [PeopleSortBy.Name]: mdiSortAlphabeticalAscending,
  };
  let peopleSortByNames: Record<PeopleSortBy, string> = $derived({
    [PeopleSortBy.PhotoCount]: $t('sort_people_most_photos'),
    [PeopleSortBy.Name]: $t('name'),
  });
  let peopleSortBy = $derived(
    Object.values(PeopleSortBy).includes($peopleViewSettings.sortBy)
      ? $peopleViewSettings.sortBy
      : PeopleSortBy.PhotoCount,
  );
  let showPeople = $derived(sortPeople(searchName ? searchedPeopleLocal : visiblePeople, peopleSortBy));

  // Local Omarchy layer: where a name repeats among the people shown, each one's tile says how many photos they are in
  // and the years those span (utils/person-names, managers/person-spans), so two Daniels can be told apart; read-only
  let repeated = $derived(repeatedNames(showPeople));
  $effect(() => {
    personSpans.request(
      showPeople
        .filter((person) => isRepeatedName(repeated, person.name))
        .map((person) => ({ id: person.id, filterId: person.filterId })),
    );
  });
  const spanLine = (person: PersonResponseDto) =>
    isRepeatedName(repeated, person.name)
      ? personSpanLine(personSpans.get(person.id), person.numberOfAssets, $locale)
      : undefined;
  const accessibleNameOf = (person: PersonResponseDto) => {
    if (!isRepeatedName(repeated, person.name)) {
      return undefined;
    }
    const span = personSpans.get(person.id);
    if (span && span.count > 0) {
      return $t('person_tile_label', {
        values: { name: person.name, count: span.count, years: placeYears(span) },
      });
    }
    return person.numberOfAssets === undefined
      ? undefined
      : $t('person_tile_label_count', { values: { name: person.name, count: person.numberOfAssets } });
  };

  // People-page type filter. Server-side rather than a filter over `people`: the grid is paged
  // (PEOPLE_PAGE_SIZE at a time) and pets are a small fraction of a real library, so filtering only
  // what has been loaded would show a near-empty grid until you scrolled to the very end.
  const peopleFilterOptions = [PeopleFilterBy.All, PeopleFilterBy.People, PeopleFilterBy.Pets];
  const peopleFilterIcons: Record<PeopleFilterBy, string> = {
    [PeopleFilterBy.All]: mdiAccountGroupOutline,
    [PeopleFilterBy.People]: mdiAccountMultipleOutline,
    [PeopleFilterBy.Pets]: mdiPaw,
  };
  let peopleFilterNames: Record<PeopleFilterBy, string> = $derived({
    [PeopleFilterBy.All]: $t('all'),
    [PeopleFilterBy.People]: $t('people'),
    [PeopleFilterBy.Pets]: $t('pets'),
  });
  let peopleFilterBy = $derived(resolvePeopleFilterBy($peopleViewSettings.filterBy));
  // A type filter that matches nothing — Pets after a pet-detection reset, say — legitimately
  // empties `people` without meaning the library has none. Gating the toolbar on the loaded rows
  // alone takes the filter dropdown down with them, stranding the user on the empty view with no
  // control to get back to All.
  let hasPeopleControls = $derived(people.length > 0 || peopleFilterBy !== PeopleFilterBy.All);

  const handleFilterChange = async (filterBy: PeopleFilterBy) => {
    $peopleViewSettings.filterBy = filterBy;
    loadingPage = true;
    try {
      const result = await getAllPeople({
        withHidden: true,
        withSharedSpaces: true,
        page: 1,
        size: PEOPLE_PAGE_SIZE,
        $type: filterToTypeParam(filterBy),
      });
      people = result.people;
      listTotals = { total: result.total, hidden: result.hidden };
      currentPage = 1;
      nextPage = result.hasNextPage ? 2 : null;
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_people'));
    } finally {
      loadingPage = false;
    }
  };

  // Local Omarchy layer: an empty People page says why it is empty, in the Empty State's grammar (DESIGN.md, People).
  // "No people" under an empty Pets filter reads as a claim about the whole library, which is exactly backwards: the
  // library still has people, it just has no pets; and a library whose people are all hidden is not empty either.
  const showAndHide = $derived({ label: $t('show_and_hide_people'), href: '/people/manage' });
  let emptyState = $derived.by(() => {
    if (searchName) {
      return {
        title: $t('search_no_people_named', { values: { name: searchName } }),
        body: $t('people_search_none_body'),
        link: showAndHide,
      };
    }
    if (peopleFilterBy !== PeopleFilterBy.All) {
      const pets = peopleFilterBy === PeopleFilterBy.Pets;
      return {
        title: $t(pets ? 'search_no_pets' : 'search_no_people'),
        body: $t(pets ? 'people_no_pets_body' : 'timeline_empty_filtered_subtitle'),
        action: {
          label: $t('timeline_empty_clear_filters'),
          onclick: () => handlePromiseError(handleFilterChange(PeopleFilterBy.All)),
        },
      };
    }
    if (peopleCountStatistics.hidden > 0) {
      return { title: $t('people_all_hidden_title'), body: $t('people_all_hidden_body'), link: showAndHide };
    }
    return { title: $t('people_empty_title'), body: $t('people_empty_body') };
  });

  const getPersonHref = (person: PersonResponseDto) => getGlobalPersonHref(person, Route.people());

  const getPersonThumbnail = (person: PersonResponseDto) => getGlobalPersonThumbnailUrl(person);

  const isPersonalPrimary = (person: PersonResponseDto) =>
    !person.primaryProfile || person.primaryProfile.type === 'user-person';
  const isSpacePrimary = (person: PersonResponseDto) =>
    person.primaryProfile?.type === 'space-person' && !!person.primaryProfile.spaceId;

  // Space-person renames need the owner/editor role, read from the spaces list; rows stay editable
  // until it says otherwise (the server enforces the role regardless).
  $effect(() => {
    if (people.some((person) => isSpacePrimary(person))) {
      loadSpaces();
    }
  });
  const canEditSpacePerson = (person: PersonResponseDto) => {
    const spaceId = person.primaryProfile?.type === 'space-person' ? person.primaryProfile.spaceId : undefined;
    return !spaceId || isSpaceEditor(userInteraction.recentSpaces, spaceId, authManager.user.id);
  };
  const canEditName = (person: PersonResponseDto) =>
    isPersonalPrimary(person) || (isSpacePrimary(person) && canEditSpacePerson(person));

  const toManagedPerson = (person: PersonResponseDto): ManagedPerson => ({
    id: person.id,
    displayName: person.name,
    canonicalName: person.name,
    thumbnailUrl: getPersonThumbnail(person),
    href: getPersonHref(person),
    isHidden: person.isHidden,
    isFavorite: person.isFavorite,
    type: person.type,
    species: person.species,
    assetCount: person.numberOfAssets,
    canEditPersonalProfile: isPersonalPrimary(person),
    accessibleName: accessibleNameOf(person),
  });

  const onNameChangeSubmit = async (name: string, targetPerson: PersonResponseDto) => {
    editingPerson = targetPerson;
    newName = name;
    try {
      if (name === targetPerson.name) {
        return;
      }

      if (!isPersonalPrimary(targetPerson)) {
        await updateName(targetPerson, name);
        return;
      }

      if (name === '') {
        await updateName(targetPerson, '');
        return;
      }

      const personWithSimilarName = await findPeopleWithSimilarName(name, targetPerson.id);
      if (personWithSimilarName) {
        personMerge1 = targetPerson;
        personMerge2 = personWithSimilarName;
        potentialMergePeople = people
          .filter(
            (person: PersonResponseDto) =>
              normalizeSearchString(personMerge2?.name ?? '') === normalizeSearchString(person.name) &&
              person.id !== personMerge2?.id &&
              person.id !== personMerge1?.id &&
              !person.isHidden,
          )
          .slice(0, 3);
        await handleMerge();
        return;
      }
      await updateName(targetPerson, name);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const updateName = async (targetPerson: PersonResponseDto, name: string) => {
    const updatedPerson = await updatePersonName(targetPerson, name);
    people = people.map((person: PersonResponseDto) => (person.id === targetPerson.id ? updatedPerson : person));
    newName = '';
    // Local Omarchy layer: a toast with an Undo, kept in the bar's undo history too (services/person)
    nameChangedDone($t, updatedPerson, targetPerson.name);
  };

  const findPeopleWithSimilarName = async (name: string, personId: string) => {
    const searchResult = await searchPerson({ name, withHidden: true });
    const normalizedName = normalizeSearchString(name);
    return searchResult.find(
      (person) => normalizeSearchString(person.name) === normalizedName && person.id !== personId && person.name,
    );
  };

  const onPersonUpdate = (response: PersonResponseDto) => {
    people = people.map((person: PersonResponseDto) => {
      if (person.id === response.id) {
        return response;
      }
      return person;
    });
  };
</script>

<OnEvents {onPersonUpdate} />

<UserPageLayout
  title={$t('people')}
  description={headerDescription}
  use={[
    [
      scrollMemory,
      {
        routeStartsWith: Route.people(),
        beforeSave: () => {
          if (currentPage) {
            sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, currentPage.toString());
          }
        },
        beforeClear: () => {
          sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
        },
        beforeLoad: loadInitialScroll,
      },
    ],
  ]}
>
  {#snippet descriptionTrailing()}
    {#if showFaceStatisticsInfo}
      <PeopleFaceStatisticsInfo cacheKey={globalFaceStatisticsCacheKey} loadStatistics={loadGlobalFaceStatistics} />
    {/if}
  {/snippet}

  {#snippet buttons()}
    {#if hasPeopleControls}
      <div class="flex items-center justify-center gap-2">
        <div class="hidden sm:block">
          <div class="h-10 w-40 lg:w-80">
            <SearchPeople
              bind:this={searchPeopleElement}
              type="searchBar"
              placeholder={$t('search_people')}
              onReset={onResetSearchBar}
              onSearch={handleSearch}
              withSharedSpaces={true}
              bind:searchName
              bind:searchedPeopleLocal
            />
          </div>
        </div>
        <Dropdown
          title={$t('filter_people_by')}
          options={peopleFilterOptions}
          selectedOption={peopleFilterBy}
          onSelect={(filterBy) => handlePromiseError(handleFilterChange(filterBy))}
          render={(filterBy) => ({ title: peopleFilterNames[filterBy], icon: peopleFilterIcons[filterBy] })}
        />
        <Dropdown
          title={$t('sort_people_by')}
          options={peopleSortOptions}
          selectedOption={peopleSortBy}
          onSelect={(sortBy) => ($peopleViewSettings.sortBy = sortBy)}
          render={(sortBy) => ({ title: peopleSortByNames[sortBy], icon: peopleSortIcons[sortBy] })}
        />
        <!-- Local Omarchy layer: a crossed-out person, not an eye: the bar's View menu beside it is the eye, and on a
             phone, where the labels go, the two eyes stood side by side -->
        <Button
          leadingIcon={mdiAccountOffOutline}
          onclick={() => goto('/people/manage')}
          size="small"
          variant="ghost"
          color="secondary">{$t('show_and_hide_people')}</Button
        >
      </div>
    {/if}
  {/snippet}

  {#if countVisiblePeople > 0 && (!searchName || searchedPeopleLocal.length > 0)}
    <PeopleManagementGrid
      people={showPeople}
      {toManagedPerson}
      hasNextPage={!!nextPage && !searchName}
      loading={loadingPage}
      {loadNextPage}
      canEditNames={canEditName}
      canShowActions={isPersonalPrimary}
      onNameSubmit={onNameChangeSubmit}
    >
      {#snippet detail(person)}
        {#if isRepeatedName(repeated, person.name)}
          <!-- the line keeps its height while the years are asked for, so nothing moves when they come -->
          <p class="ws-person-span" aria-hidden="true" lang={$locale} data-testid="person-span">
            {spanLine(person) ?? ''}
          </p>
        {/if}
      {/snippet}
      {#snippet actions(person)}
        {@const Actions = getPersonActions($t, person)}
        <ButtonContextMenu
          buttonClass="icon-white-drop-shadow"
          color="secondary"
          size="medium"
          variant="filled"
          icon={mdiDotsVertical}
          title={$t('show_person_options')}
        >
          <ActionMenuItem action={Actions.HidePerson} />
          <ActionMenuItem action={Actions.SetDateOfBirth} />
          <MenuOption
            onClick={() => handleMergePeople(person)}
            icon={mdiAccountMultipleCheckOutline}
            text={$t('merge_people')}
          />
          <ActionMenuItem action={Actions.Favorite} />
          <ActionMenuItem action={Actions.Unfavorite} />
        </ButtonContextMenu>
      {/snippet}
    </PeopleManagementGrid>
  {:else}
    <!-- Local Omarchy layer: on the gutter, where upstream centred a crossed-out person over "No people" -->
    <EmptyState {...emptyState} testId="people-empty" />
  {/if}
</UserPageLayout>

<style>
  /* what tells apart people who share a name: their count and years in data type, muted, under the name */
  .ws-person-span {
    min-height: calc(var(--ws-text-data) * 1.5);
    margin-top: 0.125rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    text-align: center;
    white-space: nowrap;
  }
</style>
