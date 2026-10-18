import { AssetTypeEnum, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { memoryManager } from '$lib/managers/memory-manager.svelte';
import { assetFactory } from '@test-data/factories/asset-factory';
import { reactivePageMock as mockPage } from '@test-data/mocks/reactive-page.mock.svelte';
import MemoryViewer from './MemoryViewer.svelte';

// Ported from the fork's #790/#791 regression suite (deleted with the fork's own memory viewer,
// which the upstream route restructure replaces). Upstream scopes the viewer to one memory via
// `page.params.id` (see memory-manager.svelte.ts `#url`/`current`) instead of the fork's
// `memoryId` query param, so the fix is now structural. `memoryManager` is deliberately NOT
// mocked here: only its real lookup logic (keyed first by `page.params.id`, then narrowed to that
// memory's own assets) can prove the scoping still holds. Mocking `current` by hand would just
// assert whatever the test wrote into the mock.
const {
  mockAssetMultiSelectManager,
  mockAssetViewerManager,
  mockAuthManager,
  mockGetAssetInfo,
  mockRemoveMemoryAssets,
  mockUpdateMemory,
} = vi.hoisted(() => ({
  mockAssetMultiSelectManager: {
    selectionActive: false,
    assets: [],
    clear: vi.fn(),
    isAllFavorite: false,
    isAllArchived: false,
    isAllUserOwned: true,
    selectAssets: vi.fn(),
  },
  mockAssetViewerManager: {
    asset: undefined,
    isViewing: false,
    showAssetViewer: vi.fn(),
  },
  mockAuthManager: {
    // false so the real memoryManager singleton's constructor does not auto-`initialize()`
    // (which would call the real, unmocked `searchMemories`/`memoriesStatistics`).
    authenticated: false,
    params: {},
    preferences: { memories: { duration: 5 }, tags: { enabled: true } },
    // Local Omarchy layer: the memories here are this account's (Remove photo acts on the account's own only)
    user: { id: 'user-1', isAdmin: false },
  },
  mockGetAssetInfo: vi.fn(),
  mockRemoveMemoryAssets: vi.fn(() => Promise.resolve([])),
  mockUpdateMemory: vi.fn(() => Promise.resolve({})),
}));

// Must RESOLVE, not return undefined. The bail-out $effect below wraps its `goto` in
// `handlePromiseError(...)`, which calls `.catch()` on the return value -- so a bare `vi.fn()`
// makes any test that reaches that path die with "Cannot read properties of undefined (reading
// 'catch')" instead of asserting. That is why the effect had no coverage at all.
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

// A REACTIVE stand-in for $app/state's `page` -- memoryManager's `current` is `$derived.by(...)`
// off `page.params.id` / `page.url.searchParams`, so a non-reactive plain object would not
// re-trigger that derivation when a test reassigns `mockPage.params`/`mockPage.url`.
vi.mock('$app/state', async () => {
  const { reactivePageMock } = await import('@test-data/mocks/reactive-page.mock.svelte');
  return { page: reactivePageMock };
});

vi.mock('$lib/components/shared-components/context-menu/ButtonContextMenu.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/context-menu/MenuOption.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/gallery-viewer-props.stub.svelte');
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

vi.mock('$lib/components/timeline/actions/TagAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/AssetSelectControlBar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
}));

vi.mock('$lib/managers/asset-viewer-manager.svelte', () => ({
  assetViewerManager: mockAssetViewerManager,
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: mockAuthManager,
}));

// $lib/managers/memory-manager.svelte is intentionally left unmocked -- see the comment above.

vi.mock('$lib/services/asset.service', () => ({
  getAssetBulkActions: vi.fn(() => ({})),
}));

vi.mock('@immich/sdk', async () => {
  const actual = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return {
    ...actual,
    getAssetInfo: mockGetAssetInfo,
    removeMemoryAssets: mockRemoveMemoryAssets,
    updateMemory: mockUpdateMemory,
  };
});

function memory(id: string, assetIds: string[]): MemoryResponseDto {
  return {
    id,
    assets: assetIds.map((assetId) =>
      assetFactory.build({
        id: assetId,
        type: AssetTypeEnum.Image,
        localDateTime: '2015-08-03T00:00:00.000Z',
        fileCreatedAt: '2015-08-03T00:00:00.000Z',
      }),
    ),
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    deletedAt: undefined,
    ownerId: 'user-1',
    type: MemoryType.OnThisDay,
    data: { year: 2015 },
    isSaved: false,
    memoryAt: '2020-01-01T00:00:00.000Z',
    seenAt: undefined,
    showAt: '2020-01-01T00:00:00.000Z',
    hideAt: undefined,
  };
}

