import {
  RepresentativeFaceSource,
  SharedSpaceRole,
  Type,
  type PeopleFaceStatisticsResponseDto,
  type PeopleResponseDto,
  type PeopleStatisticsResponseDto,
  type PersonResponseDto,
  type SharedSpacePersonResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import { modalManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { addMessages } from 'svelte-i18n';
import { get } from 'svelte/store';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { clearPeopleFaceStatisticsInfoCache } from '$lib/components/people/people-face-statistics-info-cache';
import { PEOPLE_PAGE_SIZE, SessionStorageKey } from '$lib/constants';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { PeopleFilterBy, PeopleSortBy, peopleViewSettings } from '$lib/stores/preferences.store';
import { userInteraction } from '$lib/stores/user.svelte';
import { handleError } from '$lib/utils/handle-error';
import { personFactory } from '@test-data/factories/person-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { sharedSpaceFactory } from '@test-data/factories/shared-space-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import PeoplePage from './+page.svelte';

const { gotoMock, pageStore, navigatingStore, featureFlagsMock } = vi.hoisted(() => {
  let pageValue = {
    url: new URL('http://localhost/people'),
    route: { id: '/(user)/people' },
  };

  const navigationSubscribers = new Set<(value: { to: { url: URL } } | null) => void>();
  return {
    navigatingStore: {
      set: (value: { to: { url: URL } } | null) => {
        for (const subscriber of navigationSubscribers) subscriber(value);
      },
      subscribe: (run: (value: { to: { url: URL } } | null) => void) => {
        navigationSubscribers.add(run);
        run(null);
        return () => navigationSubscribers.delete(run);
      },
    },
    gotoMock: vi.fn(),
    pageStore: {
      setUrl: (url: string) => {
        pageValue = { ...pageValue, url: new URL(url) };
      },
      subscribe: (run: (value: typeof pageValue) => void) => {
        run(pageValue);
        return () => {};
      },
    },
    featureFlagsMock: { value: { peopleStatistics: true } },
  };
});

vi.mock('$lib/utils/handle-error', () => ({ handleError: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', () => ({ page: pageStore, navigating: navigatingStore }));
vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: featureFlagsMock,
}));

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    modalManager: { show: vi.fn(), showDialog: vi.fn() },
    toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('./people-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

function makePerson(overrides: Partial<PersonResponseDto> = {}): PersonResponseDto {
  return personFactory.build({
    id: 'person-1',
    name: 'Alice',
    isHidden: false,
    isFavorite: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  });
}

function makeSpacePerson(overrides: Partial<SharedSpacePersonResponseDto> = {}): SharedSpacePersonResponseDto {
  return {
    id: 'space-person-1',
    spaceId: 'space-1',
    name: 'Shared Alice',
    thumbnailPath: '',
    isHidden: false,
    birthDate: null,
    representativeFaceId: null,
    representativeFaceSource: RepresentativeFaceSource.Auto,
    faceCount: 1,
    assetCount: 4,
    alias: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    type: 'person',
    ...overrides,
  };
}

// The viewer's role in a space comes from the spaces list (getAllSpaces embeds members).
function makeSpace(spaceId: string, role: SharedSpaceRole): SharedSpaceResponseDto {
  return sharedSpaceFactory.build({
    id: spaceId,
    members: [
      {
        userId: 'current-user-id',
        role,
        email: 'me@test.dev',
        name: 'Me',
        joinedAt: '2026-01-01T00:00:00.000Z',
        sharePersonMetadata: true,
        showInTimeline: true,
      },
    ],
  });
}

function mockSpaceRole(spaceId: string, role: SharedSpaceRole) {
  sdkMock.getAllSpaces.mockResolvedValue([makeSpace(spaceId, role)]);
}

function makeFaceStatistics(overrides: Partial<PeopleFaceStatisticsResponseDto> = {}): PeopleFaceStatisticsResponseDto {
  return {
    assignedHiddenFaceCount: 3456,
    assignedVisibleFaceCount: 2345,
    detectedFaceCount: 1234,
    namedVisiblePersonCount: 154,
    unassignedFaceCount: 4567,
    ...overrides,
  };
}

function getDefaultPeopleStatistics(people: PersonResponseDto[]): PeopleStatisticsResponseDto {
  return {
    total: people.length,
    hidden: people.filter((person) => person.isHidden).length,
    detectedFaceCount: 0,
  };
}

function renderPage(
  people: PersonResponseDto[] = [makePerson()],
  peopleStatistics: PeopleStatisticsResponseDto | null = getDefaultPeopleStatistics(people),
  hasNextPage = false,
  // Header totals for a filtered load, as `load` resolves them. Null under All, where the
  // unfiltered overview statistics are the right source.
  peopleListTotals: { total: number; hidden: number } | null = null,
) {
  return render(PeoplePage, {
    props: {
      data: {
        people: {
          people,
          total: people.length,
          hidden: people.filter((person) => person.isHidden).length,
          hasNextPage,
        },
        peopleStatistics,
        peopleListTotals,
        meta: { title: 'People' },
      },
    },
  });
}

/**
 * Renders the page with page 1 loaded and a second page available, and hands back a trigger that
 * reports the infinite-scroll sentinel as intersecting so pagination can be driven deterministically.
 */
function renderPaginatedPage() {
  let intersectionCallback: IntersectionObserverCallback | undefined;
  let observedSentinel: Element | undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function (callback: IntersectionObserverCallback) {
      intersectionCallback = callback;
      return {
        observe: (element: Element) => (observedSentinel = element),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
        takeRecords: vi.fn(),
      };
    }),
  );

  const rendered = renderPage(
    [
      makePerson({ id: 'p1', name: 'Alice', numberOfAssets: 5 }),
      makePerson({ id: 'p2', name: 'Bob', numberOfAssets: 4 }),
    ],
    { total: 4, hidden: 0, detectedFaceCount: 0 },
    true,
  );

  const intersect = async () => {
    await waitFor(() => expect(observedSentinel).toBeDefined());
    intersectionCallback?.(
      [{ target: observedSentinel, isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  };

  return { ...rendered, intersect };
}

describe('Global people page', () => {
  beforeAll(() => {
    addMessages('dev', {
      cmdk_preview_photo_count: '{count, plural, one {# photo} other {# photos}}',
      cmdk_unnamed_person: 'Unnamed person',
      person_tile_label: '{name}, {count, plural, one {# photo} other {# photos}}, {years}',
      person_tile_label_count: '{name}, {count, plural, one {# photo} other {# photos}}',
    });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    userInteraction.recentSpaces = undefined;
    peopleViewSettings.set({ sortBy: PeopleSortBy.PhotoCount, filterBy: PeopleFilterBy.All });
    clearPeopleFaceStatisticsInfoCache();
    authManager.setUser(userAdminFactory.build({ id: 'current-user-id' }));
    authManager.setPreferences(preferencesFactory.build());
    Element.prototype.animate = getAnimateMock();
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    pageStore.setUrl('http://localhost/people');
    gotoMock.mockResolvedValue(undefined);
    sdkMock.searchPerson.mockResolvedValue([]);
    sdkMock.getPeopleFaceStatistics.mockResolvedValue(makeFaceStatistics());
    featureFlagsMock.value.peopleStatistics = true;
    sdkMock.updatePerson.mockImplementation(({ id, personUpdateDto }) =>
      Promise.resolve(
        makePerson({
          id,
          name: personUpdateDto.name ?? 'Alice',
          birthDate: personUpdateDto.birthDate,
          isFavorite: personUpdateDto.isFavorite ?? false,
          isHidden: personUpdateDto.isHidden ?? false,
        }),
      ),
    );
  });

  it('renders people with the shared tile link and editable name footer', () => {
    const person = makePerson({ id: 'p1', name: 'Alice' });
    renderPage([person]);

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/people/p1?previousRoute=%2Fpeople');
    expect(screen.getByDisplayValue('Alice')).toHaveAttribute('placeholder', 'add_a_name');
  });

  it('renders favorites first, then named and unnamed people by photo count by default', () => {
    renderPage([
      makePerson({ id: 'unnamed-low', name: '', isFavorite: false, numberOfAssets: 1 }),
      makePerson({ id: 'named-z', name: 'Zoe', isFavorite: false, numberOfAssets: 99 }),
      makePerson({ id: 'favorite-unnamed', name: '', isFavorite: true, numberOfAssets: 7 }),
      makePerson({ id: 'named-a', name: 'Alice', isFavorite: false, numberOfAssets: 1 }),
      makePerson({ id: 'unnamed-high', name: '', isFavorite: false, numberOfAssets: 12 }),
      makePerson({ id: 'favorite-named', name: 'Anna', isFavorite: true, numberOfAssets: 1 }),
    ]);

    expect(screen.getAllByPlaceholderText('add_a_name').map((input) => (input as HTMLInputElement).value)).toEqual([
      'Anna',
      '',
      'Zoe',
      'Alice',
      '',
      '',
    ]);
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/people/"]')].map((link) => {
        const url = new URL(link.href);
        return `${url.pathname}${url.search}`;
      }),
    ).toEqual([
      '/people/favorite-named?previousRoute=%2Fpeople',
      '/people/favorite-unnamed?previousRoute=%2Fpeople',
      '/people/named-z?previousRoute=%2Fpeople',
      '/people/named-a?previousRoute=%2Fpeople',
      '/people/unnamed-high?previousRoute=%2Fpeople',
      '/people/unnamed-low?previousRoute=%2Fpeople',
    ]);
  });

  it('switches to Name ordering via the sort dropdown and persists the choice', async () => {
    const user = userEvent.setup();
    renderPage([
      makePerson({ id: 'named-z', name: 'Zoe', numberOfAssets: 99 }),
      makePerson({ id: 'named-a', name: 'Alice', numberOfAssets: 1 }),
    ]);

    expect(screen.getAllByPlaceholderText('add_a_name').map((input) => (input as HTMLInputElement).value)).toEqual([
      'Zoe',
      'Alice',
    ]);

    // The trigger's accessible name is the selected option's label (@immich/ui Button
    // turns `title` into a hover Tooltip, NOT a title attribute — do not use getByTitle).
    await user.click(screen.getByRole('button', { name: 'sort_people_most_photos' }));
    await user.click(screen.getByRole('button', { name: 'name' }));

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('add_a_name').map((input) => (input as HTMLInputElement).value)).toEqual([
        'Alice',
        'Zoe',
      ]);
    });
    expect(get(peopleViewSettings).sortBy).toBe(PeopleSortBy.Name);
  });

  it('hides the sort control when there are no people', () => {
    renderPage([]);

    expect(screen.queryByRole('button', { name: 'sort_people_most_photos' })).toBeNull();
  });

  // A library with people but no pets, loaded under a persisted Pets filter — what a user is left
  // with after resetting pet detection. `load` applies the filter, so the page is handed an empty
  // list and zeroed filtered totals while the unfiltered overview statistics still count people.
  const renderEmptyPetFilter = () => {
    peopleViewSettings.set({ sortBy: PeopleSortBy.PhotoCount, filterBy: PeopleFilterBy.Pets });
    return renderPage([], { total: 12, hidden: 0, detectedFaceCount: 340 }, false, { total: 0, hidden: 0 });
  };

  it('keeps the type filter reachable when the active filter matches nobody', () => {
    // An empty filtered list says nothing about whether the library has people. Gating the toolbar
    // on the loaded rows takes the filter dropdown down with them, stranding the user on the empty
    // view with no control to get back to All.
    renderEmptyPetFilter();

    expect(screen.getByRole('button', { name: 'pets' })).toBeInTheDocument();
  });

  it('names pets, not people, in the empty state under the Pets filter', () => {
    renderEmptyPetFilter();

    // "No people" under an empty Pets filter reads as a claim about the whole library, which is
    // exactly backwards: the library still has people, it just has no pets.
    expect(screen.getByText('search_no_pets')).toBeInTheDocument();
    expect(screen.queryByText('search_no_people')).toBeNull();
  });

  it('shows counts for named and unnamed faces without additional requests, including singular and zero', () => {
    renderPage([
      makePerson({ id: 'count-alice', name: 'Alice', numberOfAssets: 12 }),
      makePerson({ id: 'count-unnamed', name: '', numberOfAssets: 1 }),
      makePerson({ id: 'count-empty', name: 'Empty', numberOfAssets: 0 }),
      makePerson({ id: 'count-unknown', name: 'Unknown', numberOfAssets: undefined }),
    ]);

    expect(screen.getByRole('link', { name: 'Alice, 12 photos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unnamed person, 1 photo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Empty, 0 photos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unknown' })).toBeInTheDocument();
    expect(screen.getByText('12 photos')).toBeVisible();
    expect(screen.getByText('1 photo')).toBeVisible();
    expect(screen.getAllByText('0 photos')).toHaveLength(1);
    expect(sdkMock.getTimeBuckets).not.toHaveBeenCalled();
    expect(sdkMock.getPerson).not.toHaveBeenCalled();
  });

  it('adds years for repeated names while keeping the listed photo counts on every face', async () => {
    sdkMock.getTimeBuckets.mockImplementation(({ personIds }) =>
      Promise.resolve(
        personIds?.[0] === 'daniel-a'
          ? [
              { timeBucket: '2026-01-01', count: 40 },
              { timeBucket: '2010-01-01', count: 100 },
            ]
          : [{ timeBucket: '2015-01-01', count: 29 }],
      ),
    );
    renderPage([
      makePerson({ id: 'daniel-a', name: 'Daniel', numberOfAssets: 150 }),
      makePerson({ id: 'daniel-b', name: 'daniel', numberOfAssets: 29 }),
      makePerson({ id: 'kim', name: 'Kim', numberOfAssets: 11 }),
    ]);

    expect(screen.getByText('150 photos')).toBeVisible();
    expect(screen.getByText('29 photos')).toBeVisible();
    expect(screen.getByText('11 photos')).toBeVisible();
    await waitFor(() => expect(screen.getByText('2010–2026')).toBeVisible());
    expect(screen.getByText('2015')).toBeVisible();
    // a screen reader hears the same: the tiles' links say the count and the years with the name
    expect(screen.getByRole('link', { name: 'Daniel, 150 photos, 2010–2026' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'daniel, 29 photos, 2015' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kim, 11 photos' })).toBeInTheDocument();
    expect(sdkMock.getTimeBuckets).toHaveBeenCalledTimes(2);
    expect(sdkMock.updatePerson).not.toHaveBeenCalled();
  });

  // Local Omarchy layer: an empty People page says why, on the gutter (DESIGN.md, People)
  it('says People fills in as faces are found when the library has no one yet', () => {
    renderPage([], { total: 0, hidden: 0, detectedFaceCount: 0 });

    const empty = screen.getByTestId('people-empty');
    expect(empty).toHaveTextContent('people_empty_title');
    expect(empty).toHaveTextContent('people_empty_body');
    expect(screen.queryByRole('link', { name: 'show_and_hide_people' })).toBeNull();
  });

  it('says everyone is hidden, with the way to Show & hide people, when every person is hidden', () => {
    renderPage([makePerson({ id: 'p1', isHidden: true }), makePerson({ id: 'p2', isHidden: true })]);

    expect(screen.getByTestId('people-empty')).toHaveTextContent('people_all_hidden_title');
    expect(screen.getByRole('link', { name: 'show_and_hide_people' })).toHaveAttribute('href', '/people/manage');
  });

  it('offers Clear filters under an empty Pets filter, which brings everyone back', async () => {
    const user = userEvent.setup();
    renderEmptyPetFilter();
    expect(screen.getByTestId('people-empty')).toHaveTextContent('people_no_pets_body');
    sdkMock.getAllPeople.mockResolvedValue({
      people: [makePerson({ id: 'p1', name: 'Alice' })],
      total: 1,
      hidden: 0,
      hasNextPage: false,
    });

    await user.click(screen.getByRole('button', { name: 'timeline_empty_clear_filters' }));

    await waitFor(() => expect(screen.getByDisplayValue('Alice')).toBeInTheDocument());
    expect(get(peopleViewSettings).filterBy).toBe(PeopleFilterBy.All);
  });

  it('reloads the unfiltered people when an empty pet filter is switched back to All', async () => {
    const user = userEvent.setup();
    renderEmptyPetFilter();
    sdkMock.getAllPeople.mockResolvedValue({
      people: [makePerson({ id: 'p1', name: 'Alice' })],
      total: 1,
      hidden: 0,
      hasNextPage: false,
    });

    await user.click(screen.getByRole('button', { name: 'pets' }));
    await user.click(screen.getByRole('button', { name: 'all' }));

    await waitFor(() => expect(screen.getByDisplayValue('Alice')).toBeInTheDocument());
    expect(sdkMock.getAllPeople).toHaveBeenLastCalledWith({
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: PEOPLE_PAGE_SIZE,
      $type: undefined,
    });
  });

  it('falls back to the default order when the stored preference is corrupt', () => {
    peopleViewSettings.set({ sortBy: 'garbage' as PeopleSortBy });
    renderPage([
      makePerson({ id: 'named-a', name: 'Alice', numberOfAssets: 1 }),
      makePerson({ id: 'named-z', name: 'Zoe', numberOfAssets: 99 }),
    ]);

    expect(screen.getAllByPlaceholderText('add_a_name').map((input) => (input as HTMLInputElement).value)).toEqual([
      'Zoe',
      'Alice',
    ]);
  });

  it('sorts searched results by photo count in the default mode', async () => {
    // URL-driven search activation — the same harness the existing global-name-search tests use
    pageStore.setUrl('http://localhost/people?searchedPeople=Ali');
    sdkMock.searchPerson.mockResolvedValue([
      makePerson({ id: 'search-a', name: 'Alice', numberOfAssets: 1 }),
      makePerson({ id: 'search-b', name: 'Alicia', numberOfAssets: 99 }),
    ]);

    renderPage([makePerson({ id: 'p1', name: 'Someone', numberOfAssets: 5 })]);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('add_a_name').map((input) => (input as HTMLInputElement).value)).toEqual([
        'Alicia',
        'Alice',
      ]);
    });
  });

  // Regression: the page used to re-apply a persisted filter in onMount, so refreshing under Pets
  // painted the unfiltered list for one round trip before narrowing. `load` now fetches the filtered
  // list, so mounting must issue no request at all — no request, no flash.
  it('issues no request on mount under a persisted non-All filter', async () => {
    peopleViewSettings.set({ sortBy: PeopleSortBy.PhotoCount, filterBy: PeopleFilterBy.Pets });

    renderPage([makePerson({ id: 'pet-1', name: 'Rex' })], { total: 1, hidden: 0, detectedFaceCount: 0 }, false, {
      total: 1,
      hidden: 0,
    });

    await waitFor(() => expect(screen.getByTestId('user-page-layout')).toBeInTheDocument());
    expect(sdkMock.getAllPeople).not.toHaveBeenCalled();
  });

  // Under a filter the unfiltered overview statistics would report the whole library above a
  // filtered grid, so the header has to read the totals `load` returned with the filtered list.
  it('reads the header totals from the filtered load rather than the overview statistics', () => {
    peopleViewSettings.set({ sortBy: PeopleSortBy.PhotoCount, filterBy: PeopleFilterBy.Pets });

    // Local Omarchy layer: while more pages remain, the header counts from the totals (once every person is in, it
    // counts the faces shown: see below)
    renderPage([makePerson({ id: 'pet-1', name: 'Rex' })], { total: 120, hidden: 20, detectedFaceCount: 2901 }, true, {
      total: 4,
      hidden: 1,
    });

    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(3) \u{B7} 2,901 faces');
  });

  it('shows visible people and detected faces in the heading', () => {
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 }, true);

    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(10) \u{B7} 2,901 faces');
  });

  it('derives the heading person count from overview statistics instead of loaded rows', () => {
    renderPage([makePerson({ id: 'p1' })], { total: 60, hidden: 4, detectedFaceCount: 100 }, true);

    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(56) \u{B7} 100 faces');
  });

  // Local Omarchy layer: the owner's "counts that match the cards". Gallery's totals count a person as hidden only when
  // every profile of theirs is, while the grid hides one whose own profile is, so they had read "(562)" over 244 faces
  it('counts the faces the grid shows once every person is in', () => {
    renderPage(
      [
        makePerson({ id: 'p1', name: 'Alice' }),
        makePerson({ id: 'p2', name: 'Bob' }),
        makePerson({ id: 'p3', name: 'Cleo', isHidden: true }),
      ],
      { total: 3, hidden: 0, detectedFaceCount: 40 },
    );

    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(2) \u{B7} 40 faces');
  });

  it('shows detected faces when all people are hidden', () => {
    renderPage([makePerson({ id: 'p1', isHidden: true })], { total: 1, hidden: 1, detectedFaceCount: 42 });

    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(0) \u{B7} 42 faces');
  });

  it('omits the heading description for an empty scope with no detected faces', () => {
    renderPage([], { total: 0, hidden: 0, detectedFaceCount: 0 });

    expect(screen.getByTestId('user-page-layout')).not.toHaveAttribute('data-description');
  });

  it('keeps rendering people and falls back to the list count when statistics are unavailable', () => {
    renderPage([makePerson({ id: 'p1', name: 'Alice' })], null);

    expect(screen.getByRole('link', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(1)');
  });

  it('does not call detailed face statistics on initial render', () => {
    renderPage([makePerson()]);

    expect(sdkMock.getPeopleFaceStatistics).not.toHaveBeenCalled();
  });

  it('renders a face statistics details button when overview stats exist and no global search is active', () => {
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    expect(screen.getByRole('button', { name: 'view_face_statistics_details' })).toBeInTheDocument();
  });

  it('loads and renders detailed global face statistics when the info button is clicked', async () => {
    sdkMock.getPeopleFaceStatistics.mockResolvedValue(
      makeFaceStatistics({
        detectedFaceCount: 1234,
        assignedVisibleFaceCount: 2345,
        namedVisiblePersonCount: 154,
        assignedHiddenFaceCount: 3456,
        unassignedFaceCount: 4567,
      }),
    );
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    await userEvent.click(screen.getByRole('button', { name: 'view_face_statistics_details' }));

    expect(sdkMock.getPeopleFaceStatistics).toHaveBeenCalledWith({ withSharedSpaces: true });
    expect(await screen.findByText('detected_faces')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('assigned_to_visible_people')).toBeInTheDocument();
    expect(screen.getByText('2,345')).toBeInTheDocument();
    expect(screen.getByText('named_visible_people')).toBeInTheDocument();
    expect(screen.getByText('154')).toBeInTheDocument();
    expect(screen.getByText('assigned_to_hidden_people')).toBeInTheDocument();
    expect(screen.getByText('3,456')).toBeInTheDocument();
    expect(screen.getByText('unassigned')).toBeInTheDocument();
    expect(screen.getByText('4,567')).toBeInTheDocument();
  });

  it('uses cached detailed global face statistics when the info UI is closed and reopened', async () => {
    sdkMock.getPeopleFaceStatistics.mockResolvedValue(makeFaceStatistics({ detectedFaceCount: 1234 }));
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    const trigger = screen.getByRole('button', { name: 'view_face_statistics_details' });
    await userEvent.click(trigger);
    expect(await screen.findByText('1,234')).toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.click(trigger);

    expect(sdkMock.getPeopleFaceStatistics).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('loads detailed global face statistics separately after the authenticated user changes', async () => {
    sdkMock.getPeopleFaceStatistics
      .mockResolvedValueOnce(makeFaceStatistics({ detectedFaceCount: 1111 }))
      .mockResolvedValueOnce(makeFaceStatistics({ detectedFaceCount: 2222 }));
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    const trigger = screen.getByRole('button', { name: 'view_face_statistics_details' });
    await userEvent.click(trigger);
    expect(await screen.findByText('1,111')).toBeInTheDocument();

    await userEvent.click(trigger);
    authManager.setUser(userAdminFactory.build({ id: 'other-user-id' }));
    await userEvent.click(trigger);

    expect(await screen.findByText('2,222')).toBeInTheDocument();
    expect(sdkMock.getPeopleFaceStatistics).toHaveBeenCalledTimes(2);
  });

  it('renders a detailed face statistics error while keeping the primary face count in the header', async () => {
    sdkMock.getPeopleFaceStatistics.mockRejectedValue(new Error('network'));
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 }, true);

    await userEvent.click(screen.getByRole('button', { name: 'view_face_statistics_details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('unable_to_load_face_statistics');
    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(10) \u{B7} 2,901 faces');
  });

  it('hides the face count while global name search is active because it is unsupported by overview stats', async () => {
    pageStore.setUrl('http://localhost/people?searchedPeople=Ali');
    sdkMock.searchPerson.mockResolvedValue([makePerson({ id: 'p1', name: 'Alice' })]);

    renderPage([makePerson({ id: 'p1', name: 'Alice' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    await waitFor(() => {
      expect(sdkMock.searchPerson).toHaveBeenCalledWith({ name: 'Ali', withSharedSpaces: true }, expect.any(Object));
    });
    await waitFor(() => {
      expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(1)');
    });
    expect(screen.getByTestId('user-page-layout').dataset.description ?? '').not.toContain('faces');
  });

  it('hides the face statistics details button during unsupported global name search', async () => {
    pageStore.setUrl('http://localhost/people?searchedPeople=Ali');
    sdkMock.searchPerson.mockResolvedValue([makePerson({ id: 'p1', name: 'Alice' })]);

    renderPage([makePerson({ id: 'p1', name: 'Alice' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    expect(screen.queryByRole('button', { name: 'view_face_statistics_details' })).not.toBeInTheDocument();
    expect(sdkMock.getPeopleFaceStatistics).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(sdkMock.searchPerson).toHaveBeenCalledWith({ name: 'Ali', withSharedSpaces: true }, expect.any(Object));
    });
    expect(screen.queryByRole('button', { name: 'view_face_statistics_details' })).not.toBeInTheDocument();
    expect(sdkMock.getPeopleFaceStatistics).not.toHaveBeenCalled();
  });

  it('does not render the face statistics details button at any point during initial unsupported global name search', async () => {
    pageStore.setUrl('http://localhost/people?searchedPeople=Ali');
    const renderedButtonLabels: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          const labeledElements = [
            ...(node.matches('[aria-label]') ? [node] : []),
            ...node.querySelectorAll<HTMLElement>('[aria-label]'),
          ];
          renderedButtonLabels.push(...labeledElements.map((element) => element.getAttribute('aria-label') ?? ''));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    renderPage([makePerson({ id: 'p1', name: 'Alice' })], {
      total: 12,
      hidden: 2,
      detectedFaceCount: 2901,
    });
    await Promise.resolve();
    observer.disconnect();

    expect(renderedButtonLabels).not.toContain('view_face_statistics_details');
    expect(screen.queryByRole('button', { name: 'view_face_statistics_details' })).not.toBeInTheDocument();
    expect(sdkMock.getPeopleFaceStatistics).not.toHaveBeenCalled();
  });

  it('hides the face statistics details button when overview statistics are unavailable', () => {
    renderPage([makePerson({ id: 'p1', name: 'Alice' })], null);

    expect(screen.queryByRole('button', { name: 'view_face_statistics_details' })).not.toBeInTheDocument();
  });

  it('hides the face statistics details button when no face count is visible in the header', () => {
    renderPage([], { total: 0, hidden: 0, detectedFaceCount: 0 });

    expect(screen.queryByRole('button', { name: 'view_face_statistics_details' })).not.toBeInTheDocument();
  });

  it('omits the face count from the header when the peopleStatistics feature flag is disabled', () => {
    featureFlagsMock.value.peopleStatistics = false;
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 }, true);

    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(10)');
  });

  it('hides the face statistics details button when the peopleStatistics feature flag is disabled', () => {
    featureFlagsMock.value.peopleStatistics = false;
    renderPage([makePerson({ id: 'p1' })], { total: 12, hidden: 2, detectedFaceCount: 2901 });

    expect(screen.queryByRole('button', { name: 'view_face_statistics_details' })).not.toBeInTheDocument();
    expect(sdkMock.getPeopleFaceStatistics).not.toHaveBeenCalled();
  });

  it('saves global person names through the shared editable footer', async () => {
    const person = makePerson({ id: 'p1', name: 'Alice' });
    renderPage([person]);

    const input = screen.getByDisplayValue('Alice');
    const user = userEvent.setup();

    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Alicia');
    await fireEvent.focusOut(input);

    await waitFor(() => {
      expect(sdkMock.updatePerson).toHaveBeenCalledWith({
        id: 'p1',
        personUpdateDto: { name: 'Alicia' },
      });
    });
  });

  it('keeps global person actions on the shared tile action slot', async () => {
    const person = makePerson({ id: 'p1', name: 'Alice', isFavorite: false });
    const { baseElement } = renderPage([person]);

    await fireEvent.mouseEnter(baseElement.querySelector('[role="group"]')!);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('show_person_options'));

    expect(screen.getByText('hide_person')).toBeInTheDocument();
    expect(screen.getByText('set_date_of_birth')).toBeInTheDocument();
    expect(screen.getByText('merge_people')).toBeInTheDocument();
    expect(screen.getByText('to_favorite')).toBeInTheDocument();

    await user.click(screen.getByText('merge_people'));

    expect(gotoMock).toHaveBeenCalledWith('/people/p1?previousRoute=%2Fpeople&action=merge');
  });

  it('routes a space-primary person to identity-wide person detail', () => {
    renderPage([
      makePerson({
        id: 'space-person-1',
        name: 'Shared Alice',
        isFavorite: undefined,
        primaryProfile: { type: Type.SpacePerson, id: 'space-person-1', spaceId: 'space-1' },
        numberOfAssets: 4,
      }),
    ]);

    expect(screen.getByRole('link', { name: 'Shared Alice, 4 photos' })).toHaveAttribute(
      'href',
      '/people/space-person-1?previousRoute=%2Fpeople',
    );
    expect(screen.getByTitle('Shared Alice').getAttribute('src')).toContain(
      '/shared-spaces/space-1/people/space-person-1/thumbnail?updatedAt=2026-01-02T00%3A00%3A00.000Z',
    );
  });

  it('saves space-primary person names inline through the space people API', async () => {
    const person = makePerson({
      id: 'space-person-1',
      name: 'Shared Alice',
      isFavorite: undefined,
      primaryProfile: { type: Type.SpacePerson, id: 'space-person-1', spaceId: 'space-1' },
    });
    sdkMock.updateSpacePerson.mockResolvedValue(makeSpacePerson({ name: 'Shared Alicia' }));
    mockSpaceRole('space-1', SharedSpaceRole.Editor);
    renderPage([person]);

    const input = await screen.findByDisplayValue('Shared Alice');
    const user = userEvent.setup();

    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Shared Alicia');
    await fireEvent.focusOut(input);

    await waitFor(() => {
      expect(sdkMock.updateSpacePerson).toHaveBeenCalledWith({
        id: 'space-1',
        personId: 'space-person-1',
        sharedSpacePersonUpdateDto: { name: 'Shared Alicia' },
      });
    });
    expect(sdkMock.updatePerson).not.toHaveBeenCalled();
  });

  // #1099: the tile's "Add a name" field had no suggestions at all.
  it('suggests existing people, including shared-space ones, while naming a tile', async () => {
    const norgy = makePerson({
      id: 'space-person-norgy',
      name: 'Norgy',
      isFavorite: undefined,
      primaryProfile: { type: Type.SpacePerson, id: 'space-person-norgy', spaceId: 'space-1' },
    });
    const unnamed = makePerson({ id: 'p-unnamed', name: '' });
    sdkMock.searchPerson.mockResolvedValue([norgy]);
    vi.mocked(modalManager.show).mockResolvedValue(undefined as never);
    renderPage([norgy, unnamed]);

    const user = userEvent.setup();
    const input = screen
      .getAllByPlaceholderText('add_a_name')
      .find((element) => (element as HTMLInputElement).value === '')!;
    await user.click(input);
    await user.type(input, 'Norg');

    const option = await screen.findByRole('option', { name: 'Norgy' });
    expect(sdkMock.searchPerson).toHaveBeenCalledWith({ name: 'Norg', withSharedSpaces: true });
    expect(option.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/shared-spaces/space-1/people/space-person-norgy/thumbnail'),
    );

    await user.click(option);

    await waitFor(() =>
      expect(modalManager.show).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ personToMerge: unnamed, personToBeMergedInto: norgy }),
      ),
    );
    // Declining a picked suggestion must not fall back to renaming the tile to the suggestion's name.
    expect(sdkMock.updatePerson).not.toHaveBeenCalled();
    expect(sdkMock.updateSpacePerson).not.toHaveBeenCalled();
  });

  // #1100: the same-name check used to be skipped for space people, and searched only owned people.
  it('offers to merge a space-primary tile renamed to an existing shared-space name', async () => {
    const norgy = makePerson({
      id: 'space-person-norgy',
      name: 'Norgy',
      isFavorite: undefined,
      primaryProfile: { type: Type.SpacePerson, id: 'space-person-norgy', spaceId: 'space-1' },
    });
    const unnamed = makePerson({
      id: 'space-person-unnamed',
      name: '',
      isFavorite: undefined,
      primaryProfile: { type: Type.SpacePerson, id: 'space-person-unnamed', spaceId: 'space-1' },
    });
    sdkMock.searchPerson.mockResolvedValue([norgy]);
    vi.mocked(modalManager.show).mockResolvedValue(undefined as never);
    renderPage([norgy, unnamed]);

    const user = userEvent.setup();
    const input = screen
      .getAllByPlaceholderText('add_a_name')
      .find((element) => (element as HTMLInputElement).value === '')!;
    await user.click(input);
    await user.type(input, 'norgy');
    await fireEvent.focusOut(input);

    await waitFor(() =>
      expect(sdkMock.searchPerson).toHaveBeenCalledWith({ name: 'norgy', withHidden: true, withSharedSpaces: true }),
    );
    await waitFor(() =>
      expect(modalManager.show).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ personToMerge: unnamed, personToBeMergedInto: norgy }),
      ),
    );
  });

  it('blocks inline renames for space-primary rows when the user is a viewer', async () => {
    mockSpaceRole('viewer-space-grid', SharedSpaceRole.Viewer);
    renderPage([
      makePerson({
        id: 'space-person-2',
        name: 'Shared Alice',
        isFavorite: undefined,
        primaryProfile: { type: Type.SpacePerson, id: 'space-person-2', spaceId: 'viewer-space-grid' },
      }),
    ]);

    await waitFor(() => expect(userInteraction.recentSpaces).toBeDefined());
    expect(screen.queryByDisplayValue('Shared Alice')).toBeNull();
    expect(screen.getByText('Shared Alice')).toBeInTheDocument();
    expect(sdkMock.getAllSpaces).toHaveBeenCalledOnce();
    expect(sdkMock.getMembers).not.toHaveBeenCalled();
  });

  it('keeps space-primary names editable until the spaces list says the viewer cannot edit', async () => {
    let resolveSpaces!: (spaces: SharedSpaceResponseDto[]) => void;
    sdkMock.getAllSpaces.mockReturnValue(new Promise((resolve) => (resolveSpaces = resolve)));
    renderPage([
      makePerson({
        id: 'space-person-1',
        name: 'Shared Alice',
        isFavorite: undefined,
        primaryProfile: { type: Type.SpacePerson, id: 'space-person-1', spaceId: 'space-1' },
      }),
    ]);

    await waitFor(() => expect(sdkMock.getAllSpaces).toHaveBeenCalledOnce());
    expect(await screen.findByDisplayValue('Shared Alice')).toBeInTheDocument();

    resolveSpaces([makeSpace('space-1', SharedSpaceRole.Viewer)]);

    await waitFor(() => expect(screen.queryByDisplayValue('Shared Alice')).toBeNull());
    expect(screen.getByText('Shared Alice')).toBeInTheDocument();
  });

  it('keeps personal actions off shared-space-only rows', async () => {
    mockSpaceRole('space-1', SharedSpaceRole.Editor);
    const { baseElement } = renderPage([
      makePerson({
        id: 'space-person-1',
        name: 'Shared Alice',
        isFavorite: undefined,
        primaryProfile: { type: Type.SpacePerson, id: 'space-person-1', spaceId: 'space-1' },
      }),
    ]);

    await fireEvent.mouseEnter(baseElement.querySelector('[role="group"]')!);

    expect(await screen.findByDisplayValue('Shared Alice')).toHaveAttribute('placeholder', 'add_a_name');
    expect(screen.queryByLabelText('show_person_options')).not.toBeInTheDocument();
    expect(screen.queryByText('to_favorite')).not.toBeInTheDocument();
    expect(screen.queryByText('hide_person')).not.toBeInTheDocument();
  });

  it('restores the second page before scrolling back to a face', async () => {
    sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, '2');
    sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
    let resolvePage!: (result: PeopleResponseDto) => void;
    sdkMock.getAllPeople.mockReturnValue(new Promise((resolve) => (resolvePage = resolve)));
    const scroll = vi.spyOn(HTMLElement.prototype, 'scroll').mockImplementation(function () {
      // Restoration must happen after the additional rows have been rendered, not just fetched.
      expect(screen.getByDisplayValue('Carol')).toBeInTheDocument();
    });
    renderPage([makePerson()], null, true);
    await waitFor(() => expect(sdkMock.getAllPeople).toHaveBeenCalledOnce());
    expect(scroll).not.toHaveBeenCalled();
    resolvePage({ people: [makePerson({ id: 'p2', name: 'Carol' })], total: 2, hidden: 0, hasNextPage: false });
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 2400, behavior: 'instant' }));
    expect(sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION)).toBeNull();
    expect(sessionStorage.getItem(SessionStorageKey.INFINITE_SCROLL_PAGE)).toBeNull();
    scroll.mockRestore();
  });

  it('restores every saved page with the active filter and saves the next browsing position', async () => {
    sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, '3');
    sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '5200');
    peopleViewSettings.set({ sortBy: PeopleSortBy.PhotoCount, filterBy: PeopleFilterBy.Pets });
    sdkMock.getAllPeople
      .mockResolvedValueOnce({
        people: [makePerson({ id: 'p2', name: 'Cat' })],
        total: 3,
        hidden: 0,
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        people: [makePerson({ id: 'p3', name: 'Dog' })],
        total: 3,
        hidden: 0,
        hasNextPage: false,
      });
    const scroll = vi.spyOn(HTMLElement.prototype, 'scroll');
    renderPage([makePerson()], null, true);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 5200, behavior: 'instant' }));
    expect(sdkMock.getAllPeople.mock.calls.map(([request]) => request)).toEqual([
      { withHidden: true, withSharedSpaces: true, page: 2, size: PEOPLE_PAGE_SIZE, $type: 'pet' },
      { withHidden: true, withSharedSpaces: true, page: 3, size: PEOPLE_PAGE_SIZE, $type: 'pet' },
    ]);
    screen.getByTestId('people-scroll').scrollTop = 5800;
    navigatingStore.set({ to: { url: new URL('http://localhost/people/p3') } });
    expect(sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION)).toBe('5800');
    expect(sessionStorage.getItem(SessionStorageKey.INFINITE_SCROLL_PAGE)).toBe('3');
    scroll.mockRestore();
  });

  it('keeps loaded rows and allows paging to retry after a restoration request fails', async () => {
    sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, '3');
    sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
    const error = new Error('Unable to fetch page 3');
    sdkMock.getAllPeople
      .mockResolvedValueOnce({
        people: [makePerson({ id: 'p3', name: 'Carol' })],
        total: 4,
        hidden: 0,
        hasNextPage: true,
      })
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        people: [makePerson({ id: 'p4', name: 'Dave' })],
        total: 4,
        hidden: 0,
        hasNextPage: false,
      });
    const scroll = vi.spyOn(HTMLElement.prototype, 'scroll');
    const { intersect } = renderPaginatedPage();
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 2400, behavior: 'instant' }));
    expect(handleError).toHaveBeenCalledWith(error, 'errors.failed_to_load_people');
    expect(screen.getByDisplayValue('Carol')).toBeInTheDocument();
    await intersect();
    await waitFor(() => expect(screen.getByDisplayValue('Dave')).toBeInTheDocument());
    expect(sdkMock.getAllPeople.mock.calls.map(([request]) => request.page)).toEqual([2, 3, 3]);
    scroll.mockRestore();
  });

  it.each([null, '1', 'invalid', '3'])(
    'finishes restoring a single-page list with saved page %s',
    async (savedPage) => {
      if (savedPage) sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, savedPage);
      sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '700');
      const scroll = vi.spyOn(HTMLElement.prototype, 'scroll');
      renderPage([makePerson()], null, false);
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 700, behavior: 'instant' }));
      expect(sdkMock.getAllPeople).not.toHaveBeenCalled();
      scroll.mockRestore();
    },
  );

  it('requests the next page at the shared size and merges the rows across the boundary', async () => {
    // The initial load fetched page 1 at PEOPLE_PAGE_SIZE; infinite scroll must continue with the
    // SAME size or the page*size offset would skip or duplicate people across the boundary.
    sdkMock.getAllPeople.mockResolvedValue({
      people: [
        makePerson({ id: 'p3', name: 'Carol', numberOfAssets: 3 }),
        makePerson({ id: 'p4', name: 'Dave', numberOfAssets: 2 }),
      ],
      total: 4,
      hidden: 0,
      hasNextPage: false,
    });

    const { intersect } = renderPaginatedPage();
    await intersect();

    await waitFor(() => {
      expect(sdkMock.getAllPeople).toHaveBeenCalledWith({
        withHidden: true,
        withSharedSpaces: true,
        page: 2,
        size: PEOPLE_PAGE_SIZE,
      });
    });

    // Page 2's rows are appended to page 1's — all four render, none dropped or duplicated.
    await waitFor(() => {
      expect(screen.getByDisplayValue('Carol')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Dave')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bob')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('add_a_name')).toHaveLength(4);
  });

  it('requests a page only once while that request is still in flight', async () => {
    // The grid has two independent next-page triggers (the IntersectionObserver and the rAF
    // sentinel re-check) and both are gated on `loading`. Without an in-flight guard the same
    // page is fetched twice, both responses are appended, and the duplicate ids blow up the
    // keyed {#each} — the grid then stops rendering while requests keep firing.
    let resolvePage2: ((value: PeopleResponseDto) => void) | undefined;
    sdkMock.getAllPeople.mockReturnValue(
      new Promise<PeopleResponseDto>((resolve) => {
        resolvePage2 = resolve;
      }),
    );

    const { intersect } = renderPaginatedPage();
    await intersect();
    await intersect();

    expect(sdkMock.getAllPeople).toHaveBeenCalledTimes(1);

    resolvePage2!({
      people: [
        makePerson({ id: 'p3', name: 'Carol', numberOfAssets: 3 }),
        makePerson({ id: 'p4', name: 'Dave', numberOfAssets: 2 }),
      ],
      total: 4,
      hidden: 0,
      hasNextPage: false,
    });

    await waitFor(() => expect(screen.getByDisplayValue('Carol')).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText('add_a_name')).toHaveLength(4);
  });

  it('releases the in-flight guard so scrolling keeps paging past the second page', async () => {
    // The guard must gate concurrent requests for the SAME page without wedging the cascade.
    sdkMock.getAllPeople
      .mockResolvedValueOnce({
        people: [makePerson({ id: 'p3', name: 'Carol', numberOfAssets: 3 })],
        total: 4,
        hidden: 0,
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        people: [makePerson({ id: 'p4', name: 'Dave', numberOfAssets: 2 })],
        total: 4,
        hidden: 0,
        hasNextPage: false,
      });

    const { intersect } = renderPaginatedPage();
    await intersect();
    await waitFor(() => expect(screen.getByDisplayValue('Carol')).toBeInTheDocument());

    await intersect();

    await waitFor(() => expect(screen.getByDisplayValue('Dave')).toBeInTheDocument());
    expect(sdkMock.getAllPeople).toHaveBeenNthCalledWith(2, {
      withHidden: true,
      withSharedSpaces: true,
      page: 3,
      size: PEOPLE_PAGE_SIZE,
    });
    expect(screen.getAllByPlaceholderText('add_a_name')).toHaveLength(4);
  });

  it('renders each person once when the server repeats a row across the page boundary', async () => {
    // OFFSET pagination is not a snapshot: the accessible-people ORDER BY keys on favourite
    // status, name and visible asset count, so a rename or a background face job between page
    // requests can shift the window and re-emit a row that page 1 already returned. That must
    // not wedge the keyed {#each}.
    sdkMock.getAllPeople.mockResolvedValue({
      people: [
        makePerson({ id: 'p2', name: 'Bob', numberOfAssets: 4 }),
        makePerson({ id: 'p3', name: 'Carol', numberOfAssets: 3 }),
      ],
      total: 3,
      hidden: 0,
      hasNextPage: false,
    });

    const { intersect } = renderPaginatedPage();
    await intersect();

    await waitFor(() => expect(screen.getByDisplayValue('Carol')).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText('add_a_name').map((input) => (input as HTMLInputElement).value)).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ]);
  });
});
