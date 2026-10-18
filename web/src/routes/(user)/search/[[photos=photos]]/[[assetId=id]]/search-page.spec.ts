import { AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import type { Component } from 'svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { goto } from '$app/navigation';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { QueryParameter } from '$lib/constants';
import { readRecentSearches, rememberSearch } from '$lib/utils/recent-searches';
import SearchPage from './+page.svelte';

const {
  mockAfterNavigate,
  mockAssetMultiSelectManager,
  mockAuthManager,
  mockFeatureFlagsManager,
  mockGlobalSearchManager,
  mockGetPerson,
  mockPage,
  mockRegisterSelectionContext,
  mockSearchAssets,
  mockSearchAssetStatistics,
  mockSearchPerson,
  mockSearchSmart,
} = vi.hoisted(() => ({
  mockAfterNavigate: vi.fn(),
  mockAssetMultiSelectManager: {
    selectionActive: false,
    assets: [],
    clear: vi.fn(),
    isAllArchived: false,
    isAllFavorite: false,
    isAllUserOwned: true,
    selectAssets: vi.fn(),
  },
  mockAuthManager: {
    preferences: { tags: { enabled: true } },
  },
  mockFeatureFlagsManager: {
    value: { smartSearch: false },
  },
  mockGlobalSearchManager: {
    open: vi.fn(),
    mode: 'smart' as string,
    mlHealthy: true,
    setMode: vi.fn(),
  },
  mockGetPerson: vi.fn(),
  mockPage: {
    url: new URL('https://gallery.test/search'),
    route: { id: '/(user)/search/[[photos=photos]]/[[assetId=id]]' },
    params: {},
  },
  mockRegisterSelectionContext: vi.fn(),
  mockSearchAssets: vi.fn(),
  mockSearchAssetStatistics: vi.fn(),
  mockSearchPerson: vi.fn(),
  mockSearchSmart: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  afterNavigate: mockAfterNavigate,
  goto: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$app/state', () => ({ page: mockPage }));

vi.mock('$lib/components/ActionMenuItem.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

// Local Omarchy layer: the page lives in the shell (UserPageLayout); the bar stub renders what the page puts in the one
// bar (its query field), as the real bar does
vi.mock('$lib/components/omarchy/OmarchyBar.svelte', async () => {
  const module = await import('@test-data/mocks/omarchy-bar-rail-aware.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/UserSidebar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/OnEvents.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/LoadingSpinner.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/context-menu/ButtonContextMenu.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/ControlAppBar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte', async () => {
  const { default: MockComponent } = await import('./mock-gallery-viewer.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/AssetSelectControlBar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ArchiveAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ChangeDateAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ChangeDescriptionAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ChangeLocationAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/CreateSharedLinkAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/DeleteAssetsAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/DownloadAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/FavoriteAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/RotateAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/SetVisibilityAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/TagAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuthManager }));

vi.mock('$lib/managers/command-context-manager.svelte', () => ({
  registerSelectionContext: mockRegisterSelectionContext,
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: mockFeatureFlagsManager,
}));

vi.mock('$lib/managers/global-search-manager.svelte', () => ({
  globalSearchManager: mockGlobalSearchManager,
}));

vi.mock('$lib/services/asset.service', () => ({
  getAssetBulkActions: vi.fn(() => ({})),
}));

vi.mock('$lib/utils/navigation', () => ({
  isAlbumsRoute: vi.fn(() => false),
  isPeopleRoute: vi.fn(() => false),
}));

vi.mock('$lib/utils/timeline-util', () => ({
  isTimelineAsset: vi.fn(Boolean),
  isTimelineAssets: vi.fn((assets) => Array.isArray(assets)),
  toTimelineAsset: vi.fn((asset) => asset),
}));

vi.mock('@immich/sdk', async () => {
  const actual = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return {
    ...actual,
    getPerson: mockGetPerson,
    getTagById: vi.fn().mockResolvedValue({ value: 'Tag' }),
    searchAssets: mockSearchAssets,
    searchAssetStatistics: mockSearchAssetStatistics,
    searchPerson: mockSearchPerson,
    searchSmart: mockSearchSmart,
  };
});

function makeAsset(overrides: Partial<AssetResponseDto> = {}): AssetResponseDto {
  return {
    id: 'asset-1',
    ownerId: 'user-1',
    visibility: AssetVisibility.Timeline,
    isFavorite: false,
    isTrashed: false,
    fileCreatedAt: '2026-01-01T00:00:00.000Z',
    localDateTime: '2026-01-01T00:00:00.000Z',
    type: 'IMAGE',
    ...overrides,
  } as AssetResponseDto;
}

// the page's words in English, so the tests read what a person reads (the counts among them)
beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US' });
  await waitLocale('en-US');
});

const searchUrl = (terms: Record<string, unknown>) =>
  new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${encodeURIComponent(JSON.stringify(terms))}`);

const searchedTerms = () => {
  const url = vi.mocked(goto).mock.calls.at(-1)?.[0] as string;
  return JSON.parse(new URL(url, 'https://gallery.test').searchParams.get(QueryParameter.QUERY) ?? '{}') as unknown;
};

function renderPage() {
  return render(TestWrapper as Component<{ component: typeof SearchPage; componentProps: Record<string, never> }>, {
    component: SearchPage,
    componentProps: {},
  });
}

describe('Search page cmdk selection context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    mockFeatureFlagsManager.value.smartSearch = false;
    mockGlobalSearchManager.mode = 'smart';
    mockPage.url = new URL('https://gallery.test/search');
    mockSearchAssetStatistics.mockResolvedValue({ total: 1 });
    mockSearchAssets.mockResolvedValue({
      albums: { items: [] },
      assets: { items: [makeAsset()], nextPage: null },
    });
    mockGetPerson.mockResolvedValue({ name: 'Person' });
    mockSearchPerson.mockResolvedValue([]);
    mockSearchSmart.mockResolvedValue({
      albums: { items: [] },
      assets: { items: [], nextPage: null },
    });
  });

  it('registers add-to-album and visible toolbar callbacks', () => {
    renderPage();

    expect(mockRegisterSelectionContext).toHaveBeenCalledOnce();
    const options = mockRegisterSelectionContext.mock.calls[0][0];
    expect(options.getAssets()).toBe(mockAssetMultiSelectManager.assets);
    expect(options.canAddToAlbum()).toBe(true);
    expect(options.getOnFavorite()).toEqual(expect.any(Function));
    expect(options.getOnArchive()).toEqual(expect.any(Function));
    expect(options.getOnDelete()).toEqual(expect.any(Function));
    expect(options.getOnUndoDelete()).toEqual(expect.any(Function));
    expect(options.getAddSelectedToCurrentSpace?.()).toBeUndefined();
  });

  it('removes archived rows when the active visibility filter excludes archived assets', async () => {
    const query = encodeURIComponent(JSON.stringify({ visibility: AssetVisibility.Timeline }));
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${query}`);

    renderPage();

    await waitFor(() => expect(screen.getByTestId('asset-row-asset-1')).toBeInTheDocument());
    const options = mockRegisterSelectionContext.mock.calls[0][0];

    options.getOnArchive()(['asset-1'], AssetVisibility.Archive);

    await waitFor(() => expect(screen.queryByTestId('asset-row-asset-1')).not.toBeInTheDocument());
  });

  it('enables GalleryViewer grouping for legacy search result grids', async () => {
    mockPage.url = searchUrl({ city: 'Berlin' });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('gallery-viewer')).toHaveAttribute('data-enable-grouping', 'true'));
  });

  // #830: "Show similar photos" on a photo shared through a Space returned nothing for a member
  // who does not own it — the page searched only the caller's own (and partner) assets, so the
  // space owner got a long list and every other member got zero. Global search on this page has to
  // cover shared-space content the way the command palette already does (#894).
  it('includes shared spaces when searching by a reference asset', async () => {
    mockFeatureFlagsManager.value.smartSearch = true;
    const query = encodeURIComponent(JSON.stringify({ queryAssetId: 'asset-1' }));
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${query}`);

    renderPage();

    await waitFor(() => {
      expect(mockSearchSmart).toHaveBeenCalledWith({
        smartSearchDto: expect.objectContaining({ queryAssetId: 'asset-1', withSharedSpaces: true }),
      });
    });
  });

  // A hand-typed or shared `/search?query=beach` is plain text, not the JSON the page writes itself.
  // JSON.parse used to throw on it and blank the whole page.
  it('treats a plain-text query parameter as a smart search instead of crashing', async () => {
    mockFeatureFlagsManager.value.smartSearch = true;
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=beach`);

    renderPage();

    await waitFor(() => {
      expect(mockSearchSmart).toHaveBeenCalledWith({
        smartSearchDto: expect.objectContaining({ query: 'beach' }),
      });
    });
  });

  it('treats non-object JSON in the query parameter as text', async () => {
    mockFeatureFlagsManager.value.smartSearch = true;
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=42`);

    renderPage();

    await waitFor(() => {
      expect(mockSearchSmart).toHaveBeenCalledWith({
        smartSearchDto: expect.objectContaining({ query: '42' }),
      });
    });
  });

  it('includes shared spaces for metadata searches', async () => {
    const query = encodeURIComponent(JSON.stringify({ city: 'Berlin' }));
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${query}`);

    renderPage();

    await waitFor(() => {
      expect(mockSearchAssets).toHaveBeenCalledWith({
        metadataSearchDto: expect.objectContaining({ city: 'Berlin', withSharedSpaces: true }),
      });
    });
  });

  // The server rejects `spaceId` + `withSharedSpaces` together with a 400, so a space-scoped URL
  // must not pick up the global default.
  it('omits shared spaces when the search is already scoped to one space', async () => {
    mockFeatureFlagsManager.value.smartSearch = true;
    const query = encodeURIComponent(JSON.stringify({ query: 'beach', spaceId: 'space-1' }));
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${query}`);

    renderPage();

    await waitFor(() => expect(mockSearchSmart).toHaveBeenCalled());
    expect(mockSearchSmart.mock.calls[0][0].smartSearchDto).not.toHaveProperty('withSharedSpaces');
  });

  it('lets an explicit withSharedSpaces:false in the URL win over the default', async () => {
    const query = encodeURIComponent(JSON.stringify({ city: 'Berlin', withSharedSpaces: false }));
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${query}`);

    renderPage();

    await waitFor(() => {
      expect(mockSearchAssets).toHaveBeenCalledWith({
        metadataSearchDto: expect.objectContaining({ withSharedSpaces: false }),
      });
    });
  });

  it('resolves scoped person filter chips from shared people search', async () => {
    const query = encodeURIComponent(
      JSON.stringify({ personIds: ['space-person:space-person-1'], withSharedSpaces: true }),
    );
    mockPage.url = new URL(`https://gallery.test/search?${QueryParameter.QUERY}=${query}`);
    mockSearchPerson.mockResolvedValue([
      {
        id: 'space-person-1',
        name: 'Pierre',
        filterId: 'space-person:space-person-1',
        primaryProfile: { type: 'space-person', id: 'space-person-1', spaceId: 'space-1' },
      },
    ]);

    renderPage();

    await waitFor(() => {
      expect(mockSearchAssets).toHaveBeenCalledWith({
        metadataSearchDto: expect.objectContaining({
          personIds: ['space-person:space-person-1'],
          withSharedSpaces: true,
        }),
      });
    });
    await waitFor(() => expect(screen.getByText('Pierre')).toBeInTheDocument());
    expect(screen.queryByText('withSharedSpaces')).not.toBeInTheDocument();
    expect(mockGetPerson).not.toHaveBeenCalledWith({ id: 'space-person:space-person-1' });
  });
});