/**
 * A memory whose assets span several years, as an `on_this_day_place` card does. The plain
 * `memory()` helper above dates every asset the same day, which cannot distinguish "the memory's
 * first asset" from "the asset being viewed".
 */
function multiYearMemory(id: string, assets: { id: string; localDateTime: string }[]): MemoryResponseDto {
  return {
    ...memory(
      id,
      assets.map(({ id }) => id),
    ),
    assets: assets.map(({ id, localDateTime }) =>
      assetFactory.build({ id, type: AssetTypeEnum.Image, localDateTime, fileCreatedAt: localDateTime }),
    ),
    type: MemoryType.Rule,
    data: { ruleId: 'on_this_day_place', title: 'On this day in Berlin', context: { years: [2021, 2025] } },
  };
}

function renderViewer() {
  return render(TestWrapper as Component<{ component: typeof MemoryViewer; componentProps: Record<string, never> }>, {
    component: MemoryViewer,
    componentProps: {},
  });
}

/** All photos: the memory's photos as a grid, behind the film's button of that name. */
const openAllPhotos = async () => {
  await fireEvent.click(await screen.findByRole('button', { name: 'all_photos' }));
  return screen.findByTestId('gallery-viewer');
};

describe('MemoryViewer view in timeline (#1047)', () => {
  beforeEach(() => {
    memoryManager.memories = [memory('memory-1', ['memory-asset-1', 'memory-asset-2'])];
    mockPage.reset('https://gallery.test/memories/memory-1?assetId=memory-asset-1', {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: 'memory-1' },
    });
    mockGetAssetInfo.mockResolvedValue(memoryManager.memories[0].assets[0]);

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it('sends a photo from the viewer’s own library to the personal timeline', async () => {
    renderViewer();

    expect(await screen.findByLabelText('view_in_timeline')).toHaveAttribute('href', '/photos?at=memory-asset-1');
  });

  // The timeline collapses a stack to its primary asset, so a stack child has no tile of its
  // own to land on. That held for /photos before #1047 and has to keep holding for a Space.
  it('lands on the stack primary for a stacked photo in a Space', async () => {
    mockGetAssetInfo.mockResolvedValue({
      ...memoryManager.memories[0].assets[0],
      resolvedSpaceId: 'space-1',
      stack: { id: 'stack-1', primaryAssetId: 'stack-primary', assetCount: 2 },
    });

    renderViewer();

    expect(await screen.findByLabelText('view_in_timeline')).toHaveAttribute(
      'href',
      '/spaces/space-1?at=stack-primary',
    );
  });

  it('lands on the stack primary for a stacked photo in the personal library', async () => {
    mockGetAssetInfo.mockResolvedValue({
      ...memoryManager.memories[0].assets[0],
      stack: { id: 'stack-1', primaryAssetId: 'stack-primary', assetCount: 2 },
    });

    renderViewer();

    expect(await screen.findByLabelText('view_in_timeline')).toHaveAttribute('href', '/photos?at=stack-primary');
  });

  // #1047: a memory can hold a photo the viewer only reaches through a Space. The personal timeline
  // skips it unless that membership is shown in the timeline, so the jump used to scroll to the
  // right date and show nothing. The server resolves the space for exactly this case
  // (`resolvedSpaceId`, set only when the viewer is not the owner), so follow it.
  it('sends a photo the viewer only has through a Space to that Space timeline', async () => {
    mockGetAssetInfo.mockResolvedValue({ ...memoryManager.memories[0].assets[0], resolvedSpaceId: 'space-1' });

    renderViewer();

    expect(await screen.findByLabelText('view_in_timeline')).toHaveAttribute(
      'href',
      '/spaces/space-1?at=memory-asset-1',
    );
  });
});

describe('MemoryViewer memory-scoped navigation (#790)', () => {
  beforeEach(() => {
    // The same asset id appears in two memories (e.g. a birthday memory and an on-this-day
    // memory). This duplication is the only reason memory-scoped navigation is observable at
    // all -- without it, any implementation (correct or regressed) resolves the same way.
    //
    // Local Omarchy layer: memory-1 is the birthday, so the two do not read the same; memories that do are one card
    // and play as one film (utils/memory-cards, the describe block below).
    memoryManager.memories = [
      { ...memory('memory-1', ['dup-asset', 'm1-only']), type: MemoryType.Birthday, data: { year: 1990 } },
      memory('memory-2', ['dup-asset', 'm2-only']),
    ];

    // Route param names the memory; the query param names the asset within it -- upstream's
    // actual URL shape (Route.viewMemory -> `/memories/<id>?assetId=<assetId>`), not the fork's
    // `/memory?id=...&memoryId=...`.
    mockPage.reset('https://gallery.test/memories/memory-2?assetId=dup-asset', {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: 'memory-2' },
    });

    mockGetAssetInfo.mockResolvedValue(memoryManager.memories[1].assets[0]);

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it('resolves the viewer position within the memory from the url', async () => {
    const { container } = renderViewer();

    const galleryViewer = await openAllPhotos();

    // `current.memory.assets` (memoryManager.current, real derivation) feeds the gallery strip.
    // If the url ever resolved `dup-asset` against the wrong memory -- e.g. a regression back to
    // a global assetId lookup that ignores the memoryId route param -- this would show memory-1's
    // assets instead.
    expect(container.querySelector('[data-testid="asset-row-m2-only"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="asset-row-m1-only"]')).not.toBeInTheDocument();
    expect(galleryViewer).toHaveAttribute('data-asset-count', '2');
  });

  // Fork feature #625 (asset grouping in the gallery viewer). Upstream's viewer does not pass
  // `enableGrouping`, so the prop defaults to `false` and the grouping headers silently vanish
  // whenever this fork delta is dropped during a rebase. Asserting on the stub's
  // `data-enable-grouping` attribute makes that loss loud instead of silent.
  it('enables asset grouping on the memory gallery strip (#625)', async () => {
    renderViewer();

    const galleryViewer = await openAllPhotos();

    expect(galleryViewer).toHaveAttribute('data-enable-grouping', 'true');
  });

  // The film plays the memory the url names, and only it: the photo shared with memory-1 opens it, and the photo
  // made ready under it is memory-2's next, never memory-1's.
  it("plays the url's memory and no other's photos", async () => {
    const { container } = renderViewer();

    const film = await screen.findByTestId('memory-film');
    await waitFor(() => expect(container.querySelector('[data-asset-id="m2-only"]')).toBeInTheDocument());
    expect(container.querySelector('[data-asset-id="dup-asset"]')).toBeInTheDocument();
    expect(container.querySelector('[data-asset-id="m1-only"]')).not.toBeInTheDocument();
    expect(film).toHaveAttribute('data-position', '1');
  });
});

// Ported from the fork's #1029 regression suite, which was written against the fork's own memory
// viewer (deleted with `memory-viewer-source.ts`). The bug it guards is live on the adopted
// upstream viewer too: the date overlay used to read `current.memory.assets[0]`, so every asset in
// a memory showed the FIRST asset's date. That is invisible for an `on_this_day` memory (one year,
// one date) and wrong for an `on_this_day_place` memory, which covers every year the place recurs.
//
// `assetIndex` must stay memory-relative for the fix to hold -- memory-manager builds
// `assetIndexes` per memory (`memory.assets.map((asset, assetIndex) => ...)`), so an index across
// the concatenated viewer list would read another memory's asset or run off the end.
describe('MemoryViewer date overlay for a memory spanning years (#1029)', () => {
  const berlin = [
    { id: 'berlin-2021', localDateTime: '2021-08-26T13:48:33.000Z' },
    { id: 'berlin-2025', localDateTime: '2025-08-26T18:15:01.000Z' },
  ];

  const viewAsset = (memoryId: string, assetId: string) =>
    mockPage.reset(`https://gallery.test/memories/${memoryId}?assetId=${assetId}`, {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: memoryId },
    });

  beforeEach(() => {
    memoryManager.memories = [multiYearMemory('memory-1', berlin)];
    mockGetAssetInfo.mockResolvedValue(memoryManager.memories[0].assets[0]);

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it("shows the FIRST asset's date when it is the one being viewed", async () => {
    viewAsset('memory-1', 'berlin-2021');

    renderViewer();

    expect(await screen.findByText(/August 26, 2021/)).toBeInTheDocument();
    expect(screen.queryByText(/August 26, 2025/)).not.toBeInTheDocument();
  });

  it("shows the SECOND asset's own date, not the memory's first", async () => {
    viewAsset('memory-1', 'berlin-2025');

    renderViewer();

    expect(await screen.findByText(/August 26, 2025/)).toBeInTheDocument();
    expect(screen.queryByText(/August 26, 2021/)).not.toBeInTheDocument();
  });

  // `current` is `$derived.by()` off the reactive page mock, so reassigning the url is how the
  // viewed asset changes in production. A fresh render cannot prove the overlay reacts.
  it('updates the date when paging from the 2021 photo into the 2025 one', async () => {
    viewAsset('memory-1', 'berlin-2021');
    renderViewer();
    expect(await screen.findByText(/August 26, 2021/)).toBeInTheDocument();

    viewAsset('memory-1', 'berlin-2025');

    expect(await screen.findByText(/August 26, 2025/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/August 26, 2021/)).not.toBeInTheDocument());
  });

  it('indexes within the current memory, not across the whole viewer', async () => {
    // berlin-2025 is asset 1 of memory-2, but asset 3 counting from the start of the viewer.
    // Reading [0] gives 2021; a viewer-wide index would run off the end of memory-2.
    memoryManager.memories = [
      multiYearMemory('memory-1', [
        { id: 'paris-a', localDateTime: '2019-03-14T10:00:00.000Z' },
        { id: 'paris-b', localDateTime: '2019-03-14T11:00:00.000Z' },
      ]),
      multiYearMemory('memory-2', berlin),
    ];
    viewAsset('memory-2', 'berlin-2025');

    renderViewer();

    expect(await screen.findByText(/August 26, 2025/)).toBeInTheDocument();
    expect(screen.queryByText(/August 26, 2021/)).not.toBeInTheDocument();
    expect(screen.queryByText(/March 14, 2019/)).not.toBeInTheDocument();
  });
});

// The bail-out $effect: when the viewer has no `current` memory to show, it redirects back to the
// memories index. Upstream immich-31334 reduced its guard from
// `current || memoryManager.loading !== undefined` to a bare `if (current)`, which also removed
// the effect's only reactive dependency besides `current`. These tests pin the half that is
// unambiguously correct -- a mounted viewer with a resolvable memory must never navigate away --
// so a future rewrite cannot quietly reintroduce a redirect on the happy path.
//
// NOTE: the `clearCache()`-window ejection (an hourly refresh empties `memories` mid-session and
// the effect fires before the refetch returns) is a REAL open defect and is deliberately NOT
// asserted here; enshrining it would make the eventual fix look like a regression. Its regression
// test belongs with that fix.
describe('MemoryViewer bail-out effect', () => {
  beforeEach(() => {
    memoryManager.memories = [memory('memory-1', ['memory-asset-1', 'memory-asset-2'])];
    mockPage.reset('https://gallery.test/memories/memory-1?assetId=memory-asset-1', {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: 'memory-1' },
    });
    mockGetAssetInfo.mockResolvedValue(memoryManager.memories[0].assets[0]);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  it('does not navigate away while the memory resolves', async () => {
    renderViewer();

    await screen.findByTestId('memory-film');

    expect(goto).not.toHaveBeenCalled();
  });

  it('redirects to the memories index when the url names a memory that does not exist', async () => {
    mockPage.reset('https://gallery.test/memories/does-not-exist?assetId=memory-asset-1', {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: 'does-not-exist' },
    });

    renderViewer();

    await waitFor(() =>
      expect(goto).toHaveBeenCalledWith(
        memoryManager.memoriesHref,
        expect.objectContaining({ replaceState: true, noScroll: true }),
      ),
    );
  });
});

// The film's keys, through the page as a person presses them (film-keys.ts has the whole map).
describe('MemoryViewer film keys', () => {
  beforeEach(() => {
    memoryManager.memories = [memory('memory-1', ['memory-asset-1', 'memory-asset-2', 'memory-asset-3'])];
    mockPage.reset('https://gallery.test/memories/memory-1?assetId=memory-asset-1', {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: 'memory-1' },
    });
    mockGetAssetInfo.mockResolvedValue(memoryManager.memories[0].assets[0]);
  });

  const started = async () => {
    const film = await screen.findByTestId('memory-film');
    await waitFor(() => expect(film).toHaveAttribute('data-playing'));
    return film;
  };

  it('pauses and plays with Space', async () => {
    renderViewer();
    const film = await started();

    await fireEvent.keyDown(document, { key: ' ' });
    expect(film).not.toHaveAttribute('data-playing');
    expect(screen.getByRole('button', { name: 'play_memories' })).toBeInTheDocument();

    await fireEvent.keyDown(document, { key: ' ' });
    expect(film).toHaveAttribute('data-playing');
    expect(screen.getByRole('button', { name: 'pause_memories' })).toBeInTheDocument();
  });

  it('steps a photo on and back with the arrows', async () => {
    renderViewer();
    const film = await started();

    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(film).toHaveAttribute('data-position', '2');
    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(film).toHaveAttribute('data-position', '3');
    await fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(film).toHaveAttribute('data-position', '2');
  });

  it('closes with Escape', async () => {
    renderViewer();
    await started();

    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(goto).toHaveBeenCalledWith(memoryManager.memoriesHref);
  });

  it('leaves the keys to All photos while it shows', async () => {
    renderViewer();
    const film = await started();
    await openAllPhotos();

    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(film).toHaveAttribute('data-position', '1');
    expect(film).toHaveAttribute('hidden');
  });
});

// Local Omarchy layer: memories that read the same are one card (utils/memory-cards), and the film plays their photos
// as one, each once, in the order they were taken; the heart and Remove photo act on every memory of the card.
describe('MemoryViewer card of several memories', () => {
  const dated = (id: string, photos: [string, string][]): MemoryResponseDto => ({
    ...memory(
      id,
      photos.map(([assetId]) => assetId),
    ),
    assets: photos.map(([assetId, day]) =>
      assetFactory.build({
        id: assetId,
        type: AssetTypeEnum.Image,
        localDateTime: `${day}T10:00:00.000Z`,
        fileCreatedAt: `${day}T10:00:00.000Z`,
      }),
    ),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // two days of the same August, so both read "August 2015"
    memoryManager.memories = [
      dated('day-3', [
        ['b', '2015-08-03'],
        ['c', '2015-08-03'],
      ]),
      dated('day-2', [
        ['a', '2015-08-02'],
        ['b', '2015-08-03'],
      ]),
    ];
    mockPage.reset('https://gallery.test/memories/day-3?assetId=a', {
      routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
      params: { id: 'day-3' },
    });
    mockGetAssetInfo.mockResolvedValue(memoryManager.memories[1].assets[0]);
  });

  it('plays the photos of both, each once, in the order they were taken', async () => {
    const { container } = renderViewer();

    const grid = await openAllPhotos();
    expect(grid).toHaveAttribute('data-asset-count', '3');
    expect([...container.querySelectorAll('[data-testid^="asset-row-"]')].map((row) => row.textContent)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(memoryManager.current?.card.members.map(({ id }) => id)).toEqual(['day-3', 'day-2']);
  });

  it('takes a photo out of every memory of the card that holds it', async () => {
    mockAuthManager.authenticated = true;
    try {
      renderViewer();
      await screen.findByTestId('memory-film');
      mockPage.reset('https://gallery.test/memories/day-3?assetId=b', {
        routeId: '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]',
        params: { id: 'day-3' },
      });

      await memoryManager.deleteCurrentAsset();

      expect(mockRemoveMemoryAssets).toHaveBeenCalledWith({ id: 'day-3', bulkIdsDto: { ids: ['b'] } });
      expect(mockRemoveMemoryAssets).toHaveBeenCalledWith({ id: 'day-2', bulkIdsDto: { ids: ['b'] } });
    } finally {
      mockAuthManager.authenticated = false;
    }
  });

  it('keeps every memory of the card with the heart', async () => {
    renderViewer();
    await screen.findByTestId('memory-film');

    await memoryManager.toggleCurrentMemorySaved();

    expect(mockUpdateMemory).toHaveBeenCalledWith({ id: 'day-3', memoryUpdateDto: { isSaved: true } });
    expect(mockUpdateMemory).toHaveBeenCalledWith({ id: 'day-2', memoryUpdateDto: { isSaved: true } });
    expect(memoryManager.memories.every(({ isSaved }) => isSaved)).toBe(true);
  });
});
