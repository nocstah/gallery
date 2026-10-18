// Local Omarchy layer: Remove memory and Remove photo can be taken back (managers/memory-manager, DESIGN.md Memories).
// A memory leaves the page at once and Gallery deletes it only once its toast has gone, so the toast's Undo puts it back
// exactly; an Undo after that makes it again from what it held. A photo is taken out of a memory at once and added
// back. Every Gallery call here is a mock: no memory is touched.
import { AssetTypeEnum, BulkIdErrorReason, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { goto } from '$app/navigation';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { memoryManager } from '$lib/managers/memory-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { assetFactory } from '@test-data/factories/asset-factory';
import { reactivePageMock as mockPage } from '@test-data/mocks/reactive-page.mock.svelte';

const ROUTE = '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]';

const auth = vi.hoisted(() => ({
  // not signed in while the manager is made, so it loads nothing by itself; signed in for each test
  authManager: { authenticated: false, user: { id: 'me', isAdmin: false }, params: {} },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => auth);

vi.mock('$app/state', async () => {
  const { reactivePageMock } = await import('@test-data/mocks/reactive-page.mock.svelte');
  return { page: reactivePageMock };
});

// a navigation moves the page, as the router would, so the manager can tell where it is
vi.mock('$app/navigation', () => ({
  goto: vi.fn(async (href: string) => {
    const { reactivePageMock } = await import('@test-data/mocks/reactive-page.mock.svelte');
    const url = new URL(href, 'https://gallery.test');
    const id = url.pathname.split('/', 3)[2];
    reactivePageMock.reset(url.href, {
      routeId: id ? '/(user)/memories/[id]/[[photos=photos]]/[[assetId=id]]' : '/(user)/memories',
      params: id ? { id } : {},
    });
  }),
}));

vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { primary: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() },
}));

/** a memory of the photos given, each a day apart in one month of `year`, so each memory is a card of its own */
const memory = (id: string, year: number, photos: string[], overrides: Partial<MemoryResponseDto> = {}) =>
  ({
    id,
    assets: photos.map((photo, index) =>
      assetFactory.build({
        id: photo,
        type: AssetTypeEnum.Image,
        localDateTime: `${year}-05-0${index + 1}T10:00:00.000Z`,
        fileCreatedAt: `${year}-05-0${index + 1}T10:00:00.000Z`,
      }),
    ),
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
    ownerId: 'me',
    type: MemoryType.OnThisDay,
    data: { year },
    isSaved: false,
    memoryAt: `${year}-10-18T00:00:00.000Z`,
    showAt: '2026-10-18T00:00:00.000Z',
    hideAt: '2099-10-18T23:59:59.999Z',
    seenAt: '2026-10-18T08:00:00.000Z',
    ...overrides,
  }) as MemoryResponseDto;

const ids = () => memoryManager.memories.map(({ id }) => id);
const photosOf = (id: string) =>
  memoryManager.memories.find((candidate) => candidate.id === id)?.assets.map((a) => a.id);
const open = (id: string, assetId: string) =>
  mockPage.reset(`https://gallery.test/memories/${id}?assetId=${assetId}`, { routeId: ROUTE, params: { id } });

