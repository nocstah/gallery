import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Local Omarchy layer: People hides from its sidebar row's right-click menu, in this browser, with an Undo
const mocks = vi.hoisted(() => ({
  show: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('$app/state', () => ({ page: { route: { id: '/(user)/photos' }, params: {} } }));
vi.mock('@immich/ui', () => ({
  menuManager: { show: mocks.show },
  toastManager: { primary: mocks.toast, info: mocks.toast, success: mocks.toast, warning: mocks.toast },
}));

const { showSidebarRowMenu } = await import('$lib/utils/sidebar-row-menu');
const { sidebarRowsHidden, setSidebarRowHidden } = await import('$lib/stores/sidebar-rows');
const { undoManager } = await import('$lib/managers/undo-manager.svelte');

type Item = { title: string; onAction: () => void };
const openMenu = async (event = new MouseEvent('contextmenu', { clientX: 40, clientY: 300 })) => {
  await showSidebarRowMenu(event, 'people', 'People hidden from the sidebar in this browser');
  const [{ items, target }] = mocks.show.mock.calls.at(-1) as [{ items: Item[]; target: HTMLElement }];
  return { items, target };
};

describe('the sidebar row menu', () => {
  beforeEach(() => {
    mocks.show.mockReset();
    mocks.toast.mockReset();
    sidebarRowsHidden.set({});
    undoManager.entries = [];
  });

  it('opens where the pointer is, with one item: Hide from sidebar', async () => {
    const { items, target } = await openMenu();

    expect(items.map(({ title }) => title)).toEqual(['sidebar_row_hide']);
    expect(target.style.left).toBe('40px');
    expect(target.style.top).toBe('300px');
  });

  it('hides the row in this browser, says so, and takes it back with Undo', async () => {
    const { items } = await openMenu();

    items[0].onAction();

    expect(get(sidebarRowsHidden)).toEqual({ people: true });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'People hidden from the sidebar in this browser' }),
      expect.anything(),
    );
    expect(undoManager.entries[0]?.label).toBe('People hidden from the sidebar in this browser');

    await undoManager.undo();

    expect(get(sidebarRowsHidden)).toEqual({});
  });

  it('keeps the other rows a browser hid when one comes back', () => {
    sidebarRowsHidden.set({ people: true, other: true });

    setSidebarRowHidden('people', false);

    expect(get(sidebarRowsHidden)).toEqual({ other: true });
  });
});
