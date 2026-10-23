// Local Omarchy layer: how light a picture is, from the thumbhash every asset already carries, so choosing a face or a
// film's opening downloads no image (utils/period-faces, managers/place-faces, components/room/room-opening). The
// thumbhash's average colour is its first term, read without decoding the picture; its light is that colour's relative
// luminance (WCAG), 0 for black to 1 for white.
import { thumbHashToAverageRGBA } from 'thumbhash';

/**
 * Below this a picture reads as dim. On the owner's library (677 favourite photos, 1,275 photos of 40 months) the
 * darkest tenth lies under 0.06 and the darkest quarter under 0.10; the middle is 0.16 to 0.19. A night shot or an
 * unlit room lands under it, a room by daylight or an evening lamp at about it, a day outside well above.
 */
export const DIM_BELOW = 0.1;

const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** A picture's light from its thumbhash (base64, as Gallery sends it), 0 to 1; undefined without a readable one. */
export const thumbhashLight = (thumbhash: string | null | undefined): number | undefined => {
  if (!thumbhash) {
    return undefined;
  }
  try {
    const bytes = Uint8Array.from(atob(thumbhash), (character) => character.codePointAt(0)!);
    if (bytes.length < 5) {
      return undefined;
    }
    const { r, g, b } = thumbHashToAverageRGBA(bytes);
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  } catch {
    return undefined;
  }
};

/** Whether a picture is dim, or nothing says it is not (no thumbhash). */
export const isDim = (thumbhash: string | null | undefined) => {
  const light = thumbhashLight(thumbhash);
  return light === undefined || light < DIM_BELOW;
};
