import type { AlbumResponseDto } from '@immich/sdk';
import { fireEvent, render } from '@testing-library/svelte';
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import TimelineKeyboardActions from './TimelineKeyboardActions.svelte';

// Local Omarchy layer: a special album's key (B To do, V Villa) acts on the selection, or with nothing selected on the
// photo under the pointer or keyboard focus, and inside that album takes photos out (managers/special-albums)
const { authManagerMock, todo, villa } = vi.hoisted(() => {
  const special = (key: string, shortcut: string) => {
    const albumId = `${key}-album`;
    return {
      key,
      shortcut,
      albumId,
      isAlbum: (id?: string | null) => !!id && id === albumId,
      move: vi.fn((assets: { id: string }[]) => Promise.resolve({ archived: assets.map(({ id }) => id), added: [] })),
      done: vi.fn(() => Promise.resolve({ back: [], removed: [] })),
    };
  };
  return {
    authManagerMock: { authenticated: true, user: { id: 'me' }, params: {} },
    todo: special('omarchy-todo', 'b'),
    villa: special('omarchy-villa', 'v'),
  };
});

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: authManagerMock }));
vi.mock('$lib/managers/special-albums.svelte', () => ({
  specialAlbums: [todo, villa],
  offeredSpecialAlbums: () => [todo, villa],
  specialAlbumOf: (id?: string | null) => [todo, villa].find((album) => album.isAlbum(id)),
}));

describe('TimelineKeyboardActions: special album keys', () => {
  const mine = { id: 'mine', ownerId: 'me', visibility: 'timeline' } as TimelineAsset;
  const theirs = { id: 'theirs', ownerId: 'partner', visibility: 'timeline' } as TimelineAsset;

  const setup = ({ selected = [] as TimelineAsset[], album = null as AlbumResponseDto | null } = {}) => {
    const timelineManager = {
      isInitialized: true,
      months: [{}],
      getTimelineMonthByAssetId: (id: string) => ({
        findAssetById: () => [mine, theirs].find((asset) => asset.id === id),
      }),
      update: vi.fn(),
    } as unknown as TimelineManager;
    const assetInteraction = {
      selectionActive: selected.length > 0,
      assets: selected,
      getOwnedAssets: () => selected,
      clear: vi.fn(),
    } as unknown as AssetMultiSelectManager;
    render(TimelineKeyboardActions, { timelineManager, assetInteraction, scrollToAsset: () => false, album });
    return { timelineManager, assetInteraction };
  };

  const tileFor = (asset: TimelineAsset) => {
    const tile = document.createElement('div');
    tile.dataset.asset = asset.id;
    tile.dataset.thumbnailFocusContainer = '';
    tile.tabIndex = 0;
    document.body.append(tile);
    tile.focus();
    return tile;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it('moves the selection into To do with B and clears it', async () => {
    const { assetInteraction, timelineManager } = setup({ selected: [mine] });
    await fireEvent.keyDown(document, { key: 'b' });
    await vi.waitFor(() => expect(assetInteraction.clear).toHaveBeenCalled());
    expect(todo.move).toHaveBeenCalledWith([mine]);
    expect(timelineManager.update).toHaveBeenCalledWith(['mine'], expect.any(Function));
  });

  it('moves the photo keyboard focus is on into Villa with V when nothing is selected', async () => {
    setup();
    await fireEvent.keyDown(tileFor(mine), { key: 'v' });
    await vi.waitFor(() => expect(villa.move).toHaveBeenCalledWith([mine]));
    expect(todo.move).not.toHaveBeenCalled();
  });

  it("sends someone else's photo by its id alone, so the album can say it can't take it", async () => {
    setup();
    await fireEvent.keyDown(tileFor(theirs), { key: 'b' });
    await vi.waitFor(() => expect(todo.move).toHaveBeenCalledWith([{ id: 'theirs' }]));
  });

  it('takes the selection out inside the album', async () => {
    const { assetInteraction } = setup({ selected: [mine], album: { id: todo.albumId } as AlbumResponseDto });
    await fireEvent.keyDown(document, { key: 'b' });
    await vi.waitFor(() => expect(todo.done).toHaveBeenCalledWith([mine]));
    expect(todo.move).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(assetInteraction.clear).toHaveBeenCalled());
  });

  it('does nothing with nothing selected and no photo pointed at', async () => {
    setup();
    await fireEvent.keyDown(document, { key: 'v' });
    expect(villa.move).not.toHaveBeenCalled();
  });
});
