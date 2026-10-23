import { rgbaToThumbHash } from 'thumbhash';

// Local Omarchy layer: a thumbhash of one flat grey, base64 as Gallery sends it, for the specs of what reads a
// picture's light from its thumbhash (utils/thumbhash-light): 0 is black, 255 white.
export const flatThumbhash = (grey: number, width = 8, height = 8) => {
  const rgba = new Uint8Array(width * height * 4);
  for (let at = 0; at < rgba.length; at += 4) {
    rgba.set([grey, grey, grey, 255], at);
  }
  return btoa(String.fromCodePoint(...rgbaToThumbHash(width, height, rgba)));
};

/** A light picture's thumbhash (a day outside) and a dim one's (a room at night). */
export const BRIGHT = flatThumbhash(200);
export const DIM = flatThumbhash(40);
