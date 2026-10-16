// Local Omarchy layer: how a page's title row fits the one bar (components/layouts/UserPageLayout.svelte). The title
// keeps its width and the page's own buttons tighten a step at a time until the row fits: 1 drops the description,
// 2 the button labels, 3 the wide-screen extras and the month in view, and 4 folds the buttons into one ⋮, whose sheet
// lists them with their labels again. A fold only pays where it takes more off the bar than the ⋮ it leaves there:
// more than one control, or one wider than an icon (a select with its label); a page whose buttons are already a
// single control the size of the ⋮ (one menu, one icon) keeps it inline, and the name gets the room beside it.

/** The tightest step: the page's own buttons behind the bar's ⋮. */
export const PAGE_FIT_FOLD = 4;

/** What a person can press or type into among a page's own buttons. */
const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"]';
/** A menu's rows belong to its button, which is the control. */
const IN_POPUP = '[role="menu"], [role="listbox"], [role="dialog"]';

const shows = (element: HTMLElement) =>
  typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true })
    : element.getClientRects().length > 0;

/** How many controls the page's own buttons show, counted while they stand in the bar. */
export const countPageControls = (box: HTMLElement) =>
  [...box.querySelectorAll<HTMLElement>(CONTROL)].filter((element) => !element.closest(IN_POPUP) && shows(element))
    .length;

/** Whether the row tightens another step: it does not fit (a name cut short counts), and a step is left. */
export const tightensFurther = (fit: number, crowded: boolean) => crowded && fit < PAGE_FIT_FOLD;

/** A single control no wider than this (rem) is as small as the ⋮ that would stand in for it. */
export const FOLD_WIDTH_REM = 3;

/**
 * Whether the page's own buttons go behind the ⋮: at the tightest step, and only where that saves room. `width` is
 * the room they take in the bar at the step before (rem).
 */
export const foldsPageButtons = (fit: number, controls: number, width = 0) =>
  fit >= PAGE_FIT_FOLD && (controls > 1 || (controls === 1 && width > FOLD_WIDTH_REM));

/** A menu or list a control opened, drawn in place or kept at the end of <body> (a select's options, a kit menu). */
export const POPUP = '[role="menu"], [role="listbox"]';
/** A choice in such a popup: it acts as a press on a button does. */
export const POPUP_CHOICE = '[role="option"], [role^="menuitem"]';

/**
 * A press in the fold's sheet is a press on one of the page's buttons, so the sheet closes behind it as a menu closes
 * behind its item; it stays for a control that opens something of its own there (a menu, a list) and for a field.
 */
export const keepsSheetOpen = (control: Element) => {
  if (control.matches('input, select, textarea, label') || control.closest('.ws-search-field')) {
    return true;
  }
  const popup = control.getAttribute('aria-haspopup');
  return !!popup && popup !== 'false' && popup !== 'dialog';
};

/**
 * Where the sheet starts, from its anchor's left edge: under the ⋮ with its end on the ⋮'s end (its start in a
 * right-to-left page), moved in to stay `margin` inside the window.
 */
export const sheetOffset = (
  anchor: { left: number; right: number },
  width: number,
  viewport: number,
  rtl = false,
  margin = 8,
) => {
  const preferred = rtl ? anchor.left : anchor.right - width;
  return Math.max(margin, Math.min(preferred, viewport - margin - width)) - anchor.left;
};
