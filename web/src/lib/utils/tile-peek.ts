// Local Omarchy layer: the peek. Space on a photo in a grid (the one under the pointer, else the one with focus) shows it
// large over the page, flown out of its tile, sharpening to the preview as it lands, a video playing silently, the date
// and place under it (the owner, 2026-11-18: "you mouse over and then you click space ... it fills most of the space on
// the page so you get a quick preview"). Space or Escape again, a click beside it, the wheel or any other key puts it
// back; held, Space shows it only while it is held. Enter or a click on the photo opens it in the viewer, flown from the
// peek (viewer-zoom's flyFrom).
//
// The peek covers the page, so nothing under it answers the pointer meanwhile, and the tile stands empty: the photo has
// left its place (data-ws-peeking, omarchy-world.css), as it does for the viewer.
import { duration, ease, prefersReducedMotion, spring } from '#lib/gallery/motion/tokens.ts';
import { flyFrom, transformBetween } from '#lib/gallery/motion/viewer-zoom.ts';
import { viewerStandsOver } from '#lib/utils/viewer-handover.ts';
import { isModalOpen } from '@immich/ui';

/** On the tile whose photo is peeked: its own photo steps out of sight. */
export const PEEKING_ATTR = 'data-ws-peeking';
/** Room kept between the peeked photo and the window's edges, in CSS px. */
export const PEEK_MARGIN_PX = 32;
/** The caption's line under the photo, in CSS px. */
export const PEEK_CAPTION_PX = 28;
/** Space held at least this long (ms) shows the photo only while it is held. */
export const PEEK_HOLD_MS = 400;

const THUMBNAIL = '[data-thumbnail-focus-container]';
const MEDIA = '.ws-tile-media';
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]';
/** Places that keep Space for themselves: dialogs, menus, lists, the bar's sheets. */
const AWAY = '[role="dialog"], [role="menu"], [role="listbox"], [data-bar-sheet]';
/** Root marks (actions/mark-root) of what stands over the grid: the viewer, a memory's film, the TV room. */
const OVER_THE_GRID = ['data-ws-film', 'data-ws-room'];

type Box = { left: number; top: number; width: number; height: number };

/** Where the peeked photo stands: as large as fits the window, the margin clear and a line kept for its caption. */
export const peekBox = (ratio: number, viewport: { width: number; height: number }): Box => {
  const roomWidth = Math.max(1, viewport.width - 2 * PEEK_MARGIN_PX);
  const roomHeight = Math.max(1, viewport.height - 2 * PEEK_MARGIN_PX - PEEK_CAPTION_PX);
  const safe = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const width = Math.min(roomWidth, roomHeight * safe);
  const height = width / safe;
  return {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height - PEEK_CAPTION_PX) / 2,
    width,
    height,
  };
};

/** The preview of a thumbnail's address: the same request at another size, as the viewer makes it. */
const sharpOf = (src: string) => (src.includes('size=thumbnail') ? src.replace('size=thumbnail', 'size=preview') : '');

interface Peek {
  tile: HTMLElement;
  assetId: string;
  root: HTMLDivElement;
  backdrop: HTMLDivElement;
  card: HTMLDivElement;
  caption?: HTMLParagraphElement;
  video?: HTMLVideoElement;
  box: Box;
  openedAt: number;
  state: 'open' | 'closing' | 'opening';
  unlisten: () => void;
}

let current: Peek | undefined;
/** The photo the pointer is on, if any. */
let pointed: HTMLElement | undefined;

const animates = () => typeof Element.prototype.animate === 'function';

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
  const made = document.createElement(tag);
  made.className = className;
  return made;
};

const layer = (src: string) => {
  const image = element('img', 'ws-peek-layer');
  image.alt = '';
  image.decoding = 'async';
  image.src = src;
  return image;
};

/** Comes in over what is under it once it can be shown. */
const fadeIn = (layered: HTMLElement) => (layered.dataset.shown = '');

const place = (target: HTMLElement, box: Box) =>
  Object.assign(target.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });

/** The rect of what the tile shows, when it is in the page and on screen. */
const tileRect = (tile: HTMLElement): DOMRect | undefined => {
  if (!tile.isConnected) {
    return;
  }
  const rect = (tile.querySelector(MEDIA) ?? tile).getBoundingClientRect();
  if (rect.width === 0 || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
    return;
  }
  return rect;
};

