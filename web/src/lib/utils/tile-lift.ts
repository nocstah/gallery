// Local Omarchy layer: how far a hovered photo lifts (Gallery's hover lift, lib/gallery/motion/motion.css). Gallery
// grows every photo by a tenth, which on small thumbnails is a few pixels: the owner, 2026-11-17, "it should then hover
// a lot bigger so you can see what the photo is". So a small photo (its row LIFT_FULL_BELOW_PX tall or less) grows
// until it is about LIFT_TARGET_PX on a side (by its area, so a panorama and a portrait grow alike), one the usual size
// (rows from LIFT_GALLERY_FROM_PX) lifts by Gallery's tenth, and the sizes between blend, by the row's height so a row
// lifts alike. Never past LIFT_MAX, never larger than the scroll area, and placed where all of it stays inside that
// area, clear of its edges.
//
// It grows by a transform the compositor runs (a translate and a scale on the photo's layer, ws-tile-media), never by
// its size: grown by its box, every frame of the lift laid the tile out and painted the photo and its shadow again, and
// the zoom stuttered (the owner, 2026-11-18: "it doesn't zoom smoothly"). The frame carries the lift as an offset and a
// scale (`--ws-lift-x/-y`, `--ws-lift-s`), set as the pointer comes onto it, before the hover's transition starts;
// omarchy-world.css reads them, and keeps what sits on a photo that grows a lot (`data-ws-lift`: the caption, the badges,
// the heart) at its own size.
//
// This is Kioku's whole hover lift: Gallery's own listeners (thumbnail-lift.ts) measured every photo the pointer entered
// a second time, for a transform origin and a date lift Kioku does not use, so they are not installed
// (lib/gallery/motion/index.ts), and the settling mark Gallery's stacking rules key off is set here.
import { SETTLE_MS, SETTLING_ATTR } from '#lib/gallery/motion/thumbnail-lift.ts';

/** About how large a lifted photo stands, in CSS px on a side (the square root of its area): one you can make out. */
export const LIFT_TARGET_PX = 300;
/** Rows this tall or less, in CSS px, lift to the full LIFT_TARGET_PX. */
export const LIFT_FULL_BELOW_PX = 120;
/** Rows this tall or more lift as Gallery's own do: the photo can be made out already. */
export const LIFT_GALLERY_FROM_PX = 200;
/** Gallery's own lift, the least any photo grows. */
export const LIFT_MIN = 1.1;
/** The most a photo grows: past this a thumbnail is stretched past what it holds. */
export const LIFT_MAX = 5;
/** Room kept between a lifted photo and the scroll area's edge, in CSS px. */
export const LIFT_MARGIN_PX = 8;
/** From this scale on, what sits on the photo keeps its own size rather than growing with it. */
export const LIFT_BIG_FROM = 1.3;

/** The frame's mark for a lift that keeps what sits on the photo at its own size. */
export const LIFT_ATTR = 'data-ws-lift';

const THUMBNAIL = '[data-thumbnail-focus-container]';

type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/** How many times a photo of this size grows, inside an area of this size. */
export const liftScale = (width: number, height: number, roomWidth: number, roomHeight: number): number => {
  if (width <= 0 || height <= 0) {
    return 1;
  }
  const full = Math.min(LIFT_MAX, Math.max(LIFT_MIN, LIFT_TARGET_PX / Math.sqrt(width * height)));
  const small = Math.min(1, Math.max(0, (LIFT_GALLERY_FROM_PX - height) / (LIFT_GALLERY_FROM_PX - LIFT_FULL_BELOW_PX)));
  const wanted = LIFT_MIN + small * (full - LIFT_MIN);
  const fits = Math.min((roomWidth - 2 * LIFT_MARGIN_PX) / width, (roomHeight - 2 * LIFT_MARGIN_PX) / height);
  return Math.max(1, Math.min(wanted, fits));
};

/**
How far, along one axis, the lifted photo's start lies from the photo's own: grown about its centre, then moved back
inside [lo, hi], the margin clear.
*/
export const liftOffset = (start: number, size: number, lo: number, hi: number, scale: number): number => {
  if (scale <= 1) {
    return 0;
  }
  const grown = size * scale;
  const centred = start + (size - grown) / 2;
  const target = Math.min(Math.max(centred, lo + LIFT_MARGIN_PX), hi - LIFT_MARGIN_PX - grown);
  return target - start;
};

/** The lift of a photo inside an area: how far its top left corner moves, and how many times it grows. */
export const liftBox = (photo: Box, area: Box) => {
  const scale = liftScale(photo.width, photo.height, area.width, area.height);
  return {
    x: liftOffset(photo.left, photo.width, area.left, area.right, scale),
    y: liftOffset(photo.top, photo.height, area.top, area.bottom, scale),
    scale,
  };
};

/** The nearest ancestor that clips its overflow (the timeline's scroll area), within the window. */
const clipBox = (element: Element): Box => {
  let box: Box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (/auto|scroll|hidden|clip/.test(overflowX + overflowY) && !parent.matches('[data-image-grid]')) {
      const rect = parent.getBoundingClientRect();
      const left = Math.max(box.left, rect.left);
      const top = Math.max(box.top, rect.top);
      const right = Math.min(box.right, rect.right);
      const bottom = Math.min(box.bottom, rect.bottom);
      box = { left, top, right, bottom, width: right - left, height: bottom - top };
      break;
    }
  }
  return box;
};

const px = (value: number) => `${value.toFixed(1)}px`;

/** The pointer moved between two photos, or onto or off one, rather than within one. */
const crossing = (event: MouseEvent, thumbnail: Element) =>
  !(event.relatedTarget instanceof Node && thumbnail.contains(event.relatedTarget));

const onMouseOver = (event: MouseEvent) => {
  const thumbnail = event.target instanceof Element ? event.target.closest<HTMLElement>(THUMBNAIL) : null;
  if (!thumbnail || !crossing(event, thumbnail)) {
    return;
  }
  // the frame keeps its place and size while its photo grows, so its box is the photo's at rest
  const rect = thumbnail.getBoundingClientRect();
  const lift = liftBox(rect, clipBox(thumbnail));
  const { style } = thumbnail;
  style.setProperty('--ws-lift-x', px(lift.x));
  style.setProperty('--ws-lift-y', px(lift.y));
  style.setProperty('--ws-lift-s', lift.scale.toFixed(4));
  thumbnail.toggleAttribute(LIFT_ATTR, lift.scale >= LIFT_BIG_FROM);
};

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Gallery's stacking rules keep a photo raised while it shrinks back, for as long as SETTLING_ATTR is on it. */
const onMouseOut = (event: MouseEvent) => {
  const thumbnail = event.target instanceof Element ? event.target.closest(THUMBNAIL) : null;
  if (!thumbnail || !crossing(event, thumbnail)) {
    return;
  }
  clearTimeout(timers.get(thumbnail));
  thumbnail.setAttribute(SETTLING_ATTR, '');
  timers.set(
    thumbnail,
    setTimeout(() => {
      thumbnail.removeAttribute(SETTLING_ATTR);
      timers.delete(thumbnail);
    }, SETTLE_MS),
  );
};

/** Installs the document listeners. Returns the uninstaller. */
export const installTileLift = (target: Document = document): (() => void) => {
  target.addEventListener('mouseover', onMouseOver, { passive: true });
  target.addEventListener('mouseout', onMouseOut, { passive: true });
  return () => {
    target.removeEventListener('mouseover', onMouseOver);
    target.removeEventListener('mouseout', onMouseOut);
  };
};
