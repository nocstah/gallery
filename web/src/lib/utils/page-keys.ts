// Local Omarchy layer: Page Up and Page Down page the main view (Photos, an album, a list page) wherever the keyboard
// focus is, as long as it is not in a field, a menu or a dialog, or in something else that scrolls (the browser pages
// that one itself). Without this they only worked while the photo grid itself had focus: after a click in the sidebar or
// the bar, or once the button that had focus went away (a selection action), they did nothing.
import { isModalOpen } from '@immich/ui';

const OWN_KEYS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], dialog';

const scrolls = (element: Element) => {
  const { overflowY } = getComputedStyle(element);
  return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1;
};

const scrollerOf = (element: Element | null) => {
  for (let at = element; at && at !== document.body && at !== document.documentElement; at = at.parentElement) {
    if (scrolls(at)) {
      return at as HTMLElement;
    }
  }
};

/** How far one press goes: as the browser pages, a screen less a little overlap. */
export const pageStep = (height: number) => Math.max(height * 0.875, height - 40);

// presses in quick succession add up, as the browser's own do, instead of each starting from mid-glide
let gliding: { element: HTMLElement; top: number } | undefined;
let settle: ReturnType<typeof setTimeout> | undefined;

export const onPageKey = (event: KeyboardEvent) => {
  const down = event.key === 'PageDown';
  if ((!down && event.key !== 'PageUp') || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const focus = document.activeElement;
  if (isModalOpen() || focus?.closest(OWN_KEYS)) {
    return;
  }
  const inside = focus && focus !== document.body ? scrollerOf(focus) : undefined;
  if (inside && !inside.closest('#sidebar')) {
    return;
  }
  // the main view: what scrolls under the middle of the window (nothing while a photo is open)
  const element = scrollerOf(document.elementFromPoint(innerWidth / 2, innerHeight / 2));
  if (!element) {
    return;
  }
  event.preventDefault();
  const from = gliding?.element === element ? gliding.top : element.scrollTop;
  const step = pageStep(element.clientHeight) * (down ? 1 : -1);
  const top = Math.min(element.scrollHeight - element.clientHeight, Math.max(0, from + step));
  gliding = { element, top };
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollTo({ top, behavior: instant ? 'instant' : 'smooth' });
  clearTimeout(settle);
  settle = setTimeout(() => (gliding = undefined), 450);
};