const finish = (peek: Peek) => {
  peek.unlisten();
  if (peek.video) {
    peek.video.pause();
    peek.video.removeAttribute('src');
    peek.video.load();
  }
  peek.tile.removeAttribute(PEEKING_ATTR);
  peek.root.remove();
  if (current === peek) {
    current = undefined;
  }
};

/** Puts the photo back into its tile; at once (`now`) when the page is about to change under it. */
const close = (peek: Peek, now = false) => {
  if (peek.state === 'opening') {
    return;
  }
  if (now || peek.state === 'closing' || !animates()) {
    finish(peek);
    return;
  }
  peek.state = 'closing';
  peek.unlisten();
  // where it stands now, half way out included, before its own motion is let go
  const at = peek.card.getBoundingClientRect();
  const dim = Number(getComputedStyle(peek.backdrop).opacity) || 1;
  for (const animation of peek.root.getAnimations({ subtree: true })) {
    animation.cancel();
  }
  const home = tileRect(peek.tile);
  const timing = { duration: spring.snappy.duration, easing: ease.settle, fill: 'forwards' } as const;
  peek.backdrop.animate([{ opacity: dim }, { opacity: 0 }], { ...timing, easing: ease.standard });
  peek.caption?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80, fill: 'forwards' });
  const back =
    home && !prefersReducedMotion()
      ? peek.card.animate(
          [{ transform: transformBetween(at, peek.box) }, { transform: transformBetween(home, peek.box) }],
          timing,
        )
      : peek.card.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: duration.quick,
          easing: ease.exit,
          fill: 'forwards',
        });
  void back.finished.catch(() => {}).then(() => finish(peek));
};

/** The image the peek shows now: the preview once it is in, else the thumbnail it started from. */
const shownImage = (peek: Peek) => {
  const layers = [...peek.card.querySelectorAll<HTMLImageElement>('img.ws-peek-layer')];
  return layers.findLast((image) => image.dataset.shown !== undefined) ?? layers[0];
};

/** Opens the photo in the viewer, flown from the peek; while photos are being selected, a click would select it. */
const openPhoto = (peek: Peek) => {
  if (peek.state !== 'open') {
    return;
  }
  if (document.querySelector('#control-bar') || !peek.tile.isConnected) {
    close(peek);
    return;
  }
  peek.state = 'opening';
  peek.unlisten();
  const image = shownImage(peek);
  const release = image ? flyFrom(peek.assetId, image) : () => {};
  peek.tile.click();
  release();
  peek.caption?.remove();
  // the flying copy is up over the photo now; the peek's own goes once that copy has painted
  requestAnimationFrame(() => requestAnimationFrame(() => (peek.card.style.visibility = 'hidden')));
  // the dimmed page stays until the viewer stands over it
  void viewerStandsOver().then(() => finish(peek));
};

const listenWhileOpen = (peek: Peek) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
      return;
    }
    if ([' ', 'Escape', 'Enter'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) {
        return;
      }
      if (event.key === 'Enter') {
        openPhoto(peek);
      } else {
        close(peek);
      }
      return;
    }
    // any other key is for the page, which may move under the photo: it goes back at once
    close(peek, true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (performance.now() - peek.openedAt >= PEEK_HOLD_MS) {
      close(peek);
    }
  };
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 0 && event.target instanceof Node && peek.card.contains(event.target)) {
      openPhoto(peek);
    } else {
      close(peek);
    }
  };
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    close(peek);
  };
  const onWheel = () => close(peek);
  const onResize = () => close(peek, true);
  addEventListener('keydown', onKeyDown, { capture: true });
  addEventListener('keyup', onKeyUp, { capture: true });
  addEventListener('resize', onResize);
  peek.root.addEventListener('click', onClick);
  peek.root.addEventListener('contextmenu', onContextMenu);
  peek.root.addEventListener('wheel', onWheel, { passive: true });
  return () => {
    removeEventListener('keydown', onKeyDown, { capture: true });
    removeEventListener('keyup', onKeyUp, { capture: true });
    removeEventListener('resize', onResize);
    peek.root.removeEventListener('click', onClick);
    peek.root.removeEventListener('contextmenu', onContextMenu);
    peek.root.removeEventListener('wheel', onWheel);
  };
};

