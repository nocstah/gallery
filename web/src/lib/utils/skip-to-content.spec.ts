import { firstPhotoInView, pageGrid, skipToContent } from '$lib/utils/skip-to-content';

// Local Omarchy layer: the bar's Skip to content lands on a page's photo grid, and the next Tab is its first photo in
// view, past whatever heads the grid (an album's details, a grouping control); a page without photos is left to the
// skip link's own way.

type Box = { top: number; bottom: number };

const place = (element: HTMLElement, box: Box | null) => {
  element.getClientRects = () => (box ? [box] : []) as unknown as DOMRectList;
  element.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, height: 0, x: 0, y: 0, ...box }) as DOMRect;
};

const tab = (target: HTMLElement, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

/** A timeline: a details field above its photos (as an album has), then three photos, the first scrolled out of view. */
const timeline = () => {
  document.body.innerHTML = `
    <main>
      <section id="asset-grid" tabindex="-1">
        <textarea aria-label="Add a description"></textarea>
        <div data-thumbnail-focus-container data-asset="a1" tabindex="0" role="link"></div>
        <div data-thumbnail-focus-container data-asset="a2" tabindex="0" role="link"></div>
        <div data-thumbnail-focus-container data-asset="a3" tabindex="0" role="link"></div>
      </section>
    </main>`;
  const grid = document.querySelector<HTMLElement>('#asset-grid')!;
  place(grid, { top: 100, bottom: 900 });
  place(document.querySelector('textarea')!, { top: 20, bottom: 60 });
  const [first, second, third] = document.querySelectorAll<HTMLElement>('[data-asset]');
  place(first, { top: 0, bottom: 90 });
  place(second, { top: 120, bottom: 300 });
  place(third, { top: 320, bottom: 500 });
  return { grid, first, second, third };
};

describe('skipToContent', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('lands on the timeline grid, and the next Tab goes to the first photo in view', () => {
    const { grid, second } = timeline();

    expect(skipToContent()).toBe(true);
    expect(grid).toHaveFocus();

    const event = tab(grid);
    expect(event.defaultPrevented).toBe(true);
    expect(second).toHaveFocus();
  });

  it('leaves Shift+Tab, and a Tab once the focus has left, to the browser', () => {
    const { grid, third } = timeline();

    skipToContent();
    expect(tab(grid, { shiftKey: true }).defaultPrevented).toBe(false);

    third.focus();
    grid.focus();
    expect(tab(grid).defaultPrevented).toBe(false);
  });

  it('lands on a grid of results, which takes the focus for it', () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="gallery-viewer">
          <div data-thumbnail-focus-container data-asset="r1" tabindex="0" role="link"></div>
        </div>
      </main>`;
    const gallery = document.querySelector<HTMLElement>('[data-testid="gallery-viewer"]')!;
    const photo = document.querySelector<HTMLElement>('[data-asset]')!;
    place(gallery, { top: 0, bottom: 800 });
    place(photo, { top: 10, bottom: 200 });

    expect(skipToContent()).toBe(true);
    expect(gallery).toHaveAttribute('tabindex', '-1');
    expect(gallery).toHaveFocus();
    tab(gallery);
    expect(photo).toHaveFocus();
  });

  it('leaves a page without photos to the skip link', () => {
    document.body.innerHTML = '<main><button type="button">New album</button></main>';

    expect(skipToContent()).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('takes the grid in the main over one elsewhere, and none that is not on screen', () => {
    document.body.innerHTML = `
      <div data-testid="gallery-viewer" id="aside"></div>
      <main><section id="asset-grid" tabindex="-1"></section></main>`;
    const aside = document.querySelector<HTMLElement>('#aside')!;
    const grid = document.querySelector<HTMLElement>('#asset-grid')!;
    place(aside, { top: 0, bottom: 100 });
    place(grid, { top: 0, bottom: 100 });
    expect(pageGrid()).toBe(grid);

    place(grid, null);
    expect(pageGrid()).toBe(aside);
  });

  it('falls back to the first photo drawn when none is in view', () => {
    const { grid, first, second, third } = timeline();
    for (const photo of [first, second, third]) {
      place(photo, { top: 2000, bottom: 2100 });
    }
    expect(firstPhotoInView(grid)).toBe(first);
  });
});
