import { thumbHashToRGBA } from 'thumbhash';
import { deepen } from './film-backdrop';
import { decodeThumbhash } from './film-media';
import { coverWindow, type FilmCamera, type FilmShot } from './film-plan';

// Local Omarchy layer: how much black the film lays under its words on each photo (DESIGN.md, Memories, The film: the
// shade). The caption scrim at the foot and the lighter one under the top bar are the same on every photo, light enough
// for a dark one; on a bright one (sand, snow, a white shirt, a sky) white words fell to 2:1. So each shot gets a shade
// of its own: the photo says how bright it is where the words will lie on it (through the shot's crop and drift, or for
// a photo shown whole, on it and on its backdrop), first its thumbhash, the blurred miniature every asset carries, then,
// once it is decoded, the photo itself at a small size; and the shade is the black that brings the brightest of that to
// the ratio the words need: WCAG AA, 4.5:1, or 3:1 for large text. What the scrim already lays there is counted, so a
// dark photo gets none. Plain functions of numbers and pixels, so they can be tested and, one day, handed to Curator's
// renderer.

/** A part of the frame, in shares of its width and height from its top-left corner. */
export type FrameBox = { left: number; top: number; right: number; bottom: number };

/**
 * Words on the photo, as the shade needs them: where they lie in the frame, the opacity of their white (`ink`), the
 * ratio they must hold (`ratio`: 4.5, or 3 for large text) and the black the scrim already lays where it is thinnest
 * under them (`scrim`).
 */
export type FilmWords = { box: FrameBox; ink: number; ratio: number; scrim: number };

/** The shade never goes past this: the photo stays a photo under its words. */
export const SHADE_MOST = 0.72;

/**
 * The margin for what a thumbhash smooths away (a white shirt's pattern, sun through leaves): the brightest it finds
 * under the words is taken this many times brighter, in sRGB (150 as 255), so a dark photo stays dark. Measured on 234
 * of the memories' photos (2026-10-18): where the story stands, the photo's own brightest twentieth came out under the
 * thumbhash's brightest so raised for 97 photos in 100 (its brightest tenth for all); under the top bar, 94 (99).
 */
export const SHADE_GAIN = 1.7;

/**
 * The photo itself, once decoded, is read at this many pixels on its longer side, and the light under the words is its
 * brightest fiftieth there, or for words of the normal size its brightest two-hundredth. Measured on the same 234
 * photos, the brightest fiftieth at 128 pixels already stood above the full-size photo's brightest twentieth under the
 * story for every one; a single line of small type over fine detail (gravel, a print) needed the finer read and the
 * brighter share (2026-10-18: the title card's line had come out at 4.3:1 there).
 */
export const PICTURE_SIDE = 512;
const LARGE_SHARE = 0.98;
const SMALL_SHARE = 0.995;
/** The shade aims this much past the ratio the words need: room for the frames between the drift's two ends and for
 * what a 512px read still misses (a title card's line had come out at 4.45:1 against its 4.5). */
export const HEADROOM = 1.04;

/** Where nothing is known (no thumbhash): a photo as bright as a light grey wall. */
const UNKNOWN_LIGHT = 0.45;

type Pixels = { w: number; h: number; rgba: Uint8Array };

/** What a shot shows, as the shade reads it: the photo's pixels (its thumbhash's, or its own at a small size, `exact`)
 * and its backdrop's when it is shown whole (the thumbhash's, richer and dimmed, as film-backdrop.ts draws it). */
export type FilmPicture = { photo: Pixels; backdrop: Pixels; ratio: number; exact: boolean };

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG's relative luminance of an sRGB colour (channels 0 to 255). */
export const relativeLuminance = (r: number, g: number, b: number) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** The grey (0 to 255) with this relative luminance. */
const greyOf = (light: number) => {
  const l = Math.min(1, Math.max(0, light));
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return c * 255;
};

