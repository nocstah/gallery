// Local Omarchy layer: Adjust, Filters and Straighten (Apple Photos' editing) in the photo viewer: the math. Curator
// renders the kept photo at full size with the same math (~/code/curator/curator/adjust.py), the same steps in the
// same order, so what the preview shows while a slider moves is what is kept. The preview bakes the colour steps into
// a small 3D colour table (lutData) that WebGL reads between its points (adjust-gl.ts); Curator runs them on every
// pixel. adjust-math.spec.ts holds this file to Curator's own numbers (adjust-parity.json, made by Curator's tests).
//
// A pixel goes through, sRGB in and out, every value 0..1:
// 1. Warmth and Tint, then Exposure, in linear light. Warmth and Tint are channel gains that keep white as bright;
//    Exposure multiplies by up to 2.8 (1.5 stops) either way and, brightening, eases the brightest into white.
// 2. The tone curve on the encoded values: Black Point, Shadows, Highlights, Brightness and Contrast each a smooth
//    monotone curve through a few points (Fritsch-Carlson), one after another; Brilliance is a mix of them. The curve
//    moves a pixel's largest and smallest channel and the middle one keeps its place between them (the DNG
//    reference's hue-preserving tone curve), so contrast does not turn skin orange.
// 3. Saturation and Vibrance stretch a pixel away from its grey; Vibrance more for muted colours, less for skin.
// 4. A filter is a preset of these same sliders, scaled by its intensity and added to the user's; Mono, Silvertone
//    and Noir then mix the result into grey. What went past 0..1 is clipped last of all.
// 5. Vignette darkens (or lightens) towards the corners, by the place in the final frame.
// Straighten turns the photo about its centre, clockwise above zero, and cuts it to the largest upright rectangle in
// its own proportions.

export const SLIDERS = [
  'exposure',
  'brilliance',
  'highlights',
  'shadows',
  'contrast',
  'brightness',
  'black_point',
  'saturation',
  'vibrance',
  'warmth',
  'tint',
  'vignette',
] as const;
export type Slider = (typeof SLIDERS)[number];

export const FILTERS = [
  'vivid',
  'vivid-warm',
  'vivid-cool',
  'dramatic',
  'dramatic-warm',
  'dramatic-cool',
  'mono',
  'silvertone',
  'noir',
] as const;
export type FilterName = (typeof FILTERS)[number];

/** what the panel sends to Curator: each slider -1..1, the filter with its intensity 0..1, the angle in degrees */
export type AdjustSettings = Record<Slider, number> & { filter: FilterName | null; intensity: number; angle: number };

type Rgb = [number, number, number];
export type Effective = Record<Slider, number> & { mono: number; mix: Rgb; tone: Rgb };

/** a slider and a filter's preset together reach at most twice a slider's own range */
export const LIMIT = 2;
/** stops of Exposure at either end of its slider */
export const EV = 1.5;
/** linear value from which a brightening exposure eases into white */
export const KNEE = 0.75;
/** samples of the tone curve on 0..1 */
export const TABLE = 1025;
/** Rec. 709, on encoded values: the grey a colour is stretched away from */
export const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
/** how dark (or light) the corners get at the end of the slider */
export const VIGNETTE = 0.6;

const VIVID = { contrast: 0.2, saturation: 0.2, vibrance: 0.35, shadows: 0.1, highlights: -0.1 };
const DRAMATIC = {
  contrast: 0.5,
  highlights: -0.8,
  shadows: -0.1,
  brightness: -0.25,
  saturation: -0.25,
  black_point: 0.1,
};

/** the filters, as offsets to the sliders at full intensity */
const PRESETS: Record<FilterName, Partial<Record<Slider, number>>> = {
  vivid: VIVID,
  'vivid-warm': { ...VIVID, warmth: 0.35 },
  'vivid-cool': { ...VIVID, warmth: -0.35 },
  dramatic: DRAMATIC,
  'dramatic-warm': { ...DRAMATIC, warmth: 0.45 },
  'dramatic-cool': { ...DRAMATIC, warmth: -0.45 },
  mono: {},
  silvertone: { contrast: 0.25, brightness: 0.15, highlights: 0.1, black_point: -0.1 },
  noir: { contrast: 0.7, black_point: 0.35, shadows: -0.3, highlights: 0.2 },
};

/** the grey filters: how much each linear channel counts towards the grey, and the tone added to it */
const GREYS: Partial<Record<FilterName, [Rgb, Rgb]>> = {
  mono: [
    [0.2126, 0.7152, 0.0722],
    [0, 0, 0],
  ],
  silvertone: [
    [0.3, 0.59, 0.11],
    [-0.008, 0, 0.016],
  ],
  noir: [
    [0.45, 0.45, 0.1],
    [0, 0, 0],
  ],
};

