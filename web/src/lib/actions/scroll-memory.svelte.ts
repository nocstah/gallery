import { SessionStorageKey } from '#lib/constants.ts';
import { handlePromiseError } from '#lib/utils.ts';
import { tick, untrack } from 'svelte';
import { navigating } from '$app/state';

interface Options {
  /** This must be kept the same in all subpages of this route for the scroll memory clearer to work. */
  routeStartsWith: string;
  /** Function to clear additional data/state before scrolling (ex infinite scroll). */
  beforeClear?: () => void;
}

interface PageOptions extends Options {
  /** Local Omarchy layer: links whose screen position should survive changes to the list's rows. */
  anchorSelector?: string;
  /** Function to save additional data/state before scrolling (ex infinite scroll). */
  beforeSave?: () => void;
  /** Function to load additional data/state before scrolling (ex infinite scroll). */
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

/** Local Omarchy layer: the link being opened (or else the first one in view), and where it sits on screen. */
const saveAnchor = (node: HTMLElement, selector: string, pathname: string) => {
  const links = [...node.querySelectorAll<HTMLAnchorElement>(selector)];
  const viewport = node.getBoundingClientRect();
  const visited = links.find((link) => link.pathname === pathname);
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
};

/** Local Omarchy layer: hold the visited link in place while the grid finishes laying out, until the next user action. */
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

/** Attach to the scroll slot element, typically from {@link UserPageLayout}. */
export function scrollMemory({ routeStartsWith, beforeSave, beforeClear, beforeScroll, anchorSelector }: PageOptions) {
  return (node: HTMLElement) => {
    // Local Omarchy layer: a page left while its restoration is still loading must neither scroll nor clear the
    // position its replacement will need
    let active = true;
    let stopAnchoring: (() => void) | undefined;

    $effect(() => {
      const to = navigating?.to;
      if (!to) {
        return;
      }
      untrack(() => {
        // Local Omarchy layer: leaving this section clears even a restoration that is still loading
        if (!to.url.pathname.startsWith(routeStartsWith)) {
          beforeClear?.();
          clearPosition();
          return;
        }
        if (sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION) === null) {
          // Save current scroll information when going into a subpage.
          beforeSave?.();
          sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, node.scrollTop.toString());
          if (anchorSelector) {
            saveAnchor(node, anchorSelector, to.url.pathname);
          }
        }
      });
    });

    untrack(() =>
      handlePromiseError(
        (async () => {
          await beforeScroll?.();
          // Local Omarchy layer: fetching the rows is not enough: Svelte must render their height before the
          // browser can restore an offset beyond the first page
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
      ),
    );

    return () => {
      active = false;
      stopAnchoring?.();
    };
  };
}

export function scrollMemoryClearer({ routeStartsWith, beforeClear }: Options) {
  return () => {
    // Forget scroll position from main page if going somewhere else.
    if (!navigating?.to || navigating?.to.url.pathname.startsWith(routeStartsWith)) {
      return;
    }

    beforeClear?.();
    clearPosition();
  };
}
