// Local Omarchy layer: the chrome's material (Settings > Theme). "solid" is the one ground with hairlines; "glass"
// makes the top bar (and a page's title bar and the timeline's header rows) smoked glass that the photos scroll
// under, like the desktop's glass themes; "glass-hide" also slides them away while you scroll down and brings them
// back on the way up. The choice is per browser; app.html sets it before the first paint, the styles are
// omarchy-world.css's `:root[data-chrome^='glass']` rules.
//
// Glass needs one measurement CSS cannot make: how tall the timeline's header rows are (month heading, grouping and
// filter row), so the timeline's top section can start below them; it is kept in --ws-tl-head on that column.
import { afterNavigate } from '$app/navigation';

export type ChromeMode = 'solid' | 'glass' | 'glass-hide';
export const CHROME_MODES: ChromeMode[] = ['solid', 'glass', 'glass-hide'];
const KEY = 'gallery.chrome';
const HIDE_AFTER = 120; // px scrolled before the bar may hide
const STEP = 6; // px of travel that counts as a direction

const read = (): ChromeMode => {
  try {
    const value = localStorage.getItem(KEY) as ChromeMode | null;
    return value && CHROME_MODES.includes(value) ? value : 'solid';
  } catch {
    return 'solid';
  }
};

class Chrome {
  mode = $state<ChromeMode>(read());

  choose(mode: ChromeMode) {
    this.mode = mode;
    try {
      if (mode === 'solid') {
        localStorage.removeItem(KEY);
      } else {
        localStorage.setItem(KEY, mode);
      }
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    document.documentElement.dataset.chrome = mode;
    delete document.documentElement.dataset.barHidden;
    measure();
  }
}

export const chrome = new Chrome();

/** The timeline column's header rows (everything above #asset-grid but the scrubber), measured into --ws-tl-head. */
let observer: ResizeObserver | undefined;
const measure = () => {
  observer?.disconnect();
  const column = document.querySelector<HTMLElement>('div:has(> #asset-grid)');
  if (!column || chrome.mode === 'solid') {
    return;
  }
  const rows = [...column.children].filter(
    (child): child is HTMLElement => child.id !== 'asset-grid' && getComputedStyle(child).position !== 'absolute',
  );
  // from the first row's top to the last one's bottom: rows may keep a margin between them (offsets, so the slide of
  // glass-hide does not count)
  const update = () => {
    const first = rows[0];
    const last = rows.at(-1);
    const height = first && last ? last.offsetTop + last.offsetHeight - first.offsetTop : 0;
    column.style.setProperty('--ws-tl-head', `${height}px`);
  };
  observer = new ResizeObserver(update);
  for (const row of rows) {
    observer.observe(row);
  }
  update();
};

/** Hide-on-scroll: the page's content scroller (the timeline, or the layout's own) decides, never the sidebar. */
const lastTop = new WeakMap<EventTarget, number>();
const onScroll = (event: Event) => {
  if (chrome.mode !== 'glass-hide') {
    return;
  }
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLElement) || target.closest('#sidebar') || !target.closest('main')) {
    return;
  }
  const top = target.scrollTop;
  const before = lastTop.get(target);
  if (before === undefined) {
    lastTop.set(target, top);
    return;
  }
  if (Math.abs(top - before) < STEP) {
    return;
  }
  lastTop.set(target, top);
  const root = document.documentElement;
  if (top > before && top > HIDE_AFTER) {
    root.dataset.barHidden = '';
  } else if (top < before) {
    delete root.dataset.barHidden;
  }
};

/** Called once from the root layout. */
export const startChrome = () => {
  document.documentElement.dataset.chrome = chrome.mode;
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  afterNavigate(() => {
    delete document.documentElement.dataset.barHidden;
    // the page's markup is in place after navigation; the timeline mounts a tick later
    requestAnimationFrame(() => setTimeout(measure, 0));
  });
  measure();
};