/** White words at `ink` opacity on a grey ground: their WCAG ratio, the ink blended over the ground as a browser does. */
const ratioOn = (grey: number, ink: number) => {
  const ground = relativeLuminance(grey, grey, grey);
  const text = ink * 255 + (1 - ink) * grey;
  const words = relativeLuminance(text, text, text);
  return (Math.max(words, ground) + 0.05) / (Math.min(words, ground) + 0.05);
};

/**
 * The black (its opacity, 0 to 1) that a ground of this luminance needs laid over it so that white words at `ink`
 * opacity hold `ratio` on it: 0 for a ground dark enough already.
 */
export const darknessFor = (light: number, ink: number, ratio: number) => {
  const grey = greyOf(light);
  if (ratioOn(grey, ink) >= ratio) {
    return 0;
  }
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (ratioOn(grey * (1 - middle), ink) >= ratio) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high;
};

const decoded = new Map<string, FilmPicture | null>();
const DECODED_KEPT = 256;

/** A thumbhash as a picture, decoded once. */
export const thumbhashPicture = (thumbhash: string | null | undefined): FilmPicture | null => {
  if (!thumbhash) {
    return null;
  }
  const known = decoded.get(thumbhash);
  if (known !== undefined) {
    return known;
  }
  let value: FilmPicture | null = null;
  try {
    const { w, h, rgba } = thumbHashToRGBA(decodeThumbhash(thumbhash));
    const backdrop = { w, h, rgba: deepen(Uint8Array.from(rgba)) };
    value = { photo: { w, h, rgba }, backdrop, ratio: w / h, exact: false };
  } catch {
    // not a thumbhash: nothing is known
  }
  if (decoded.size >= DECODED_KEPT) {
    decoded.clear();
  }
  decoded.set(thumbhash, value);
  return value;
};

let reader: HTMLCanvasElement | OffscreenCanvas | undefined;