/** what Brilliance is made of: shadows up, highlights down, a little contrast and vibrance */
const BRILLIANCE: [Slider, number][] = [
  ['shadows', 0.45],
  ['highlights', -0.4],
  ['contrast', 0.12],
  ['vibrance', 0.12],
];

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** settings that change nothing */
export const neutral = (): AdjustSettings => ({
  ...(Object.fromEntries(SLIDERS.map((key) => [key, 0])) as Record<Slider, number>),
  filter: null,
  intensity: 1,
  angle: 0,
});

export const changes = (settings: AdjustSettings) =>
  SLIDERS.some((key) => settings[key] !== 0) ||
  (settings.filter !== null && settings.intensity > 0) ||
  settings.angle !== 0;

/** the sliders with the filter's preset added (scaled by its intensity) and Brilliance spread over the sliders it is
 * made of, each held to +-LIMIT; and the filter's grey */
export const effective = (settings: AdjustSettings): Effective => {
  const name = settings.filter;
  const preset = name ? PRESETS[name] : {};
  const strength = name ? clamp(settings.intensity ?? 1, 0, 1) : 0;
  const e = {} as Record<Slider, number>;
  for (const key of SLIDERS) {
    e[key] = clamp((settings[key] || 0) + strength * (preset[key] ?? 0), -LIMIT, LIMIT);
  }
  const brilliance = e.brilliance;
  for (const [key, share] of BRILLIANCE) {
    e[key] = clamp(e[key] + share * brilliance, -LIMIT, LIMIT);
  }
  const grey = name ? GREYS[name] : undefined;
  return { ...e, mono: grey ? strength : 0, mix: grey?.[0] ?? [0, 0, 0], tone: grey?.[1] ?? [0, 0, 0] };
};

// ---- the tone curve ----

type Point = [number, number];
type Curve = { xs: number[]; ys: number[]; m: number[] };

/** the points each tone slider's curve goes through, in the order the curves are applied */
export const curves = (e: Effective): Point[][] => {
  const found: Point[][] = [];
  const k = e.black_point;
  if (k > 0) {
    // deeper blacks: the darkest tones go to black
    found.push([
      [0, 0],
      [0.12, 0.12 - 0.05 * k],
      [0.3, 0.3 - 0.025 * k],
      [1, 1],
    ]);
  } else if (k < 0) {
    // faded blacks
    found.push([
      [0, -0.07 * k],
      [0.12, 0.12 - 0.035 * k],
      [0.3, 0.3 - 0.012 * k],
      [1, 1],
    ]);
  }
  const s = e.shadows;
  if (s) {
    const lift = s > 0 ? 0.15 : 0.1;
    found.push([
      [0, 0],
      [0.25, 0.25 + lift * s],
      [0.55, 0.55 + 0.25 * lift * s],
      [1, 1],
    ]);
  }
  const h = e.highlights;
  if (h) {
    const reach = h > 0 ? 0.08 : 0.14;
    found.push([
      [0, 0],
      [0.45, 0.45 + 0.2 * reach * h],
      [0.78, 0.78 + reach * h],
      [1, 1],
    ]);
  }
  const b = e.brightness;
  if (b) {
    found.push([
      [0, 0],
      [0.25, 0.25 + 0.1 * b],
      [0.5, 0.5 + 0.12 * b],
      [0.75, 0.75 + 0.08 * b],
      [1, 1],
    ]);
  }
  const c = e.contrast;
  if (c > 0) {
    found.push([
      [0, 0],
      [0.25, 0.25 - 0.07 * c],
      [0.5, 0.5],
      [0.75, 0.75 + 0.07 * c],
      [1, 1],
    ]);
  } else if (c < 0) {
    // flatter, the blacks and whites towards grey as well
    found.push([
      [0, -0.04 * c],
      [0.25, 0.25 - 0.05 * c],
      [0.5, 0.5],
      [0.75, 0.75 + 0.05 * c],
      [1, 1 + 0.04 * c],
    ]);
  }
  return found;
};

