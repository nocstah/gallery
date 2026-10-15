import { marqueeSelect } from '$lib/actions/marquee-select';
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

// Local Omarchy layer: hold a photo, drag it onto another, let go: the two are stacked, the one dropped on as cover.
// happy-dom has no layout, so the test says which tile is under the pointer.
const mocks = vi.hoisted(() => ({ handleStack: vi.fn() }));
vi.mock('$lib/services/stack.service', () => ({ handleStack: mocks.handleStack }));

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
    pointer(globalThis, 'pointerup', 60, 60);

    await vi.waitFor(() => expect(mocks.handleStack).toHaveBeenCalledWith(['target', 'carried']));
    action.destroy();
  });
});
