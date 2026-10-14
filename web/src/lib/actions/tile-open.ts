// Local Omarchy layer: photos open like windows (the owner: "photos pop or fade into existence when scrolling"). A
// tile that comes into view pops in the way the desktop opens a window: styles/omarchy-world.css plays Hyprland's
// windowsIn and fadeIn on it from the --ws-* motion tokens ([data-ws-open]). The timeline and the gallery grid make a
// tile before it reaches the screen, so a tile waits on its first frame until it is actually seen (one shared
// IntersectionObserver). A screen that opens at once (the page loading, a folder opening, a stack expanding) ripples
// in reading order; a row scrolled into view ripples along the row.
//
// A tile is simply there, with no wait, under reduced motion, in a hidden tab (nothing would ever play there), when
// the desktop has its window animations off, and while the view moves faster than the eye follows: a jump of more
// than a screen (the scrubber, a year switch, whose workspace slide is the transition) or a fast fling.
import type { Action } from 'svelte/action';

const ROW_MS = 120; // the ripple along a row, from one side of the screen to the other
const SCREEN_MS = 200; // the ripple down a whole screen
const RIPPLE_MAX_MS = 280;
const JUMP_SCREENS = 1.5; // one scroll step further than this is a jump, not scrolling
const FLING_SCREENS_PER_SECOND = 2.5;
const QUIET_MS = 300; // tiles arriving this long after a jump or a fling just appear

const ANIMATIONS = new Set(['ws-open', 'ws-fade-in']);
const DESKTOP_CHECK_MS = 5000;

let quietUntil = 0;
let listening = false;
let observer: IntersectionObserver | undefined;
let desktopCheckedAt = -Infinity;
let desktopOpens = true;
const scrolls = new WeakMap<Element, { top: number; at: number; speed: number }>();
const ended = new WeakMap<HTMLElement, number>();

const onScroll = (event: Event) => {
  const scroller = event.target instanceof Element ? event.target : document.scrollingElement;
  if (!scroller) {
    return;
  }
  const now = performance.now();
  const top = scroller.scrollTop;
  const last = scrolls.get(scroller);
  if (!last) {
    scrolls.set(scroller, { top, at: now, speed: 0 });
    return;
  }
  const moved = Math.abs(top - last.top);
  // px per ms, smoothed over a few events; a pause makes the next step slow
  const speed = (last.speed + moved / Math.max(1, now - last.at)) / 2;
  scrolls.set(scroller, { top, at: now, speed });
  const screen = scroller.clientHeight || globalThis.innerHeight;
  if (moved > screen * JUMP_SCREENS || speed * 1000 > screen * FLING_SCREENS_PER_SECOND) {
    quietUntil = now + QUIET_MS;
  }
};

const reducedMotion = () => {
  // a test's stub matchMedia may return nothing
  const query: MediaQueryList | undefined =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  return query?.matches ?? false;
};

/** whether the desktop opens windows with any animation (the hook writes 0ms for an animation that is off) */
const desktopAnimates = () => {
  const now = performance.now();
  if (now - desktopCheckedAt > DESKTOP_CHECK_MS) {
    desktopCheckedAt = now;
    const style = getComputedStyle(document.documentElement);
    // a token the hook has not written reads as empty: on, as the fallbacks are
    desktopOpens = ['--ws-open-ms', '--ws-fade-in-ms'].some((name) => {
      const value = style.getPropertyValue(name).trim();
      return value === '' || Number(value.replace(/ms$/, '')) !== 0;
    });
  }
  return desktopOpens;
};

const settle = (node: HTMLElement) => {
  ended.delete(node);
  delete node.dataset.wsOpen;
  node.style.removeProperty('--ws-open-delay');
};

const arrive = (entries: IntersectionObserverEntry[]) => {
  const seen = entries.filter((entry) => entry.isIntersecting);
  if (seen.length === 0) {
    return;
  }
  const quiet = document.hidden || performance.now() < quietUntil;
  const rtl = document.documentElement.dir === 'rtl';
  const boxes = seen.map((entry) => entry.boundingClientRect);
  const top = Math.min(...boxes.map((box) => box.top));
  const start = rtl ? Math.max(...boxes.map((box) => box.right)) : Math.min(...boxes.map((box) => box.left));
  const width = globalThis.innerWidth || 1;
  const height = globalThis.innerHeight || 1;
  for (const [index, entry] of seen.entries()) {
    const node = entry.target as HTMLElement;
    observer?.unobserve(node);
    if (quiet) {
      settle(node);
      continue;
    }
    const box = boxes[index];
    const along = Math.abs(rtl ? start - box.right : box.left - start) / width;
    const down = (box.top - top) / height;
    const delay = Math.min(RIPPLE_MAX_MS, Math.round(along * ROW_MS + down * SCREEN_MS));
    node.style.setProperty('--ws-open-delay', `${delay}ms`);
    node.dataset.wsOpen = 'open';
  }
};

const onEnd = (event: AnimationEvent) => {
  const node = event.currentTarget as HTMLElement;
  if (event.target !== node || !ANIMATIONS.has(event.animationName)) {
    return;
  }
  const count = (ended.get(node) ?? 0) + 1;
  if (event.type === 'animationend' && count < ANIMATIONS.size) {
    ended.set(node, count);
    return;
  }
  settle(node);
};

/** use:tileOpen on a photo, album or folder tile: it opens like a window when it comes into view */
export const tileOpen: Action<HTMLElement, boolean | undefined> = (node, enabled = true) => {
  if (
    !enabled ||
    typeof IntersectionObserver === 'undefined' ||
    document.hidden ||
    reducedMotion() ||
    performance.now() < quietUntil ||
    !desktopAnimates()
  ) {
    return;
  }
  if (!listening) {
    listening = true;
    // eslint-disable-next-line unicorn/prefer-observer-apis -- a jump or a fling is how far the view moved between two scroll events, which no observer reports
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }
  observer ??= new IntersectionObserver(arrive);
  node.dataset.wsOpen = 'waiting';
  node.addEventListener('animationend', onEnd);
  node.addEventListener('animationcancel', onEnd);
  observer.observe(node);
  return {
    destroy() {
      observer?.unobserve(node);
      node.removeEventListener('animationend', onEnd);
      node.removeEventListener('animationcancel', onEnd);
    },
  };
};