/** Fritsch-Carlson: the tangents of a cubic through the points that never turns back between them */
export const monotone = (points: Point[]): Curve => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const n = points.length;
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    d.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  }
  const m = [d[0]];
  for (let k = 1; k < n - 1; k++) {
    m.push(d[k - 1] * d[k] > 0 ? (d[k - 1] + d[k]) / 2 : 0);
  }
  m.push(d[n - 2]);
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const length = Math.hypot(a, b);
    if (length <= 3) {
      continue;
    }
    m[k] = (3 / length) * a * d[k];
    m[k + 1] = (3 / length) * b * d[k];
  }
  return { xs, ys, m };
};

export const hermite = (x: number, { xs, ys, m }: Curve) => {
  let k = 0;
  while (k < xs.length - 2 && xs[k + 1] <= x) {
    k++;
  }
  const h = xs[k + 1] - xs[k];
  const t = (x - xs[k]) / h;
  const t2 = t * t;
  const t3 = t * t * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[k] +
    (t3 - 2 * t2 + t) * h * m[k] +
    (-2 * t3 + 3 * t2) * ys[k + 1] +
    (t3 - t2) * h * m[k + 1]
  );
};

/** the whole tone curve, sampled at TABLE points on 0..1 and read between them in a straight line */
export const toneTable = (e: Effective) => {
  const table = new Float64Array(TABLE);
  for (let index = 0; index < TABLE; index++) {
    table[index] = index / (TABLE - 1);
  }
  for (const points of curves(e)) {
    const curve = monotone(points);
    for (let index = 0; index < TABLE; index++) {
      table[index] = hermite(table[index], curve);
    }
  }
  for (let index = 0; index < TABLE; index++) {
    table[index] = clamp(table[index], 0, 1);
  }
  return table;
};

const lookup = (table: Float64Array, x: number) => {
  const position = clamp(x, 0, 1) * (TABLE - 1);
  const index = Math.min(Math.floor(position), TABLE - 2);
  const fraction = position - index;
  return table[index] + fraction * (table[index + 1] - table[index]);
};

// ---- the pixel ----

export const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export const fromLinear = (x: number) =>
  x <= 0.0031308 ? x * 12.92 : 1.055 * Math.max(x, 0.0031308) ** (1 / 2.4) - 0.055;

/** Warmth (amber against blue) and Tint (magenta against green) as gains on the linear channels, keeping white as
 * bright as it was */
export const gains = (e: Effective): Rgb => {
  const w = e.warmth;
  const t = e.tint;
  const g = [Math.exp(0.22 * w + 0.08 * t), Math.exp(-0.16 * t), Math.exp(-0.22 * w + 0.08 * t)];
  const white = LUMA[0] * g[0] + LUMA[1] * g[1] + LUMA[2] * g[2];
  return [g[0] / white, g[1] / white, g[2] / white];
};

export const expose = (x: number, exposure: number) => {
  const gain = 2 ** (EV * exposure);
  const y = x * gain;
  if (gain <= 1) {
    return y;
  }
  // from KNEE up, the brightest values (up to `gain`) ease into white: a curve that leaves the knee at the slope it
  // arrived with and meets white flat
  const u = clamp((y - KNEE) / (gain - KNEE), 0, 1);
  const power = (gain - KNEE) / (1 - KNEE);
  return y > KNEE ? KNEE + (1 - KNEE) * (1 - (1 - u) ** power) : y;
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** how much a colour is in the hues of skin (around an orange of 28 degrees), 0..1 */
export const skin = (r: number, g: number, b: number, high: number, low: number) => {
  const span = high - low > 1e-9 ? high - low : 1;
  let hue: number;
  if (high === r) {
    hue = ((((g - b) / span) % 6) + 6) % 6;
  } else if (high === g) {
    hue = (b - r) / span + 2;
  } else {
    hue = (r - g) / span + 4;
  }
  hue = high - low > 1e-9 ? hue * 60 : 0;
  return smoothstep(0, 1, 1 - Math.abs(hue - 28) / 24);
};

/** One pixel through every colour step for these settings, the vignette aside: `colour(table)` once per settings,
 * then the returned function per pixel (encoded sRGB, 0..1). Unclipped, a stretched colour may end up past 0..1: the
 * colour table keeps it so and is clipped only after it is read between its points, so the clip does not blur. */
export const colour = (e: Effective, table = toneTable(e)) => {
  const [gainR, gainG, gainB] = gains(e);
  const saturation = Math.max(0, 1 + (e.saturation > 0 ? 0.6 : 1) * e.saturation);
  const vibrance = e.vibrance;
  const [wr, wg, wb] = e.mix;
  const [tr, tg, tb] = e.tone;
  const channel = (v: number, gain: number) =>
    fromLinear(clamp(expose(toLinear(clamp(v, 0, 1)) * gain, e.exposure), 0, 1));

  return (r0: number, g0: number, b0: number, clip = true): Rgb => {
    let r = channel(r0, gainR);
    let g = channel(g0, gainG);
    let b = channel(b0, gainB);

    // the curve on the largest and smallest channel; the middle one keeps its place between them
    let high = Math.max(r, g, b);
    let low = Math.min(r, g, b);
    const span = high - low;
    const newLow = lookup(table, low);
    const newSpan = lookup(table, high) - newLow;
    r = newLow + (span > 1e-9 ? (r - low) / span : 0) * newSpan;
    g = newLow + (span > 1e-9 ? (g - low) / span : 0) * newSpan;
    b = newLow + (span > 1e-9 ? (b - low) / span : 0) * newSpan;

    if (e.saturation || vibrance) {
      const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
      let factor = saturation;
      if (vibrance) {
        high = Math.max(r, g, b);
        low = Math.min(r, g, b);
        let amount = 0.8 * vibrance * (1 - (high - low));
        if (vibrance > 0) {
          amount *= 1 - 0.55 * skin(r, g, b, high, low);
        }
        factor *= Math.max(0, 1 + amount);
      }
      r = y + factor * (r - y);
      g = y + factor * (g - y);
      b = y + factor * (b - y);
    }

    if (e.mono) {
      const grey = fromLinear(
        clamp(wr * toLinear(clamp(r, 0, 1)) + wg * toLinear(clamp(g, 0, 1)) + wb * toLinear(clamp(b, 0, 1)), 0, 1),
      );
      const middle = 4 * grey * (1 - grey);
      r += e.mono * (clamp(grey + tr * middle, 0, 1) - r);
      g += e.mono * (clamp(grey + tg * middle, 0, 1) - g);
      b += e.mono * (clamp(grey + tb * middle, 0, 1) - b);
    }

    return clip ? [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)] : [r, g, b];
  };
};