// Local Omarchy layer: the page lives in the shell (2026-10-15). Its query is a field in the one bar that searches
// again in place, beside the palette's mode control; the other terms are chips; the bar says how many results there are.
describe('Search page in the shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    mockFeatureFlagsManager.value.smartSearch = true;
    mockGlobalSearchManager.mode = 'smart';
    mockPage.url = new URL('https://gallery.test/search');
    mockSearchAssets.mockResolvedValue({ albums: { items: [] }, assets: { items: [makeAsset()], nextPage: null } });
    mockSearchSmart.mockResolvedValue({ albums: { items: [] }, assets: { items: [makeAsset()], nextPage: '2' } });
    mockSearchAssetStatistics.mockResolvedValue({ total: 42 });
    mockGetPerson.mockResolvedValue({ name: 'Person' });
    mockSearchPerson.mockResolvedValue([]);
  });

  const field = () => screen.getByRole('searchbox', { name: 'Search your photos' });

  it('says how to search, and searches nothing, before anything is asked', async () => {
    renderPage();

    expect(await screen.findByTestId('search-empty')).toBeInTheDocument();
    expect(field()).toHaveValue('');
    expect(mockSearchAssets).not.toHaveBeenCalled();
    expect(mockSearchSmart).not.toHaveBeenCalled();
  });

  // Local Omarchy layer: a bare search offers this account's searches from before (this browser alone, never sent
  // anywhere, cleared by Clear) and a few the archive answers well
  describe('a bare search', () => {
    beforeEach(() => {
      localStorage.clear();
      Object.assign(mockAuthManager, { authenticated: true, user: { id: 'me' } });
    });
    afterEach(() => {
      Object.assign(mockAuthManager, { authenticated: undefined, user: undefined });
    });

    it('keeps a search with words as it runs, with its other terms', async () => {
      mockPage.url = searchUrl({ ocr: 'Happy birthday', city: 'Oslo' });
      renderPage();

      await waitFor(() => expect(mockSearchAssets).toHaveBeenCalled());
      expect(readRecentSearches('me')).toEqual([
        expect.objectContaining({
          text: 'Happy birthday',
          mode: 'ocr',
          terms: { ocr: 'Happy birthday', city: 'Oslo' },
        }),
      ]);
    });

    it('offers the searches run here before, each opening as it ran, and clears them', async () => {
      rememberSearch('me', { text: 'beach', mode: 'smart', terms: { query: 'beach' } }, 1);
      rememberSearch('me', { text: 'IMG_2041', mode: 'metadata', terms: { originalFileName: 'IMG_2041' } }, 2);
      renderPage();

      const items = await screen.findAllByTestId('search-recent-item');
      expect(items.map((item) => item.textContent?.replaceAll(/\s+/g, ' ').trim())).toEqual([
        'IMG_2041 Filename',
        'beach',
      ]);
      expect(items[1]).toHaveAttribute(
        'href',
        `/search?query=${encodeURIComponent(JSON.stringify({ query: 'beach' }))}`,
      );

      await fireEvent.click(screen.getByRole('button', { name: 'Clear all recent searches' }));

      expect(screen.queryByTestId('search-recent')).not.toBeInTheDocument();
      expect(readRecentSearches('me')).toEqual([]);
      expect(mockSearchAssets).not.toHaveBeenCalled();
      expect(mockSearchSmart).not.toHaveBeenCalled();
    });

    it('offers nothing to repeat before the first search, and a few searches the archive answers well', async () => {
      renderPage();

      expect(await screen.findByTestId('search-examples')).toBeInTheDocument();
      expect(screen.queryByTestId('search-recent')).not.toBeInTheDocument();
      const examples = screen.getAllByRole('link', { name: /sunset at the beach|birthday cake|snow|temple|dog/ });
      expect(examples).toHaveLength(5);
      expect(examples[0]).toHaveAttribute(
        'href',
        `/search?query=${encodeURIComponent(JSON.stringify({ query: 'sunset at the beach' }))}`,
      );
    });
  });

  it('puts the text in the field and every other term in a chip', async () => {
    mockPage.url = searchUrl({ query: 'beach', city: 'Berlin' });

    renderPage();

    expect(field()).toHaveValue('beach');
    expect(await screen.findByText('Berlin')).toBeInTheDocument();
    expect(screen.queryByText('Context')).not.toBeInTheDocument();
  });

  it('searches the edited text in place on Enter, keeping the other terms', async () => {
    mockPage.url = searchUrl({ query: 'beach', city: 'Berlin' });
    renderPage();

    await fireEvent.input(field(), { target: { value: 'sunset' } });
    await fireEvent.submit(field().closest('form')!);

    await waitFor(() => expect(goto).toHaveBeenCalled());
    expect(searchedTerms()).toEqual({ city: 'Berlin', query: 'sunset' });
    expect(vi.mocked(goto).mock.calls.at(-1)?.[1]).toMatchObject({ keepFocus: true });
  });

  it('searches the text in the mode picked beside the field, which the palette then keeps', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockPage.url = searchUrl({ query: 'beach' });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Search mode: Smart' }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent?.trim())).toEqual([
      'Smart',
      'Filename',
      'Description',
      'OCR',
    ]);
    await user.click(screen.getByRole('menuitemradio', { name: 'OCR' }));

    await waitFor(() => expect(goto).toHaveBeenCalled());
    expect(searchedTerms()).toEqual({ ocr: 'beach' });
    expect(mockGlobalSearchManager.setMode).toHaveBeenCalledWith('ocr');
  });

  it('counts a search the statistics endpoint can count, and offers to add every result', async () => {
    mockPage.url = searchUrl({ city: 'Berlin' });
    mockSearchAssets.mockResolvedValue({ albums: { items: [] }, assets: { items: [makeAsset()], nextPage: '2' } });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('search-result-count')).toHaveTextContent('42 photos'));
    expect(mockSearchAssetStatistics).toHaveBeenCalledWith(
      { statisticsSearchDto: { visibility: AssetVisibility.Timeline, withSharedSpaces: true, city: 'Berlin' } },
      expect.anything(),
    );
    // Local Omarchy layer: right beside the count it adds, saying what it does; its name says both
    const addAll = screen.getByTestId('add-all-to-collection');
    expect(screen.getByTestId('search-result-count').nextElementSibling).toBe(addAll);
    expect(addAll).toHaveTextContent('Add all to…');
    expect(addAll).toHaveAccessibleName('Add all 42 photos to…');
  });

  it('counts a smart search by what has loaded, with a + while more follow, and offers no "add all"', async () => {
    mockPage.url = searchUrl({ query: 'beach' });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('search-result-count')).toHaveTextContent('1+ photos'));
    expect(mockSearchAssetStatistics).not.toHaveBeenCalled();
    expect(screen.queryByTestId('add-all-to-collection')).not.toBeInTheDocument();
  });

  it('offers a smart search when a field mode finds nothing', async () => {
    mockPage.url = searchUrl({ ocr: 'zzqxv' });
    mockSearchAssets.mockResolvedValue({ albums: { items: [] }, assets: { items: [], nextPage: null } });
    renderPage();

    expect(await screen.findByTestId('search-no-results')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: "Search by what's in the photos" }));

    await waitFor(() => expect(goto).toHaveBeenCalled());
    expect(searchedTerms()).toEqual({ query: 'zzqxv' });
  });

  it('takes a chip away and keeps the rest of the search', async () => {
    mockPage.url = searchUrl({ query: 'beach', city: 'Berlin' });
    renderPage();

    await fireEvent.click(await screen.findByRole('button', { name: 'Remove filter' }));

    expect(searchedTerms()).toEqual({ query: 'beach' });
  });

  it('takes an edit back on Escape', async () => {
    mockPage.url = searchUrl({ query: 'beach' });
    renderPage();

    await fireEvent.input(field(), { target: { value: 'sunset' } });
    await fireEvent.keyDown(field(), { key: 'Escape' });

    expect(field()).toHaveValue('beach');
    expect(goto).not.toHaveBeenCalled();
  });
});
