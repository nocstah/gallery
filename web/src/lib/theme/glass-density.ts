// Local Omarchy layer: how dense the glass chrome's ground is (Settings > Theme > Top bar: Glass; omarchy-world.css's
// --ws-glass-ground). The bar's faintest words on the glass, its muted ink halfway to the ink (--ws-glass-muted), must
// hold AA over whatever photo scrolls under them, and how much ground that takes is the theme's to decide: the least
// density, from the 64% the bar had to 95%, at which they keep 4.6:1 (AA's 4.5 and a hair for rounding) over a white
// photo and over a black one. A white photo is the hardest for words lighter than their ground (a dark face), a black
// one for darker words (a light face), and nothing brighter or darker can come under the glass. It is worked out from
// the theme's own colours whenever they change (the face, a theme chosen here) and set as --ws-glass-density on the
// root; until it is, the stylesheet's fallback holds. One density for every theme would have to be the densest
// theme's, about 91% where most need 82%.
import { contrast } from '$lib/theme/derive';

type Rgb = [number, number, number];

export const GLASS_DENSITY_FLOOR = 64;
export const GLASS_DENSITY_CEILING = 95;
const TARGET = 4.6;

const toHex = (colour: Rgb) =>
  '#' +
  colour
    .map((value) =>
      Math.round(Math.max(0, Math.min(255, value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** the glass of `surface` at `density` (0 to 100) over a grey photo of `level` (0 to 255), as the page composites it */
const glassOver = (surface: Rgb, density: number, level: number) =>
  toHex(surface.map((value) => (density / 100) * value + (1 - density / 100) * level) as Rgb);

/**
 * The least density, a percentage from GLASS_DENSITY_FLOOR to GLASS_DENSITY_CEILING, at which `words` keep 4.6:1 on the
 * glass of `surface` over a white photo and over a black one; the ceiling when even that cannot.
 */
export const glassDensity = (surface: Rgb, words: Rgb): number => {
  const text = toHex(words);
  for (let density = GLASS_DENSITY_FLOOR; density < GLASS_DENSITY_CEILING; density++) {
    if ([0, 255].every((level) => contrast(text, glassOver(surface, density, level)) >= TARGET)) {
      return density;
    }
  }
  return GLASS_DENSITY_CEILING;
};

// a colour as the page draws it, whatever its syntax (a theme's hex, a color-mix() worked out), through one pixel; none
// while it is not opaque (a theme's words always are: something has made the text see-through for a moment)
let pixel: OffscreenCanvasRenderingContext2D | null | undefined;
const drawn = (colour: string): Rgb | undefined => {
  pixel ??= new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  if (!pixel) {
    return;
  }
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = '#000';
  pixel.fillStyle = colour;
  pixel.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = pixel.getImageData(0, 0, 1, 1).data;
  return alpha === 255 ? [red, green, blue] : undefined;
};

// one hidden element that wears the ground and the words, put in place once: a fit only reads its computed colours, so
// fitting again changes nothing in the page unless the density does
let probe: HTMLElement | undefined;

/** Fits the ground to the colours on screen now; the root's style is touched only when the density changes. */
export const fitGlassDensity = () => {
  try {
    if (!probe?.isConnected) {
      probe = document.createElement('span');
      probe.hidden = true;
      probe.style.cssText = 'color: var(--ws-glass-muted); background-color: var(--immich-ui-light)';
      document.body.append(probe);
    }
    const colours = getComputedStyle(probe);
    const surface = drawn(colours.backgroundColor);
    const words = drawn(colours.color);
    const root = document.documentElement.style;
    const density = surface && words ? `${glassDensity(surface, words)}%` : undefined;
    if (density && root.getPropertyValue('--ws-glass-density') !== density) {
      root.setProperty('--ws-glass-density', density);
    }
  } catch {
    // no canvas to read a colour with: the stylesheet's fallback stays
  }
};

let started = false;
let frame = 0;
const refit = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(fitGlassDensity);
};

/** A change in the head that can bring other colours: a stylesheet or a style added, taken away or rewritten. */
const restyles = (records: MutationRecord[]) =>
  records.some((record) =>
    [record.target, ...record.addedNodes, ...record.removedNodes].some(
      (node) =>
        node instanceof HTMLStyleElement ||
        node instanceof HTMLLinkElement ||
        node.parentNode instanceof HTMLStyleElement,
    ),
  );

/** Called once with the chrome: fits now, and again whenever the colours may have changed. */
export const startGlassDensity = () => {
  if (started || typeof OffscreenCanvas !== 'function') {
    return;
  }
  started = true;
  fitGlassDensity();
  // light or dark (the desktop's, or Light / Dark in the View menu) flips a class on the root; a theme chosen here, or
  // its CSS put back, changes a style in the head; the desktop's own colours arrive with the page (custom.css)
  new MutationObserver(refit).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver((records) => restyles(records) && refit()).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  addEventListener('load', refit, { once: true });
};