const open = (tile: HTMLElement): boolean => {
  const assetId = tile.dataset.asset;
  const image = tile.querySelector<HTMLImageElement>(`${MEDIA} img`) ?? tile.querySelector('img');
  const src = image?.currentSrc || image?.src;
  const from = tileRect(tile);
  if (!assetId || !image || !src || !from) {
    return false;
  }
  if (current) {
    finish(current);
  }
  const ratio =
    image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : from.width / from.height;
  const box = peekBox(ratio, { width: innerWidth, height: innerHeight });

  const root = element('div', 'ws-peek');
  root.setAttribute('aria-hidden', 'true');
  const backdrop = element('div', 'ws-peek-backdrop');
  const card = element('div', 'ws-peek-card');
  place(card, box);
  card.append(layer(src));
  const sharp = sharpOf(src);
  if (sharp) {
    const sharper = layer(sharp);
    card.append(sharper);
    void sharper
      .decode()
      .then(() => fadeIn(sharper))
      .catch(() => {});
  }
  let video: HTMLVideoElement | undefined;
  if (tile.dataset.peekVideo) {
    video = element('video', 'ws-peek-layer');
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, src: tile.dataset.peekVideo });
    video.addEventListener('playing', () => video && fadeIn(video), { once: true });
    card.append(video);
    void video.play?.()?.catch(() => {});
  }
  const words = tile.querySelector('.ws-place')?.textContent?.replaceAll(/\s+/g, ' ').trim();
  let caption: HTMLParagraphElement | undefined;
  if (words) {
    caption = element('p', 'ws-peek-caption');
    caption.textContent = words;
    caption.style.top = `${box.top + box.height + 6}px`;
  }
  root.append(backdrop, card, ...(caption ? [caption] : []));

  const peek: Peek = {
    tile,
    assetId,
    root,
    backdrop,
    card,
    caption,
    video,
    box,
    openedAt: performance.now(),
    state: 'open',
    unlisten: () => {},
  };
  current = peek;
  tile.setAttribute(PEEKING_ATTR, '');
  document.body.append(root);
  const unlisten = listenWhileOpen(peek);
  peek.unlisten = () => {
    unlisten();
    peek.unlisten = () => {};
  };

  if (animates()) {
    const still = prefersReducedMotion();
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: still ? duration.quick : spring.snappy.duration,
      easing: ease.standard,
    });
    if (still) {
      card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration.quick, easing: ease.standard });
    } else {
      card.animate([{ transform: transformBetween(from, box) }, { transform: 'none' }], {
        duration: spring.snappy.duration,
        easing: ease.settle,
      });
    }
    caption?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: duration.quick,
      delay: still ? 0 : spring.snappy.duration * 0.6,
      easing: ease.standard,
      fill: 'backwards',
    });
  }
  return true;
};

const blocked = (target: EventTarget | null, tile: HTMLElement) =>
  (target instanceof Element && !!target.closest(`${EDITABLE}, ${AWAY}`)) ||
  !!tile.closest(AWAY) ||
  isModalOpen() ||
  !!document.querySelector('#immich-asset-viewer') ||
  OVER_THE_GRID.some((mark) => document.documentElement.hasAttribute(mark));

const onKeyDown = (event: KeyboardEvent) => {
  if (event.repeat) {
    return;
  }
  if (
    event.key !== ' ' ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    current
  ) {
    return;
  }
  const focused = event.target instanceof Element ? event.target.closest<HTMLElement>(THUMBNAIL) : null;
  const tile = (pointed?.isConnected ? pointed : undefined) ?? focused ?? undefined;
  if (!tile || blocked(event.target, tile)) {
    return;
  }
  if (open(tile)) {
    // not the page's scroll by a screen, nor a focused button's press
    event.preventDefault();
  }
};

const onMouseOver = (event: MouseEvent) => {
  pointed = (event.target instanceof Element && event.target.closest<HTMLElement>(THUMBNAIL)) || undefined;
};

const onMouseOut = (event: MouseEvent) => {
  if (!event.relatedTarget) {
    pointed = undefined;
  }
};

/** The root layout's `beforeNavigate`: the page is about to change under the photo, which goes back at once. */
export const closePeek = () => {
  if (current && current.state !== 'opening') {
    finish(current);
  }
};

/** Installs the document listeners. Returns the uninstaller. */
export const installTilePeek = (): (() => void) => {
  addEventListener('keydown', onKeyDown);
  document.addEventListener('mouseover', onMouseOver, { passive: true });
  document.addEventListener('mouseout', onMouseOut, { passive: true });
  return () => {
    removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    if (current) {
      finish(current);
    }
    pointed = undefined;
  };
};
