import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { quickTrash, quickTrashTarget } from '$lib/utils/quick-trash';

const mocks = vi.hoisted(() => ({ deleteAssets: vi.fn(() => Promise.resolve()), trash: true }));
vi.mock('$lib/utils/actions', () => ({ deleteAssets: mocks.deleteAssets }));
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
});
