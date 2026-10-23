import { tick } from 'svelte';
import { navigating } from '$app/stores';
import { SessionStorageKey } from '$lib/constants';
import { handlePromiseError } from '$lib/utils';

interface Options {
  /**
   * This must be kept the same in all subpages of this route for the scroll memory clearer to work.
   */
  routeStartsWith: string;
  /**
   * Function to clear additional data/state before scrolling (ex infinite scroll).
   */
  beforeClear?: () => void;
}

interface PageOptions extends Options {
  /** Links whose screen position should survive changes to the list's rows. */
  anchorSelector?: string;
  /**
   * Function to save additional data/state before scrolling (ex infinite scroll).
   */
  beforeSave?: () => void;
  /**
   * Function to load additional data/state before scrolling (ex infinite scroll).
   */
  beforeScroll?: () => Promise<void>;
}

interface ScrollAnchor {
  href: string;
  offset: number;
}

const clearPosition = () => {
  sessionStorage.removeItem(SessionStorageKey.SCROLL_POSITION);
  sessionStorage.removeItem(SessionStorageKey.SCROLL_ANCHOR);
};

const readAnchor = (): ScrollAnchor | undefined => {
  try {
    const value = JSON.parse(sessionStorage.getItem(SessionStorageKey.SCROLL_ANCHOR) ?? 'null');
    if (value && typeof value.href === 'string' && Number.isFinite(value.offset)) {
      return { href: value.href, offset: value.offset };
    }
  } catch {
    // A stale/invalid anchor still permits restoring the ordinary pixel offset.
  }
};

/** Hold the visited face in place while the grid finishes laying out, until the next user action. */
const restoreAnchor = (node: HTMLElement, selector: string, anchor: ScrollAnchor) => {
  const findAnchor = () =>
    [...node.querySelectorAll<HTMLAnchorElement>(selector)].find((link) => link.getAttribute('href') === anchor.href);
  if (!findAnchor()) {
    return;
  }

  const previousOverflowAnchor = node.style.overflowAnchor;
  let tracking = true;
  // Native anchoring picks a different row while the early pages are being replaced. Let this
  // explicit anchor own restoration, then restore the browser's normal behaviour on interaction.
  node.style.overflowAnchor = 'none';
  const align = () => {
    if (!tracking) {
      return;
    }
    const link = findAnchor();
    if (link) {
      const delta = link.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
      if (Math.abs(delta) > 0.5) {
        node.scroll({ top: node.scrollTop + delta, behavior: 'instant' });
      }
    }
  };
  align();
  const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(align);
  resized?.observe(node);
  for (const child of node.children) {
    resized?.observe(child);
  }
  const inputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  const stop = () => {
    if (!tracking) {
      return;
    }
    tracking = false;
    resized?.disconnect();
    node.style.overflowAnchor = previousOverflowAnchor;
    for (const event of inputEvents) {
      removeEventListener(event, stop, true);
    }
  };
  for (const event of inputEvents) {
    addEventListener(event, stop, { capture: true, passive: true });
  }
  return stop;
};

/**
 * @param node The scroll slot element, typically from {@link UserPageLayout}
 */
export function scrollMemory(
  node: HTMLElement,
  { routeStartsWith, beforeSave, beforeClear, beforeScroll, anchorSelector }: PageOptions,
) {
  let active = true;
  let stopAnchoring: (() => void) | undefined;
  const unsubscribeNavigating = navigating.subscribe((navigation) => {
    if (!navigation?.to) {
      return;
    }
    // Leaving this section clears even a restoration that is still loading.
    if (!navigation.to.url.pathname.startsWith(routeStartsWith)) {
      beforeClear?.();
      clearPosition();
      return;
    }
    if (sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION) === null) {
      // Save current scroll information when going into a subpage.
      beforeSave?.();
      sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, node.scrollTop.toString());
      if (anchorSelector) {
        const links = [...node.querySelectorAll<HTMLAnchorElement>(anchorSelector)];
        const viewport = node.getBoundingClientRect();
        const visited = links.find((link) => link.pathname === navigation.to!.url.pathname);
        const visible = links.find((link) => {
          const rect = link.getBoundingClientRect();
          return rect.bottom > viewport.top && rect.top < Math.min(viewport.bottom, innerHeight);
        });
        const anchor = visited ?? visible;
        if (anchor) {
          sessionStorage.setItem(
            SessionStorageKey.SCROLL_ANCHOR,
            JSON.stringify({
              href: anchor.getAttribute('href'),
              offset: anchor.getBoundingClientRect().top - viewport.top,
            }),
          );
        }
      }
    }
  });

  handlePromiseError(
    (async () => {
      await beforeScroll?.();
      // Fetching the rows is not enough: Svelte must render their height before the browser
      // can restore an offset beyond the first page. A page left during loading must not scroll
      // or clear the saved position that its replacement will need.
      await tick();
      if (!active) {
        return;
      }

      const anchor = anchorSelector ? readAnchor() : undefined;
      if (anchorSelector && anchor) {
        stopAnchoring = restoreAnchor(node, anchorSelector, anchor);
      }
      const newScroll = sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION);
      if (!stopAnchoring && newScroll) {
        node.scroll({
          top: Number(newScroll),
          behavior: 'instant',
        });
      }
      beforeClear?.();
      clearPosition();
    })(),
  );

  return {
    destroy() {
      active = false;
      stopAnchoring?.();
      unsubscribeNavigating();
    },
  };
}

export function scrollMemoryClearer(_node: HTMLElement, { routeStartsWith, beforeClear }: Options) {
  const unsubscribeNavigating = navigating.subscribe((navigation) => {
    // Forget scroll position from main page if going somewhere else.
    if (!navigation?.to || navigation?.to.url.pathname.startsWith(routeStartsWith)) {
      return;
    }

    beforeClear?.();
    clearPosition();
  });

  return {
    destroy() {
      unsubscribeNavigating();
    },
  };
}
