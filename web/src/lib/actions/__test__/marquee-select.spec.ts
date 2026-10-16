import { marqueeSelect } from '$lib/actions/marquee-select';
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { dropSpring, dropTarget, sidebarDrop, SPRING_MS } from '$lib/managers/sidebar-drop.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

// Local Omarchy layer: hold a photo, drag it onto another, let go: the two are stacked, the one dropped on as cover.
// Or carry it to the sidebar, from any grid: into an album there. happy-dom has no layout, so the test says what is
// under the pointer.
const mocks = vi.hoisted(() => ({ handleStack: vi.fn(), dropOn: vi.fn() }));
vi.mock('$lib/services/stack.service', () => ({ handleStack: mocks.handleStack }));
vi.mock('$lib/services/sidebar-drop.service', () => ({ dropOn: mocks.dropOn }));

const tile = (grid: HTMLElement, id: string) => {
  const node = document.createElement('div');
  node.dataset.thumbnailFocusContainer = '';
  node.dataset.asset = id;
  grid.append(node);
  return node;
};

const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(
    new (globalThis.PointerEvent ?? MouseEvent)(type, { bubbles: true, button: 0, clientX: x, clientY: y }),
  );

describe('marqueeSelect drag to stack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.handleStack.mockReset();
    if (!globalThis.CSS?.escape) {
      vi.stubGlobal('CSS', { escape: (value: string) => value });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('stacks the carried photo under the one it is dropped on', async () => {
    const grid = document.createElement('div');
    document.body.append(grid);
    const carried = tile(grid, 'carried');
    const target = tile(grid, 'target');
    document.elementsFromPoint = () => [target];
    const action = marqueeSelect(grid, {
      assetInteraction: { assets: [] } as unknown as AssetMultiSelectManager,
      enabled: true,
      assetFor: (id) => ({ id }) as TimelineAsset,
    });

    pointer(carried, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(300); // the hold lifts the photo
    pointer(globalThis, 'pointermove', 60, 60);
    expect(document.querySelector('.ws-drag-label')?.textContent).toBe('stack');
    pointer(globalThis, 'pointerup', 60, 60);

    await vi.waitFor(() => expect(mocks.handleStack).toHaveBeenCalledWith(['target', 'carried']));
    action.destroy();
  });
});

describe('marqueeSelect carrying photos to the sidebar', () => {
  let grid: HTMLElement;
  let nav: HTMLElement;
  let panel: HTMLElement;
  let selectAsset: ReturnType<typeof vi.fn>;

  const interaction = () => {
    selectAsset = vi.fn();
    return {
      assets: [],
      hasSelectedAsset: () => false,
      selectAsset,
      setAssetSelectionStart: vi.fn(),
      removeAssetFromMultiselectGroup: vi.fn(),
      clear: vi.fn(),
    } as unknown as AssetMultiSelectManager;
  };

  // a grid without stacking (search results, folders), beside the sidebar
  const start = () =>
    marqueeSelect(grid, {
      assetInteraction: interaction(),
      enabled: true,
      assetFor: (id) => ({ id }) as TimelineAsset,
      stacking: false,
    });

  const albumRow = () => {
    const row = document.createElement('div');
    panel.append(row);
    dropTarget(row, { kind: 'album', id: 'bali', name: 'Bali', writable: true });
    return row;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.dropOn.mockReset();
    mocks.handleStack.mockReset();
    if (!globalThis.CSS?.escape) {
      vi.stubGlobal('CSS', { escape: (value: string) => value });
    }
    nav = document.createElement('nav');
    nav.id = 'sidebar';
    nav.dataset.layout = 'expanded';
    panel = document.createElement('div');
    panel.dataset.testid = 'sidebar-panel';
    nav.append(panel);
    grid = document.createElement('div');
    document.body.append(nav, grid);
  });

  afterEach(() => {
    sidebarDrop.end();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('lifts a photo off a grid without stacking and drops it into an album row', async () => {
    const carried = tile(grid, 'carried');
    const row = albumRow();
    document.elementsFromPoint = () => [row];
    const action = start();

    pointer(carried, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.ws-drag-ghost')).not.toBeNull();
    pointer(globalThis, 'pointermove', 60, 60);
    expect(row.dataset.dropTarget).toBeDefined();
    expect(document.querySelector('.ws-drag-label')?.textContent).toBe('drop_add_to');
    pointer(globalThis, 'pointerup', 60, 60);

    await vi.waitFor(() =>
      expect(mocks.dropOn).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'album', id: 'bali' }),
        expect.objectContaining({ ids: ['carried'] }),
      ),
    );
    expect(sidebarDrop.carrying).toBeUndefined();
    action.destroy();
  });

  it('does nothing when it is dropped on another photo there', async () => {
    const carried = tile(grid, 'carried');
    const other = tile(grid, 'other');
    document.elementsFromPoint = () => [other];
    const action = start();

    pointer(carried, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(300);
    pointer(globalThis, 'pointermove', 60, 60);
    expect(other.dataset.dropTarget).toBeUndefined();
    pointer(globalThis, 'pointerup', 60, 60);

    await vi.advanceTimersByTimeAsync(50);
    expect(mocks.handleStack).not.toHaveBeenCalled();
    expect(mocks.dropOn).not.toHaveBeenCalled();
    action.destroy();
  });

  it('still selects the photo when the hold is let go in place', () => {
    const carried = tile(grid, 'carried');
    const action = start();

    pointer(carried, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(300);
    pointer(globalThis, 'pointerup', 10, 10);

    expect(selectAsset).toHaveBeenCalledWith({ id: 'carried' });
    action.destroy();
  });

  it('puts the photo back on Escape and closes the folder it sprang open', () => {
    const carried = tile(grid, 'carried');
    const head = document.createElement('div');
    panel.append(head);
    const state = { open: false };
    const spring = {
      isOpen: () => state.open,
      open: vi.fn(() => (state.open = true)),
      close: vi.fn(() => (state.open = false)),
    };
    dropSpring(head, spring);
    document.elementsFromPoint = () => [head];
    const action = start();

    pointer(carried, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(300);
    pointer(globalThis, 'pointermove', 60, 60);
    vi.advanceTimersByTime(SPRING_MS);
    expect(spring.open).toHaveBeenCalledTimes(1);

    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(spring.close).toHaveBeenCalledTimes(1);
    expect(sidebarDrop.carrying).toBeUndefined();
    pointer(globalThis, 'pointerup', 60, 60);
    expect(mocks.dropOn).not.toHaveBeenCalled();
    action.destroy();
  });

  it('only selects on a grid without stacking while the sidebar is hidden (a phone, the drawer)', () => {
    nav.dataset.layout = 'overlay';
    const carried = tile(grid, 'carried');
    const action = start();

    pointer(carried, 'pointerdown', 10, 10);
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.ws-drag-ghost')).toBeNull();
    pointer(globalThis, 'pointerup', 10, 10);
    expect(selectAsset).toHaveBeenCalledWith({ id: 'carried' });
    action.destroy();
  });
});
