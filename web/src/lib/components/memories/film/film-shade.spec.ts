import { rgbaToThumbHash } from 'thumbhash';
import { deepen } from './film-backdrop';
import {
  darknessFor,
  headScrimAt,
  imagePicture,
  relativeLuminance,
  scrimAt,
  SHADE_MOST,
  shotLight,
  shotShade,
  thumbhashPicture,
  wholeLift,
  withMargin,
  type FilmPicture,
  type FilmWords,
} from './film-shade';

type Paint = (x: number, y: number) => [number, number, number];

/** The pixels of a picture w×h whose colour is `paint(x, y)` (shares of it). */
const pixelsOf = (w: number, h: number, paint: Paint) => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint((x + 0.5) / w, (y + 0.5) / h);
      rgba.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return rgba;
};

/** A thumbhash of such a picture */
const thumbhashOf = (w: number, h: number, paint: Paint) =>
  btoa(String.fromCodePoint(...rgbaToThumbHash(w, h, pixelsOf(w, h, paint))));

/** The picture its thumbhash gives */
const hashed = (w: number, h: number, paint: Paint) => thumbhashPicture(thumbhashOf(w, h, paint));

/** The picture a decoded photo gives, read at a small size */
const decoded = (w: number, h: number, paint: Paint): FilmPicture => {
  const rgba = pixelsOf(w, h, paint);
  return { photo: { w, h, rgba }, backdrop: { w, h, rgba: deepen(Uint8Array.from(rgba)) }, ratio: w / h, exact: true };
};

const still = { scale: 1, x: 0.5, y: 0.5 };
const fill = { fit: 'fill' as const, ratio: 1.5, from: still, to: still };
const lowerThird = { left: 0.05, top: 0.7, right: 0.6, bottom: 0.95 };
const story = (scrim = 0.25): FilmWords => ({ box: lowerThird, ink: 0.94, ratio: 4.5, scrim });

const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe(darknessFor.name, () => {
  it('lays nothing on a ground dark enough already', () => {
    expect(darknessFor(0.05, 0.94, 4.5)).toBe(0);
  });

  it('lays as much black as white words need to hold the ratio, more for a brighter ground', () => {
    const onWhite = darknessFor(1, 0.94, 4.5);
    const onGrey = darknessFor(0.4, 0.94, 4.5);

    expect(onWhite).toBeGreaterThan(onGrey);
    expect(onGrey).toBeGreaterThan(0);
    // white darkened by that black, and the words blended over it, are 4.5:1 apart
    const grey = 255 * (1 - onWhite);
    const words = 0.94 * 255 + 0.06 * grey;
    expect(ratioOf(relativeLuminance(words, words, words), relativeLuminance(grey, grey, grey))).toBeCloseTo(4.5, 1);
  });

  it('asks less for large text, and more for words that are less than white', () => {
    expect(darknessFor(0.8, 0.94, 3)).toBeLessThan(darknessFor(0.8, 0.94, 4.5));
    expect(darknessFor(0.8, 0.76, 4.5)).toBeGreaterThan(darknessFor(0.8, 0.94, 4.5));
  });
});

describe(withMargin.name, () => {
  it('keeps a dark photo dark and takes a bright one for white', () => {
    expect(withMargin(0)).toBe(0);
    expect(withMargin(0.01)).toBeLessThan(0.03);
    expect(withMargin(0.2)).toBeGreaterThan(0.2);
    expect(withMargin(0.4)).toBe(1);
  });
});

describe(shotLight.name, () => {
  it('reads how bright the photo is where the words lie', () => {
    // dark above, white below: the words at the foot lie on white
    const sky = hashed(30, 20, (_, y) => (y > 0.6 ? [250, 250, 250] : [20, 20, 30]));

    // (through a thumbhash's blur, raised by the margin for what it smooths away)
    expect(shotLight(sky, fill, 1.5, lowerThird)).toBeGreaterThan(0.7);
    expect(shotLight(sky, fill, 1.5, { left: 0.05, top: 0.05, right: 0.6, bottom: 0.3 })).toBeLessThan(0.35);
  });

  it('follows the crop and the drift: a camera on the dark part sees no light', () => {
    const half = decoded(120, 80, (x) => (x < 0.5 ? [245, 245, 245] : [15, 15, 15]));
    const right = { scale: 2, x: 0.75, y: 0.5 };

    expect(shotLight(half, { ...fill, from: right, to: right }, 1.5, lowerThird)).toBeLessThan(0.01);
    expect(shotLight(half, { ...fill, from: right, to: still }, 1.5, lowerThird)).toBeGreaterThan(0.85);
  });

  it('beside a photo shown whole reads its dimmed backdrop under the vignette, raised photos included', () => {
    const white = decoded(120, 80, () => [250, 250, 250]);
    const whole = { fit: 'whole' as const, ratio: 1.5, from: still, to: still };
    // a landscape photo on a phone held upright: the words at the foot lie on the backdrop, not the photo
    const foot = { left: 0.05, top: 0.85, right: 0.95, bottom: 0.95 };

    expect(shotLight(white, whole, 0.46, foot)).toBeLessThan(relativeLuminance(250 * 0.62, 250 * 0.62, 250 * 0.62));
    expect(shotLight(white, whole, 0.46, { left: 0.1, top: 0.45, right: 0.9, bottom: 0.55 })).toBeGreaterThan(0.9);
    // raised by a fifth of the frame, the photo comes up off the middle
    expect(shotLight(white, whole, 0.46, { left: 0.1, top: 0.6, right: 0.9, bottom: 0.62 }, 0.2)).toBeLessThan(0.4);
  });

  it("finds a small bright thing in a decoded photo that a thumbhash's blur all but loses", () => {
    // a dark photo with a white patch under the words: a twentieth of the words' part of it
    const patch: Paint = (x, y) => (x > 0.1 && x < 0.24 && y > 0.75 && y < 0.85 ? [250, 250, 250] : [25, 25, 30]);

    expect(shotLight(decoded(128, 85, patch), fill, 1.5, lowerThird)).toBeGreaterThan(0.9);
    expect(shotLight(hashed(96, 64, patch), fill, 1.5, lowerThird)).toBeLessThan(0.6);
  });

  it('takes a photo it knows nothing about for a light one', () => {
    expect(shotLight(null, fill, 1.5, lowerThird)).toBeGreaterThan(0.3);
    expect(thumbhashPicture('not a thumbhash')).toBeNull();
    expect(thumbhashPicture(undefined)).toBeNull();
  });

  it('leaves a photo not yet decoded to its thumbhash', () => {
    expect(
      imagePicture(
        new Image(),
        thumbhashOf(4, 3, () => [128, 128, 128]),
      ),
    ).toBeNull();
  });
});

