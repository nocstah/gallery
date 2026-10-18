import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Local Omarchy layer: glass chrome measures the timeline's header rows into --ws-tl-head, also when they come and go
// without a navigation (Years and Months mount their grouping row, filters their bar, search results stand in for the
// grid). happy-dom lays nothing out, so each row says where it is.
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn() }));

type Chrome = typeof import('./chrome.svelte');

const resizes: { callback: () => void; observed: Set<Element> }[] = [];
class FakeResizeObserver {
  observed = new Set<Element>();
  constructor(callback: () => void) {
    resizes.push({ callback, observed: this.observed });
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
}

/** an element laid out at `top`, `height` tall (offsetParent: the column), or not laid out at all (display: none) */
const box = (tag: string, top: number, height: number, attributes: Record<string, string> = {}) => {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  Object.defineProperties(element, {
    offsetTop: { configurable: true, get: () => top },
    offsetHeight: { configurable: true, get: () => height },
    offsetParent: { configurable: true, get: () => (height > 0 ? element.parentElement : null) },
  });
  return element;
};

const head = (column: HTMLElement) => column.style.getPropertyValue('--ws-tl-head');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('glass chrome, the timeline header rows', () => {
  let module: Chrome;
  let column: HTMLElement;
  let grid: HTMLElement;

  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.resetModules();
    document.body.replaceChildren();
    column = document.createElement('div');
    grid = box('section', 0, 800, { id: 'asset-grid' });
    column.append(grid);
    document.body.append(column);
    module = await import('./chrome.svelte');
  });

  afterEach(() => {
    module.chrome.choose('solid');
    vi.unstubAllGlobals();
    resizes.length = 0;
  });

  it('measures the rows there when glass is chosen', () => {
    column.prepend(box('div', 48, 52));
    module.chrome.choose('glass-hide');
    expect(head(column)).toBe('52px');
  });

  it('measures again when a row mounts after the navigation, as switching to Years mounts the grouping row', async () => {
    module.chrome.choose('glass-hide');
    expect(head(column)).toBe('0px');
    column.prepend(box('div', 48, 52));
    await settle();
    expect(head(column)).toBe('52px');
    // a second row (the filters' bar) spans from the first row's top to its own bottom
    column.insertBefore(box('div', 100, 81), grid);
    await settle();
    expect(head(column)).toBe('133px');
  });

  it('gives the room back when the rows go', async () => {
    const row = box('div', 48, 52);
    column.prepend(row);
    module.chrome.choose('glass');
    row.remove();
    await settle();
    expect(head(column)).toBe('0px');
  });

  it('keeps watching each row it measured for a change of size', () => {
    let height = 52;
    const row = box('div', 48, 0);
    Object.defineProperties(row, {
      offsetHeight: { get: () => height },
      offsetParent: { get: () => column },
    });
    column.prepend(row);
    module.chrome.choose('glass-hide');
    height = 90;
    for (const { callback, observed } of resizes) {
      if (observed.has(row)) {
        callback();
      }
    }
    expect(head(column)).toBe('90px');
  });

  it('counts no row for what floats on its own: the scrubber, a phone’s grouping control', () => {
    column.prepend(box('div', 0, 900, { class: 'absolute', style: 'position: absolute' }));
    column.append(box('div', 780, 36, { class: 'fixed', style: 'position: fixed' }));
    module.chrome.choose('glass-hide');
    expect(head(column)).toBe('0px');
    expect(module.isHeaderRow(grid)).toBe(false);
  });

  it('counts nothing for a row a narrow screen hides', () => {
    column.prepend(box('div', 0, 0), box('div', 48, 52));
    module.chrome.choose('glass-hide');
    expect(head(column)).toBe('52px');
  });

  it('measures the grid when it comes back to its column, as it does after search results', async () => {
    const row = box('div', 48, 52);
    column.prepend(row);
    module.chrome.choose('glass-hide');
    grid.remove();
    await settle();
    row.remove();
    column.prepend(box('div', 48, 81));
    column.append(grid);
    await settle();
    expect(head(column)).toBe('81px');
  });

  it('finds a grid that mounts after the page did', async () => {
    column.remove();
    module.chrome.choose('glass-hide');
    const later = document.createElement('div');
    later.append(box('div', 48, 52), box('section', 0, 800, { id: 'asset-grid' }));
    document.body.append(later);
    await settle();
    expect(head(later)).toBe('52px');
  });

  it('stops watching under solid chrome', async () => {
    module.chrome.choose('glass-hide');
    module.chrome.choose('solid');
    column.prepend(box('div', 48, 52));
    await settle();
    expect(head(column)).toBe('0px');
  });
});
