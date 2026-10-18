// Local Omarchy layer: where the bar's Skip to content lands (OmarchyBar, DESIGN.md Shell). A page of photos (a
// timeline, a grid of search results) gives the focus to its grid, so the keys that move through photos work at once
// (→ goes to the first photo, Page Down pages the grid) and the next Tab is the first photo in view, past whatever
// heads the grid (an album's details, a grouping control); Shift+Tab goes back the way the page reads. Any other page
// is left to the skip link's own way: the first control of its main.

const GRIDS = '#asset-grid, [data-testid="gallery-viewer"]';
const TILE = '[data-thumbnail-focus-container][data-asset]';

const shown = (element: Element) => element.getClientRects().length > 0;

/** The photo grid of the page, if it has one on screen: the first of them inside the page's main, else any. */
export const pageGrid = (root: ParentNode = document) => {
  const grids = [...root.querySelectorAll<HTMLElement>(GRIDS)].filter((grid) => shown(grid));
  return grids.find((grid) => grid.closest('main')) ?? grids[0];
};

/** The grid's first photo that is at least partly in its view (the first drawn, when none is). */
export const firstPhotoInView = (grid: HTMLElement) => {
  const tiles = [...grid.querySelectorAll<HTMLElement>(TILE)].filter((tile) => shown(tile));
  const view = grid.getBoundingClientRect();
  const top = Math.max(view.top, 0);
  const bottom = Math.min(view.bottom, window.innerHeight);
  return (
    tiles.find((tile) => {
      const box = tile.getBoundingClientRect();
      return box.bottom > top && box.top < bottom;
    }) ?? tiles[0]
  );
};

/**
 * Lands the focus on the page's photo grid; false when the page has none (the skip link then takes its own way). The
 * grid takes the focus without scrolling, and the next Tab from it goes to its first photo in view, for as long as the
 * focus stays on the grid itself.
 */
export const skipToContent = (root: ParentNode = document) => {
  const grid = pageGrid(root);
  if (!grid) {
    return false;
  }
  // a gallery's grid is not focusable by itself (the timeline's is): it is made so for the skip link alone
  if (!grid.hasAttribute('tabindex')) {
    grid.setAttribute('tabindex', '-1');
  }
  const onKeydown = (event: KeyboardEvent) => {
    if (
      event.key !== 'Tab' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target !== grid ||
      event.defaultPrevented
    ) {
      return;
    }
    const photo = firstPhotoInView(grid);
    if (photo) {
      event.preventDefault();
      photo.focus();
    }
  };
  grid.addEventListener('keydown', onKeydown);
  grid.addEventListener('blur', () => grid.removeEventListener('keydown', onKeydown), { once: true });
  grid.focus({ preventScroll: true });
  return true;
};