describe(shotShade.name, () => {
  const bright = hashed(30, 20, () => [235, 232, 225]);
  const dark = hashed(30, 20, () => [30, 28, 35]);

  it('gives a dark photo no shade', () => {
    expect(shotShade(dark, fill, 1.5, [story()])).toBe(0);
  });

  it('gives a bright photo the black its words need, counting the scrim already there', () => {
    const shade = shotShade(bright, fill, 1.5, [story(0.25)]);
    const light = shotLight(bright, fill, 1.5, lowerThird);
    const total = 1 - (1 - 0.25) * (1 - shade);

    expect(shade).toBeGreaterThan(0.1);
    expect(total).toBeCloseTo(darknessFor(light, 0.94, 4.5), 2);
    expect(shotShade(bright, fill, 1.5, [story(0.45)])).toBeLessThan(shade);
  });

  it('serves the most demanding of its words', () => {
    const line: FilmWords = { box: lowerThird, ink: 0.84, ratio: 4.5, scrim: 0.25 };
    const name: FilmWords = { box: lowerThird, ink: 1, ratio: 3, scrim: 0.25 };

    expect(shotShade(bright, fill, 1.5, [name, line])).toBe(shotShade(bright, fill, 1.5, [line]));
    expect(shotShade(bright, fill, 1.5, [name])).toBeLessThan(shotShade(bright, fill, 1.5, [line]));
  });

  it('stops short of black', () => {
    const white = hashed(30, 20, () => [255, 255, 255]);
    const faint: FilmWords = { box: lowerThird, ink: 0.5, ratio: 7, scrim: 0 };

    expect(shotShade(white, fill, 1.5, [faint])).toBe(SHADE_MOST);
  });
});

describe(wholeLift.name, () => {
  it('raises a wide photo on a tall frame just clear of the words', () => {
    // 4:3 on a phone held upright (390×844): the photo is 0.346 of the height, 0.327 spare above and below
    const lift = wholeLift(4 / 3, 390 / 844, 0.35, 0.02);

    expect(lift).toBeCloseTo(0.35 + 0.02 - (1 - 390 / 844 / (4 / 3)) / 2, 3);
    // its foot then sits at the words' top, less the gap
    expect(0.5 - lift + 390 / 844 / (4 / 3) / 2).toBeCloseTo(1 - 0.35 - 0.02, 3);
  });

  it('leaves alone a photo that clears the words already, or that fills the height', () => {
    expect(wholeLift(16 / 9, 390 / 844, 0.2, 0.02)).toBe(0);
    expect(wholeLift(0.75, 16 / 9, 0.3, 0.02)).toBe(0);
    expect(wholeLift(null, 0.5, 0.3, 0.02)).toBe(0);
  });

  it('goes no higher than the top it is given', () => {
    const spare = (1 - 390 / 844 / 0.8) / 2;

    expect(wholeLift(0.8, 390 / 844, 0.5, 0.02)).toBeCloseTo(spare, 3);
    expect(wholeLift(0.8, 390 / 844, 0.5, 0.02, 0.05)).toBeCloseTo(spare - 0.05, 3);
  });
});

describe('the scrims', () => {
  it("follow the foot scrim's stops, the room's a little darker", () => {
    expect(scrimAt(0, false)).toBe(0.55);
    expect(scrimAt(0.35, false)).toBeCloseTo(0.32);
    expect(scrimAt(0.525, false)).toBeCloseTo(0.21);
    expect(scrimAt(1, false)).toBe(0);
    expect(scrimAt(0, true)).toBe(0.62);
    expect(scrimAt(2, true)).toBe(0);
  });

  it("follow the head scrim's fade", () => {
    expect(headScrimAt(0)).toBe(0.42);
    expect(headScrimAt(0.5)).toBeCloseTo(0.21);
    expect(headScrimAt(1.5)).toBe(0);
  });
});
