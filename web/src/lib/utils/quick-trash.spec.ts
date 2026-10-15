import { eventManager } from '$lib/managers/event-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { quickTrash, quickTrashInAlbum, quickTrashTarget, takeOutOfAlbum } from '$lib/utils/quick-trash';

const mocks = vi.hoisted(() => ({
  deleteAssets: vi.fn(() => Promise.resolve()),
  trash: true,
  removeAssetFromAlbum: vi.fn(),
  removedFromAlbumDone: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('$lib/utils/actions', () => ({ deleteAssets: mocks.deleteAssets }));
vi.mock('$lib/utils/undoable', () => ({ removedFromAlbumDone: mocks.removedFromAlbumDone }));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  removeAssetFromAlbum: mocks.removeAssetFromAlbum,
}));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { warning: mocks.warning },
}));
vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: {
    get value() {
      return { trash: mocks.trash };
    },
  },
}));

const tileImage = (attributes: Record<string, string> = {}) => {
  const tile = document.createElement('div');
  tile.dataset.asset = 'a1';
  for (const [name, value] of Object.entries(attributes)) {
    tile.setAttribute(name, value);
  }
  const image = document.createElement('img');
  tile.append(image);
  document.body.append(tile);
  return image;
};

const press = (target: Element, init: MouseEventInit) => {
  const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

const asset = { id: 'a1', isTrashed: false } as TimelineAsset;

describe('quick trash', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    mocks.deleteAssets.mockClear();
    mocks.trash = true;
  });

  it('finds the tile under a Shift + middle-click', () => {
    expect(quickTrashTarget(press(tileImage(), { button: 1, shiftKey: true }))).toBe('a1');
  });

  it('ignores other clicks and read-only or disabled tiles', () => {
    expect(quickTrashTarget(press(tileImage(), { button: 0, shiftKey: true }))).toBeUndefined();
    expect(quickTrashTarget(press(tileImage(), { button: 1 }))).toBeUndefined();
    expect(quickTrashTarget(press(tileImage(), { button: 1, shiftKey: true, ctrlKey: true }))).toBeUndefined();
    expect(
      quickTrashTarget(press(tileImage({ 'data-readonly': 'true' }), { button: 1, shiftKey: true })),
    ).toBeUndefined();
    expect(
      quickTrashTarget(press(tileImage({ 'data-disabled': 'true' }), { button: 1, shiftKey: true })),
    ).toBeUndefined();
  });

  it('moves the asset to the trash, never deletes it for good', () => {
    const onDelete = vi.fn();
    const onUndo = vi.fn();
    const event = press(tileImage(), { button: 1, shiftKey: true });
    quickTrash(event, () => asset, onDelete, onUndo);
    expect(mocks.deleteAssets).toHaveBeenCalledWith(false, onDelete, [asset], onUndo);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing without a trash or for an asset already in it', () => {
    mocks.trash = false;
    quickTrash(press(tileImage(), { button: 1, shiftKey: true }), () => asset, vi.fn());
    mocks.trash = true;
    quickTrash(press(tileImage(), { button: 1, shiftKey: true }), () => ({ ...asset, isTrashed: true }), vi.fn());
    expect(mocks.deleteAssets).not.toHaveBeenCalled();
  });

  it('leaves a tile this grid does not hold to the browser', () => {
    const event = press(tileImage(), { button: 1, shiftKey: true });
    quickTrash(event, () => undefined, vi.fn());
    expect(event.defaultPrevented).toBe(false);
    expect(mocks.deleteAssets).not.toHaveBeenCalled();
  });

  describe('inside an album', () => {
    it('takes the photo out of the album, never trashes it', () => {
      const takeOut = vi.fn(() => Promise.resolve());
      const leave = quickTrashInAlbum(takeOut);
      try {
        const event = press(tileImage(), { button: 1, shiftKey: true });
        quickTrash(event, () => asset, vi.fn());
        expect(takeOut).toHaveBeenCalledWith(asset);
        expect(mocks.deleteAssets).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      } finally {
        leave();
      }
    });

    it('does nothing where the photo cannot leave the album (a viewer of a shared album)', () => {
      const leave = quickTrashInAlbum(undefined);
      try {
        const event = press(tileImage(), { button: 1, shiftKey: true });
        quickTrash(event, () => asset, vi.fn());
        expect(mocks.deleteAssets).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      } finally {
        leave();
      }
    });

    it('trashes again once the album page has gone, and an old page leaving keeps the new one', () => {
      const first = vi.fn(() => Promise.resolve());
      const second = vi.fn(() => Promise.resolve());
      const leaveFirst = quickTrashInAlbum(first);
      const leaveSecond = quickTrashInAlbum(second);
      leaveFirst();
      quickTrash(press(tileImage(), { button: 1, shiftKey: true }), () => asset, vi.fn());
      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();

      leaveSecond();
      quickTrash(press(tileImage(), { button: 1, shiftKey: true }), () => asset, vi.fn());
      expect(mocks.deleteAssets).toHaveBeenCalledTimes(1);
    });
  });

  describe('takeOutOfAlbum', () => {
    beforeEach(() => {
      mocks.removeAssetFromAlbum.mockReset();
      mocks.removedFromAlbumDone.mockReset();
      mocks.warning.mockReset();
    });

    it('takes out what the server let go, drops those tiles and offers Undo', async () => {
      mocks.removeAssetFromAlbum.mockResolvedValue([
        { id: 'a1', success: true },
        { id: 'a2', success: false, error: 'no_permission' },
      ]);
      const emit = vi.spyOn(eventManager, 'emit');

      await takeOutOfAlbum('album-1', ['a1', 'a2']);

      expect(mocks.removeAssetFromAlbum).toHaveBeenCalledWith({ id: 'album-1', bulkIdsDto: { ids: ['a1', 'a2'] } });
      expect(emit).toHaveBeenCalledWith('AlbumRemoveAssets', { assetIds: ['a1'], albumIds: ['album-1'] });
      expect(mocks.removedFromAlbumDone).toHaveBeenCalledWith('album-1', ['a1'], expect.any(String));
      emit.mockRestore();
    });

    it('says so when nothing could be taken out, and records no Undo', async () => {
      mocks.removeAssetFromAlbum.mockResolvedValue([{ id: 'a1', success: false, error: 'not_found' }]);
      const emit = vi.spyOn(eventManager, 'emit');

      await takeOutOfAlbum('album-1', ['a1']);

      expect(mocks.warning).toHaveBeenCalledTimes(1);
      expect(emit).not.toHaveBeenCalledWith('AlbumRemoveAssets', expect.anything());
      expect(mocks.removedFromAlbumDone).not.toHaveBeenCalled();
      emit.mockRestore();
    });
  });
});
