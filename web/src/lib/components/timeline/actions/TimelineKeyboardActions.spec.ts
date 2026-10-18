import type { AlbumResponseDto } from '@immich/sdk';
import { fireEvent, render } from '@testing-library/svelte';
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import type { TimelineAsset, TimelineGrouping } from '$lib/managers/timeline-manager/types';
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

// Local Omarchy layer: ↑ and ↓ move by the rows as they are drawn (utils/grid-rows), Home and End to the first and last
// photo; with no photo focused the keys are left to the page
describe('TimelineKeyboardActions: rows, Home and End', () => {
  const asset = (id: string) => ({ id, ownerId: 'me', visibility: 'timeline' }) as TimelineAsset;

  const setup = ({
    earlier,
    later,
    all = [],
  }: {
    earlier?: TimelineAsset;
    later?: TimelineAsset;
    all?: TimelineAsset[];
  }) => {
    const timelineManager = {
      isInitialized: true,
      months: [{}],
      getTimelineMonthByAssetId: () => ({ findAssetById: () => undefined }),
      getEarlierAsset: vi.fn(() => Promise.resolve(earlier)),
      getLaterAsset: vi.fn(() => Promise.resolve(later)),
      assetsIterator: vi.fn(({ direction }: { direction: 'earlier' | 'later' }) => {
        const order = direction === 'earlier' ? all : [...all].reverse();
        return (async function* () {
          yield* await Promise.resolve(order);
        })();
      }),
      scrollBy: vi.fn(),
      update: vi.fn(),
    } as unknown as TimelineManager;
    const assetInteraction = {
      selectionActive: false,
      assets: [],
      getOwnedAssets: () => [],
      clear: vi.fn(),
    } as unknown as AssetMultiSelectManager;
    const scrollToAsset = vi.fn(() => true);
    render(TimelineKeyboardActions, { timelineManager, assetInteraction, scrollToAsset });
    return { timelineManager, scrollToAsset };
  };

  // a grid of two rows: a, b, c along the top, d and e under them
  const layout: Record<string, [top: number, left: number, right: number]> = {
    a: [0, 0, 200],
    b: [0, 210, 400],
    c: [0, 410, 600],
    d: [110, 0, 300],
    e: [110, 310, 600],
  };
  const drawGrid = (ids = Object.keys(layout)) => {
    const grid = document.createElement('section');
    grid.id = 'asset-grid';
    grid.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 600, height: 800 }) as DOMRect;
    for (const id of ids) {
      const [top, left, right] = layout[id];
      const tile = document.createElement('div');
      tile.dataset.asset = id;
      tile.dataset.thumbnailFocusContainer = '';
      tile.tabIndex = 0;
      tile.getBoundingClientRect = () => ({ top, bottom: top + 100, left, right, height: 100 }) as DOMRect;
      grid.append(tile);
    }
    document.body.append(grid);
    return (id: string) => grid.querySelector<HTMLElement>(`[data-asset="${CSS.escape(id)}"]`)!;
  };

  beforeEach(() => document.body.replaceChildren());

  it('moves down to the photo below nearest by its centre, and up again', async () => {
    setup({});
    const tile = drawGrid();
    tile('b').focus();
    const down = await fireEvent.keyDown(tile('b'), { key: 'ArrowDown' });
    expect(down).toBe(false);
    expect(document.activeElement).toBe(tile('e'));
    await fireEvent.keyDown(tile('e'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tile('c'));
  });

  it('leaves the arrows to the page while no photo is focused', async () => {
    setup({});
    drawGrid();
    const down = await fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(down).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it('goes on past the row when the row beyond is not drawn yet', async () => {
    const { timelineManager, scrollToAsset } = setup({ earlier: asset('f') });
    const tile = drawGrid();
    tile('d').focus();
    await fireEvent.keyDown(tile('d'), { key: 'ArrowDown' });
    // the photo after the row's last (e), as → would reach it, which loads its month
    await vi.waitFor(() => expect(scrollToAsset).toHaveBeenCalledWith(asset('f')));
    expect(timelineManager.getEarlierAsset).toHaveBeenCalledWith({ id: 'e' }, 'asset');
  });

  it('goes to the first photo on Home and the last on End', async () => {
    const all = [asset('a'), asset('b'), asset('e')];
    const { scrollToAsset } = setup({ all });
    const tile = drawGrid();
    tile('b').focus();
    await fireEvent.keyDown(tile('b'), { key: 'End' });
    await vi.waitFor(() => expect(document.activeElement).toBe(tile('e')));
    await fireEvent.keyDown(tile('e'), { key: 'Home' });
    await vi.waitFor(() => expect(document.activeElement).toBe(tile('a')));
    expect(scrollToAsset).toHaveBeenCalledTimes(2);
  });
});

// Local Omarchy layer: O opens the Years overview and goes back, where the page offers the overviews
describe('TimelineKeyboardActions: O, the Years overview and back', () => {
  const setup = (grouping: TimelineGrouping, onGrouping?: (grouping: TimelineGrouping) => void, selected = false) => {
    const timelineManager = { isInitialized: true, months: [{}] } as unknown as TimelineManager;
    const assetInteraction = { selectionActive: selected, assets: [] } as unknown as AssetMultiSelectManager;
    render(TimelineKeyboardActions, {
      timelineManager,
      assetInteraction,
      scrollToAsset: () => false,
      grouping,
      onGrouping,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it('opens the Years overview from the photos', async () => {
    const onGrouping = vi.fn();
    setup('day', onGrouping);
    await fireEvent.keyDown(document, { key: 'o' });
    expect(onGrouping).toHaveBeenCalledWith('year');
  });

  it.each(['year', 'month'] as const)('goes back to the photos from the %s overview', async (grouping) => {
    const onGrouping = vi.fn();
    setup(grouping, onGrouping);
    await fireEvent.keyDown(document, { key: 'O' });
    expect(onGrouping).toHaveBeenCalledWith('day');
  });

  it('waits while photos are selected', async () => {
    const onGrouping = vi.fn();
    setup('day', onGrouping, true);
    await fireEvent.keyDown(document, { key: 'o' });
    expect(onGrouping).not.toHaveBeenCalled();
  });

  it('leaves Ctrl+O and Shift+O alone', async () => {
    const onGrouping = vi.fn();
    setup('day', onGrouping);
    await fireEvent.keyDown(document, { key: 'o', ctrlKey: true });
    await fireEvent.keyDown(document, { key: 'O', shiftKey: true });
    expect(onGrouping).not.toHaveBeenCalled();
  });
});
