import {
  countPageControls,
  foldsPageButtons,
  keepsSheetOpen,
  PAGE_FIT_FOLD,
  sheetOffset,
  tightensFurther,
} from '$lib/utils/page-bar-fit';

const html = (markup: string) => {
  const box = document.createElement('div');
  box.innerHTML = markup;
  document.body.append(box);
  return box;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('page bar fit', () => {
  it('tightens a step at a time while the row does not fit, up to the fold', () => {
    expect(tightensFurther(0, true)).toBe(true);
    expect(tightensFurther(PAGE_FIT_FOLD - 1, true)).toBe(true);
    expect(tightensFurther(PAGE_FIT_FOLD, true)).toBe(false);
    expect(tightensFurther(2, false)).toBe(false);
  });

  it('folds the page buttons only at the tightest step', () => {
    expect(foldsPageButtons(PAGE_FIT_FOLD, 2)).toBe(true);
    expect(foldsPageButtons(PAGE_FIT_FOLD - 1, 5)).toBe(false);
  });

  // a ⋮ for a single icon or menu takes as much room as it and hides it a click deeper
  it('keeps a single control the size of the ⋮ inline', () => {
    expect(foldsPageButtons(PAGE_FIT_FOLD, 1, 2.25)).toBe(false);
    expect(foldsPageButtons(PAGE_FIT_FOLD, 1)).toBe(false);
    expect(foldsPageButtons(PAGE_FIT_FOLD, 0, 20)).toBe(false);
  });

  // Places on a phone: its grouping select keeps its label and took the name's room
  it('folds a single control wider than the ⋮', () => {
    expect(foldsPageButtons(PAGE_FIT_FOLD, 1, 12.5)).toBe(true);
    expect(foldsPageButtons(PAGE_FIT_FOLD - 1, 1, 12.5)).toBe(false);
  });

  it('counts the controls that show, not the rows of a menu or what is hidden', () => {
    const box = html(`
      <button type="button">Share</button>
      <a href="/albums">Albums</a>
      <span><button type="button" style="display: none">Map</button></span>
      <div style="display: none"><button type="button">Slideshow</button></div>
      <div role="menu"><button type="button" role="menuitem">Delete</button></div>
      <input type="hidden" />
      <input type="text" />
    `);

    expect(countPageControls(box)).toBe(3);
  });

  it('closes the sheet behind an action, not behind a control that opens something of its own', () => {
    const box = html(`
      <button type="button" data-id="action">Share</button>
      <button type="button" data-id="menu" aria-haspopup="true">Sort</button>
      <button type="button" data-id="dialog" aria-haspopup="dialog">Options</button>
      <button type="button" data-id="no-popup" aria-haspopup="false">Cast</button>
      <input data-id="field" />
      <div class="ws-search-field"><button type="button" data-id="search">Search</button></div>
    `);
    const control = (id: string) => box.querySelector(`[data-id="${CSS.escape(id)}"]`)!;

    expect(keepsSheetOpen(control('action'))).toBe(false);
    expect(keepsSheetOpen(control('dialog'))).toBe(false);
    expect(keepsSheetOpen(control('no-popup'))).toBe(false);
    expect(keepsSheetOpen(control('menu'))).toBe(true);
    expect(keepsSheetOpen(control('field'))).toBe(true);
    expect(keepsSheetOpen(control('search'))).toBe(true);
  });

  it('hangs the sheet from the end of the ⋮ and keeps it inside the window', () => {
    // room to its left: its end on the ⋮'s end
    expect(sheetOffset({ left: 300, right: 336 }, 200, 1000)).toBe(-164);
    // a phone, the ⋮ mid-bar: moved in to 8px from the window's start
    expect(sheetOffset({ left: 200, right: 236 }, 260, 390)).toBe(-192);
    // right to left: its start on the ⋮'s start, and kept 8px from the window's end
    expect(sheetOffset({ left: 50, right: 86 }, 200, 390, true)).toBe(0);
    expect(sheetOffset({ left: 300, right: 336 }, 200, 390, true)).toBe(-118);
  });
});