/** A decoded photo as a picture, read at PICTURE_SIDE, its backdrop the thumbhash's; null where it cannot be read. */
export const imagePicture = (image: HTMLImageElement, thumbhash: string | null | undefined): FilmPicture | null => {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || !image.complete) {
    return null;
  }
  const w = Math.max(1, Math.round(width >= height ? PICTURE_SIDE : (PICTURE_SIDE * width) / height));
  const h = Math.max(1, Math.round(width >= height ? (PICTURE_SIDE * height) / width : PICTURE_SIDE));
  try {
    reader ??= typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    reader.width = w;
    reader.height = h;
    const context = reader.getContext('2d', { willReadFrequently: true }) as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, w, h);
    const { data } = context.getImageData(0, 0, w, h);
    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const backdrop = thumbhashPicture(thumbhash)?.backdrop ?? { w, h, rgba: deepen(Uint8Array.from(rgba)) };
    return { photo: { w, h, rgba }, backdrop, ratio: width / height, exact: true };
  } catch {
    // no canvas here, or a photo it may not read: the thumbhash says it
    return null;
  }
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The colour at a point (shares of the picture), between its pixels' centres. */
const sample = ({ w, h, rgba }: Pixels, x: number, y: number): [number, number, number] => {
  const fx = clamp(x * w - 0.5, 0, w - 1);
  const fy = clamp(y * h - 0.5, 0, h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (px: number, py: number, channel: number) => rgba[(py * w + px) * 4 + channel];
  const mix = (channel: number) =>
    (at(x0, y0, channel) * (1 - tx) + at(x1, y0, channel) * tx) * (1 - ty) +
    (at(x0, y1, channel) * (1 - tx) + at(x1, y1, channel) * tx) * ty;
  return [mix(0), mix(1), mix(2)];
};

/** The vignette over a whole photo's backdrop (`.film-vignette`): no black to 35% of the way to a corner, 0.6 there. */
const vignetteAt = (u: number, v: number) => {
  const reach = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / Math.SQRT2;
  return reach <= 0.35 ? 0 : (0.6 * (reach - 0.35)) / 0.65;
};

type Shot = Pick<FilmShot, 'fit' | 'ratio' | 'from' | 'to'>;

/** What lies at a point of the frame (shares of it) with the camera there: the photo, or, beside a photo shown whole,
 * its backdrop under the vignette. `lift` raises a whole photo (a share of the frame's height). */
const groundAt = (
  picture: FilmPicture,
  shot: Shot,
  aspect: number,
  camera: FilmCamera,
  lift: number,
  u: number,
  v: number,
): [number, number, number] => {
  const ratio = shot.ratio && shot.ratio > 0 ? shot.ratio : picture.ratio;
  if (shot.fit === 'fill' && shot.ratio) {
    const window = coverWindow(ratio, aspect);
    return sample(
      picture.photo,
      camera.x + ((u - 0.5) * window.w) / camera.scale,
      camera.y + ((v - 0.5) * window.h) / camera.scale,
    );
  }
  // shown whole: the photo's box (contain), raised by `lift`, breathing around its middle
  const width = (ratio >= aspect ? 1 : ratio / aspect) * camera.scale;
  const height = (ratio >= aspect ? aspect / ratio : 1) * camera.scale;
  const left = 0.5 - width / 2;
  const top = 0.5 - lift - height / 2;
  if (u >= left && u <= left + width && v >= top && v <= top + height) {
    return sample(picture.photo, (u - left) / width, (v - top) / height);
  }
  const cover = coverWindow(picture.backdrop.w / picture.backdrop.h, aspect);
  const [r, g, b] = sample(picture.backdrop, 0.5 + (u - 0.5) * cover.w, 0.5 + (v - 0.5) * cover.h);
  const keep = 1 - vignetteAt(u, v);
  return [r * keep, g * keep, b * keep];
};

/** What a thumbhash's light is taken to be under words: brighter, by the margin for the detail it lacks. */
export const withMargin = (light: number) => {
  const grey = Math.min(255, greyOf(light) * SHADE_GAIN);
  return relativeLuminance(grey, grey, grey);
};

/**
 * How bright a shot is under a part of the frame, for words on it (relative luminance, 0 to 1), at the drift's start
 * and end, the camera's two ends being where it is furthest apart: the photo's own brightest share there (`share`: a
 * fiftieth, or a two-hundredth for small type), read across the part; or the brightest its thumbhash shows there,
 * raised by the margin for what it smooths away.
 */
export const shotLight = (
  picture: FilmPicture | null,
  shot: Shot,
  aspect: number,
  box: FrameBox,
  lift = 0,
  share = LARGE_SHARE,
) => {
  if (!picture) {
    return UNKNOWN_LIGHT;
  }
  // the thumbhash's few dozen pixels on a coarse grid; a photo's own across about as many points as it has pixels
  const columns = picture.exact ? 96 : 12;
  const rows = picture.exact ? 32 : 6;
  let light = 0;
  for (const camera of [shot.from, shot.to]) {
    const lights: number[] = [];
    for (let row = 0; row <= rows; row++) {
      const v = box.top + ((box.bottom - box.top) * row) / rows;
      for (let column = 0; column <= columns; column++) {
        const u = box.left + ((box.right - box.left) * column) / columns;
        const [r, g, b] = groundAt(picture, shot, aspect, camera, lift, u, v);
        lights.push(relativeLuminance(r, g, b));
      }
    }
    lights.sort((a, b) => a - b);
    const at = picture.exact ? Math.min(lights.length - 1, Math.floor(share * lights.length)) : lights.length - 1;
    light = Math.max(light, lights[at]);
  }
  return picture.exact ? light : withMargin(light);
};

/**
 * The shade a shot lays under its words (an opacity of black, 0 to SHADE_MOST): the most any of them needs, each over
 * how bright the photo is under it, less what the scrim already gives there.
 */
export const shotShade = (picture: FilmPicture | null, shot: Shot, aspect: number, words: FilmWords[], lift = 0) => {
  let shade = 0;
  for (const { box, ink, ratio, scrim } of words) {
    // small type is read against the brighter share: one bright pebble under a 12px line is a letter lost
    const light = shotLight(picture, shot, aspect, box, lift, ratio > 3 ? SMALL_SHARE : LARGE_SHARE);
    const dark = darknessFor(light, ink, ratio * HEADROOM);
    shade = Math.max(shade, 1 - (1 - dark) / (1 - clamp(scrim, 0, 0.99)));
  }
  return Math.round(clamp(shade, 0, SHADE_MOST) * 1000) / 1000;
};

/**
 * How far a photo shown whole is raised (a share of the frame's height) so its lower edge clears the words: only a
 * photo wider than the frame's shape has room above and below it (a landscape photo on a phone held upright), and it
 * goes no higher than `top` from the frame's top. `reach` is how far up the words come, `gap` the air under the photo.
 */
export const wholeLift = (ratio: number | null, aspect: number, reach: number, gap: number, top = 0) => {
  if (!ratio || ratio <= 0 || aspect <= 0 || ratio <= aspect) {
    return 0;
  }
  const spare = (1 - aspect / ratio) / 2;
  const wanted = reach + gap - spare;
  return Math.round(clamp(wanted, 0, Math.max(0, spare - top)) * 10_000) / 10_000;
};

/** A scrim's gradient (to top) as stops: [a share of its height from its foot, the black there]. */
export type ScrimStops = [number, number][];

/** `.film-scrim-foot`, the screen's and the room's, and the memory card's (MemoryCard.svelte) */
export const FOOT_SCRIM: ScrimStops = [
  [0, 0.55],
  [0.35, 0.32],
  [0.7, 0.1],
  [1, 0],
];
export const ROOM_SCRIM: ScrimStops = [
  [0, 0.62],
  [0.38, 0.36],
  [0.72, 0.12],
  [1, 0],
];
export const CARD_SCRIM: ScrimStops = [
  [0, 0.55],
  [0.45, 0.12],
  [0.7, 0],
  [1, 0],
];

/** A scrim's black at a height over its foot (a share of the scrim's own height). */
export const scrimAt = (height: number, stops: ScrimStops) => {
  const at = clamp(height, 0, 1);
  for (let index = 1; index < stops.length; index++) {
    const [x1, y1] = stops[index];
    if (at <= x1) {
      const [x0, y0] = stops[index - 1];
      return Math.max(0, Math.round((y0 + ((y1 - y0) * (at - x0)) / (x1 - x0)) * 10_000) / 10_000);
    }
  }
  return 0;
};

/** The top bar's scrim (`.film-scrim-head`): 0.42 of black at the frame's top, none at its foot. */
export const headScrimAt = (depth: number) => 0.42 * (1 - clamp(depth, 0, 1));

// ---- words as they stand in the page ----

/** The box of an element's text itself, not of the element: a short line in a wide block is short. */
export const textBox = (element: Element | null | undefined) => {
  if (!element) {
    return undefined;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : undefined;
};

/** A length in CSS pixels as getComputedStyle gives it ("17px"). */
export const pixels = (value: string) => Number(value.replace(/px$/, '')) || 0;

/**
 * Words as the shade needs them: their box (`rect`) as shares of the frame they stand in, the opacity of their white,
 * the ratio WCAG AA asks of them (3:1 for large text, 24px, or 18.66px at 700; else 4.5:1), and the scrim under them.
 */
export const wordsIn = (
  element: Element,
  rect: DOMRect,
  frame: { left: number; top: number; width: number; height: number },
  scrim: number,
): FilmWords => {
  const style = getComputedStyle(element);
  const size = pixels(style.fontSize);
  const weight = Number(style.fontWeight) || 400;
  const alpha = (style.color.match(/[\d.]+%?/g) ?? [])[3];
  return {
    box: {
      left: (rect.left - frame.left) / frame.width,
      top: (rect.top - frame.top) / frame.height,
      right: (rect.right - frame.left) / frame.width,
      bottom: (rect.bottom - frame.top) / frame.height,
    },
    ink: alpha === undefined ? 1 : alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha),
    ratio: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
    scrim,
  };
};