describe('removing a memory, and taking it back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.authManager.authenticated = true;
    undoManager.entries = [];
    sdkMock.deleteMemory.mockResolvedValue(undefined as never);
    sdkMock.removeMemoryAssets.mockImplementation(({ bulkIdsDto }) =>
      Promise.resolve(bulkIdsDto.ids.map((id) => ({ id, success: true }))),
    );
    sdkMock.addMemoryAssets.mockImplementation(({ bulkIdsDto }) =>
      Promise.resolve(bulkIdsDto.ids.map((id) => ({ id, success: true }))),
    );
    memoryManager.memories = [
      memory('m-2019', 2019, ['a', 'b', 'c']),
      memory('m-2015', 2015, ['d', 'e']),
      memory('m-2010', 2010, ['f']),
    ];
    open('m-2015', 'd');
  });

  afterEach(async () => {
    // whatever a test left held is let go of before the next one
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    auth.authManager.authenticated = false;
  });

  it('takes the memory off the page at once and deletes it only once its toast has gone', async () => {
    await memoryManager.deleteCurrentMemory('May 2015');

    expect(goto).toHaveBeenCalledWith('/memories/m-2010?assetId=f', expect.anything());
    expect(ids()).toEqual(['m-2019', 'm-2010']);
    expect(toastManager.primary).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'memory_removed_titled' }),
      { timeout: 8000 },
    );
    expect(undoManager.entries).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(8000);
    expect(sdkMock.deleteMemory).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(sdkMock.deleteMemory).toHaveBeenCalledExactlyOnceWith({ id: 'm-2015' }, undefined);
  });

  it('puts it back exactly, deleting nothing, when Undo comes while the toast shows, and the film goes back to it', async () => {
    await memoryManager.deleteCurrentMemory('May 2015');
    await undoManager.undo();

    expect(ids()).toEqual(['m-2019', 'm-2015', 'm-2010']);
    expect(photosOf('m-2015')).toEqual(['d', 'e']);
    expect(mockPage.url.pathname).toBe('/memories/m-2015');
    expect(mockPage.url.searchParams.get('assetId')).toBe('d');
    expect(toastManager.primary).toHaveBeenLastCalledWith('undone');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sdkMock.deleteMemory).not.toHaveBeenCalled();
    expect(sdkMock.createMemory).not.toHaveBeenCalled();
  });

  it('makes it again from what it held when Undo comes after the deletion, in its place', async () => {
    sdkMock.createMemory.mockImplementation(({ memoryCreateDto }) =>
      Promise.resolve(memory('m-made', 2015, memoryCreateDto.assetIds ?? [])),
    );
    await memoryManager.deleteCurrentMemory('May 2015');
    await vi.advanceTimersByTimeAsync(8500);
    expect(sdkMock.deleteMemory).toHaveBeenCalledOnce();

    await undoManager.undo();

    expect(sdkMock.createMemory).toHaveBeenCalledExactlyOnceWith({
      memoryCreateDto: {
        type: MemoryType.OnThisDay,
        data: { year: 2015 },
        memoryAt: '2015-10-18T00:00:00.000Z',
        showAt: '2026-10-18T00:00:00.000Z',
        hideAt: '2099-10-18T23:59:59.999Z',
        seenAt: '2026-10-18T08:00:00.000Z',
        isSaved: false,
        assetIds: ['d', 'e'],
      },
    });
    expect(ids()).toEqual(['m-2019', 'm-made', 'm-2010']);
    // the film goes back to the photo it was on, in the memory made again
    expect(mockPage.url.pathname).toBe('/memories/m-made');
    expect(mockPage.url.searchParams.get('assetId')).toBe('d');
  });

  it('says how many photos Gallery did not take back in', async () => {
    sdkMock.createMemory.mockResolvedValue(memory('m-made', 2015, ['d']));
    await memoryManager.deleteCurrentMemory();
    await vi.advanceTimersByTimeAsync(8500);

    await undoManager.undo();

    expect(toastManager.primary).toHaveBeenLastCalledWith('undone. memory_photos_not_restored');
  });

  it('removes every memory of a card of several, and puts each back', async () => {
    // two memories that read the same (one place and month) are one card
    memoryManager.memories = [
      memory('m-2019', 2019, ['a']),
      memory('day-3', 2015, ['d', 'e']),
      memory('day-4', 2015, ['g'], { data: { year: 2015 } }),
      memory('m-2010', 2010, ['f']),
    ];
    open('day-3', 'd');
    expect(new Set(memoryManager.current?.card.members.map(({ id }) => id))).toEqual(new Set(['day-3', 'day-4']));

    await memoryManager.deleteCurrentMemory();
    expect(ids()).toEqual(['m-2019', 'm-2010']);

    await undoManager.undo();
    expect(ids()).toEqual(['m-2019', 'day-3', 'day-4', 'm-2010']);
    expect(sdkMock.deleteMemory).not.toHaveBeenCalled();
  });

  it('deletes at once, as the page goes, what its toast still holds', async () => {
    await memoryManager.deleteCurrentMemory();

    dispatchEvent(new Event('pagehide'));

    expect(sdkMock.deleteMemory).toHaveBeenCalledExactlyOnceWith({ id: 'm-2015' }, { keepalive: true });
    await vi.advanceTimersByTimeAsync(8500);
    expect(sdkMock.deleteMemory).toHaveBeenCalledOnce();
  });

  it('leaves a memory a removal still holds out of a page loaded meanwhile', async () => {
    sdkMock.searchMemories.mockResolvedValue([memory('m-2015', 2015, ['d', 'e'])]);
    sdkMock.memoriesStatistics.mockResolvedValue({ total: 3 });
    await memoryManager.deleteCurrentMemory();

    await memoryManager.refresh();

    expect(ids()).toEqual(['m-2019', 'm-2010']);
  });

  it('puts the memory back on the page and says so when Gallery would not delete it', async () => {
    sdkMock.deleteMemory.mockRejectedValue(new Error('offline'));
    await memoryManager.deleteCurrentMemory();

    await vi.advanceTimersByTimeAsync(8500);

    expect(ids()).toEqual(['m-2019', 'm-2015', 'm-2010']);
    expect(toastManager.danger).toHaveBeenCalledWith('errors.unable_to_remove_memory');
  });

  it('takes a photo out of a memory at once, and puts it back in its place', async () => {
    open('m-2019', 'b');

    await memoryManager.deleteCurrentAsset('May 2019');

    expect(sdkMock.removeMemoryAssets).toHaveBeenCalledExactlyOnceWith({ id: 'm-2019', bulkIdsDto: { ids: ['b'] } });
    expect(photosOf('m-2019')).toEqual(['a', 'c']);
    expect(mockPage.url.searchParams.get('assetId')).toBe('c');
    expect(toastManager.primary).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'memory_photo_removed_titled' }),
      { timeout: 8000 },
    );

    await undoManager.undo();

    expect(sdkMock.addMemoryAssets).toHaveBeenCalledExactlyOnceWith({ id: 'm-2019', bulkIdsDto: { ids: ['b'] } });
    expect(photosOf('m-2019')).toEqual(['a', 'b', 'c']);
    expect(mockPage.url.searchParams.get('assetId')).toBe('b');
  });

  it('counts a photo Gallery already holds again as put back', async () => {
    open('m-2019', 'b');
    sdkMock.addMemoryAssets.mockResolvedValue([{ id: 'b', success: false, error: BulkIdErrorReason.Duplicate }]);
    await memoryManager.deleteCurrentAsset();

    await undoManager.undo();

    expect(photosOf('m-2019')).toEqual(['a', 'b', 'c']);
    expect(undoManager.entries).toHaveLength(0);
  });

  it('keeps the Undo when Gallery will not take the photo back in, to try again', async () => {
    open('m-2019', 'b');
    sdkMock.addMemoryAssets.mockResolvedValue([{ id: 'b', success: false, error: BulkIdErrorReason.NoPermission }]);
    await memoryManager.deleteCurrentAsset();

    await undoManager.undo();

    expect(photosOf('m-2019')).toEqual(['a', 'c']);
    expect(undoManager.entries).toHaveLength(1);
    expect(toastManager.danger).toHaveBeenCalled();
  });

  it('holds a memory its last photo leaves as Remove memory does', async () => {
    open('m-2010', 'f');

    await memoryManager.deleteCurrentAsset();

    expect(sdkMock.removeMemoryAssets).not.toHaveBeenCalled();
    expect(ids()).toEqual(['m-2019', 'm-2015']);
    await vi.advanceTimersByTimeAsync(8500);
    expect(sdkMock.deleteMemory).toHaveBeenCalledExactlyOnceWith({ id: 'm-2010' }, undefined);
  });

  it('offers nothing, and removes nothing, of a memory someone else owns', async () => {
    memoryManager.memories = [memory('theirs', 2015, ['d', 'e'], { ownerId: 'partner' })];
    open('theirs', 'd');
    const card = memoryManager.current!.card;

    expect(memoryManager.removable(card)).toBe(false);
    expect(memoryManager.removable(card, 'd')).toBe(false);
    await memoryManager.deleteCurrentMemory();
    await memoryManager.deleteCurrentAsset();

    expect(goto).not.toHaveBeenCalled();
    expect(ids()).toEqual(['theirs']);
    expect(undoManager.entries).toHaveLength(0);
  });

  it('offers both on a memory of the account’s own', () => {
    const card = memoryManager.current!.card;

    expect(memoryManager.removable(card)).toBe(true);
    expect(memoryManager.removable(card, 'd')).toBe(true);
    expect(memoryManager.removable(card, 'a')).toBe(false);
  });
});
