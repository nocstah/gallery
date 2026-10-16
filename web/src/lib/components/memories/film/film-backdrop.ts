import { thumbHashToRGBA } from 'thumbhash';
import { decodeBase64 } from '$lib/utils';

// Local Omarchy layer: what a photo shown whole lies on in the film (DESIGN.md, Memories, The film): its thumbhash,
// the blurred miniature every asset carries, a little richer and dimmed in its pixels, drawn once into a small PNG. The
// viewer's .ws-ambient blurs the thumbnail with a CSS filter, which a photo drifting above it would make the browser
// work out again on every frame (a third of the frame rate at 2560x1440, measured); a few dozen pixels scaled up are
// as soft and cost nothing.

const SATURATION = 1.5;
const BRIGHTNESS = 0.62;

const made = new Map<string, string | null>();

/** The thumbhash's colours, richer and dimmed, in place (RGBA). */
export const deepen = (rgba: Uint8Array) => {
  for (let at = 0; at < rgba.length; at += 4) {
    const mean = (rgba[at] + rgba[at + 1] + rgba[at + 2]) / 3;
    for (let channel = at; channel < at + 3; channel++) {
      rgba[channel] = Math.min(255, Math.max(0, (mean + (rgba[channel] - mean) * SATURATION) * BRIGHTNESS));
    }
  }
  return rgba;
};

/** A data URL of the backdrop for a thumbhash (base64), or undefined without one or without a canvas. */
export const thumbhashBackdrop = (thumbhash: string | null | undefined): string | undefined => {
  if (!thumbhash) {
    return undefined;
  }
  const known = made.get(thumbhash);
  if (known !== undefined) {
    return known ?? undefined;
  }
  let url: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      const { w, h, rgba } = thumbHashToRGBA(decodeBase64(thumbhash));
      canvas.width = w;
      canvas.height = h;
      const pixels = context.createImageData(w, h);
      pixels.data.set(deepen(rgba));
      context.putImageData(pixels, 0, 0);
      url = canvas.toDataURL('image/png');
    }
  } catch {
    // no canvas: the photo lies on black
  }
  made.set(thumbhash, url);
  return url ?? undefined;
};
