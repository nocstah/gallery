import { AlbumUserRole, AssetOrder, type AlbumResponseDto, type BulkIdResponseDto } from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { albumFolders } from '$lib/managers/album-folders.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { mergeAlbum, pickAndMerge } from '$lib/utils/album-merge';
import { toastUndoable } from '$lib/utils/undoable';

const mocks = vi.hoisted(() => ({ url: new URL('http://localhost/albums'), goto: vi.fn() }));
vi.mock('$app/state', () => ({
  page: {
    get url() {
      return mocks.url;
    },
    params: {},
  },
}));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: true, user: { id: 'me' }, params: {} },
}));
vi.mock('$lib/managers/album-folders.svelte', () => ({
  albumFolders: { ready: vi.fn(), placeOf: vi.fn(), refile: vi.fn() },
}));
vi.mock('$lib/managers/special-albums.svelte', () => ({
  specialAlbums: [],
  specialAlbumOf: (id: string) => (id === 'todo' ? {} : undefined),
}));
vi.mock('$lib/utils/undoable', () => ({ toastUndoable: vi.fn() }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { primary: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), danger: vi.fn() },
  modalManager: { show: vi.fn(), showDialog: vi.fn() },
}));

const album = (id: string, overrides: Partial<AlbumResponseDto> = {}) =>
  ({
    id,
    albumName: id === 'source' ? 'Koh Kradan' : 'Thailand',
    description: 'two weeks on the island',
    createdAt: '2019-02-01T00:00:00.000Z',
    isActivityEnabled: false,
    order: AssetOrder.Asc,
    albumThumbnailAssetId: 'a2',
    assetCount: 3,
    shared: false,
    hasSharedLink: false,
    albumUsers: [{ user: { id: 'me' }, role: AlbumUserRole.Owner }],
    ...overrides,
  }) as AlbumResponseDto;

const source = album('source');
const target = album('target');
const place = { folderId: 'trips', hidden: true };

const result = (id: string, success: boolean, error?: string) => ({ id, success, error }) as BulkIdResponseDto;

describe('album merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.url = new URL('http://localhost/albums');
    undoManager.entries = [];
    vi.mocked(albumFolders.placeOf).mockReturnValue(place);
    sdkMock.getTimeBuckets.mockResolvedValue([
      { timeBucket: '2019-02-01', count: 2 },
      { timeBucket: '2019-03-01', count: 1 },
    ]);
    sdkMock.getTimeBucket.mockImplementation(({ timeBucket }) =>
      Promise.resolve({ id: timeBucket === '2019-02-01' ? ['a1', 'a2'] : ['a3'] } as never),
    );
    // a2 is in the other album already
    sdkMock.addAssetsToAlbum.mockResolvedValue([
      result('a1', true),
      result('a2', false, 'duplicate'),
      result('a3', true),
    ]);
    sdkMock.createAlbum.mockResolvedValue(album('again'));
  });

  it('puts every photo in the other album, then deletes the album', async () => {
    const emit = vi.spyOn(eventManager, 'emit');

    expect(await mergeAlbum(source, target)).toBe(true);

    expect(sdkMock.addAssetsToAlbum).toHaveBeenCalledWith({ id: 'target', bulkIdsDto: { ids: ['a1', 'a2', 'a3'] } });
    expect(sdkMock.deleteAlbum).toHaveBeenCalledWith({ id: 'source' });
    expect(emit).toHaveBeenCalledWith('AlbumDelete', source);
    expect(emit).toHaveBeenCalledWith('AlbumAddAssets', { assetIds: ['a1', 'a3'], albumIds: ['target'] });
    expect(toastUndoable).toHaveBeenCalledTimes(1);
    expect(mocks.goto).not.toHaveBeenCalled();
  });

  it('keeps the album when a photo cannot join the other one, and takes back the ones that did', async () => {
    sdkMock.addAssetsToAlbum.mockResolvedValue([result('a1', true), result('a2', false, 'no_permission')]);

    expect(await mergeAlbum(source, target)).toBe(false);

    expect(sdkMock.removeAssetFromAlbum).toHaveBeenCalledWith({ id: 'target', bulkIdsDto: { ids: ['a1'] } });
    expect(sdkMock.deleteAlbum).not.toHaveBeenCalled();
    expect(toastManager.warning).toHaveBeenCalledTimes(1);
    expect(undoManager.entries).toHaveLength(0);
  });

  it('goes on to the other album first when merging from the album itself', async () => {
    mocks.url = new URL('http://localhost/albums/source');

    await mergeAlbum(source, target);

    expect(mocks.goto).toHaveBeenCalledWith('/albums/target');
    expect(mocks.goto.mock.invocationCallOrder[0]).toBeLessThan(sdkMock.deleteAlbum.mock.invocationCallOrder[0]);
  });

  it('undo makes the album again as it was and takes the photos it brought out of the other album', async () => {
    await mergeAlbum(source, target);
    const emit = vi.spyOn(eventManager, 'emit');

    await undoManager.undo();

    expect(sdkMock.createAlbum).toHaveBeenCalledWith({
      createAlbumDto: { albumName: 'Koh Kradan', description: 'two weeks on the island', assetIds: ['a1', 'a2', 'a3'] },
    });
    expect(sdkMock.updateAlbumInfo).toHaveBeenCalledWith({
      id: 'again',
      updateAlbumDto: {
        createdAt: '2019-02-01T00:00:00.000Z',
        isActivityEnabled: false,
        order: AssetOrder.Asc,
        albumThumbnailAssetId: 'a2',
      },
    });
    expect(albumFolders.refile).toHaveBeenCalledWith('again', place);
    // a2 was in the other album before the merge and stays there
    expect(sdkMock.removeAssetFromAlbum).toHaveBeenCalledWith({ id: 'target', bulkIdsDto: { ids: ['a1', 'a3'] } });
    expect(emit).toHaveBeenCalledWith('AlbumCreate', expect.objectContaining({ id: 'again' }));
    expect(vi.mocked(albumFolders.refile).mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[emit.mock.calls.findIndex(([name]) => name === 'AlbumCreate')],
    );
  });

  describe('pickAndMerge', () => {
    it('offers every album but itself, To do, Villa, QR and the ones I cannot add to', async () => {
      vi.mocked(modalManager.show).mockResolvedValue(undefined as never);

      expect(await pickAndMerge(source)).toBe(false);

      const { exclude } = vi.mocked(modalManager.show).mock.calls[0][1] as unknown as {
        exclude: (album: AlbumResponseDto) => boolean;
      };
      expect(exclude(source)).toBe(true);
      expect(exclude(album('todo'))).toBe(true);
      expect(
        exclude(album('theirs', { albumUsers: [{ user: { id: 'me' }, role: AlbumUserRole.Viewer }] as never })),
      ).toBe(true);
      expect(exclude(target)).toBe(false);
      expect(modalManager.showDialog).not.toHaveBeenCalled();
    });

    it('asks first, saying a shared album loses its link, and merges only on yes', async () => {
      vi.mocked(modalManager.show).mockResolvedValue([target] as never);
      vi.mocked(modalManager.showDialog).mockResolvedValue(false);

      expect(await pickAndMerge(album('source', { hasSharedLink: true }))).toBe(false);

      const { prompt } = vi.mocked(modalManager.showDialog).mock.calls[0][0] as { prompt: string };
      expect(prompt).toContain('album_merge_confirm');
      expect(prompt).toContain('album_merge_shared');
      expect(sdkMock.addAssetsToAlbum).not.toHaveBeenCalled();
    });
  });
});