/** The colour steps as a 3D table for WebGL: `size` points a side over the encoded values, red fastest, then green,
 * then blue; four floats a point (the fourth unused), unclipped. */
export const lutData = (e: Effective, size: number) => {
  const pixel = colour(e);
  const data = new Float32Array(size * size * size * 4);
  let at = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const [red, green, blue] = pixel(r / (size - 1), g / (size - 1), b / (size - 1), false);
        data[at] = red;
        data[at + 1] = green;
        data[at + 2] = blue;
        data[at + 3] = 1;
        at += 4;
      }
    }
  }
  return data;
};

/** how much of the vignette a place in the frame gets (u, v: 0..1 across and down; 0 in the middle, 1 in the
 * corners): an ellipse in the frame's own proportions */
export const vignetteWeight = (u: number, v: number) => {
  const dx = 2 * u - 1;
  const dy = 2 * v - 1;
  return smoothstep(0.3, 1, Math.sqrt((dx * dx + dy * dy) / 2));
};

export const vignette = (value: number, weight: number, amount: number) =>
  amount > 0
    ? value * Math.max(0, 1 - VIGNETTE * amount * weight)
    : value + (1 - value) * Math.min(1, VIGNETTE * -amount * weight);

// ---- straighten ----

/** the share of the photo's width (and height) that the largest upright rectangle in its own proportions keeps
 * inside the photo turned by `angle` degrees */
export const straightenScale = (angle: number, width: number, height: number) => {
  const a = (Math.abs(angle) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Math.min(width / (width * c + height * s), height / (width * s + height * c));
};

/** where a place in the straightened frame (u, v: 0..1 across and down) comes from in the photo, in the same terms;
 * clockwise above zero, the screen's y pointing down */
export const sourceUv = (angle: number, width: number, height: number, u: number, v: number): [number, number] => {
  const k = straightenScale(angle, width, height);
  const t = (angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const du = u - 0.5;
  const dv = v - 0.5;
  return [0.5 + k * c * du + k * s * (height / width) * dv, 0.5 - k * s * (width / height) * du + k * c * dv];
};

/** sourceUv as a 3x3 matrix for the shader, column by column: (u, v, 1) in the frame to (u, v, 1) in the photo */
export const sourceMatrix = (angle: number, width: number, height: number) => {
  const k = straightenScale(angle, width, height);
  const t = (angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const au = k * c;
  const bu = k * s * (height / width);
  const av = -k * s * (width / height);
  const bv = k * c;
  return new Float32Array([au, av, 0, bu, bv, 0, 0.5 - 0.5 * au - 0.5 * bu, 0.5 - 0.5 * av - 0.5 * bv, 1]);
};
