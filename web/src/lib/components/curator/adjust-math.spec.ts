import {
  colour,
  effective,
  lutData,
  neutral,
  sourceMatrix,
  sourceUv,
  straightenScale,
  vignette,
  vignetteWeight,
  type AdjustSettings,
} from '$lib/components/curator/adjust-math';
import parity from './adjust-parity.json';

// Local Omarchy layer: the photo viewer's Adjust math against Curator's (~/code/curator/curator/adjust.py). Curator's
// tests write adjust-parity.json from its own math (tests/test_adjust.py); what is seen in the preview is what Curator
// keeps only while these agree. Then: the WebGL preview reads the colour steps from a 33-point table, and stays within
// a few levels of the exact math.

type Case = { name: string; settings: AdjustSettings; raw: number[][] };

const cases = parity.cases as Case[];
const colours = parity.colours.map((rgb) => rgb.map((value) => value / 255));

/** what the GPU does with the table: read between its eight nearest points, then clip */
const throughTable = (data: Float32Array, size: number, rgb: number[]) => {
  const at = rgb.map((value) => value * (size - 1));
  const base = at.map((value) => Math.min(Math.floor(value), size - 2));
  const part = at.map((value, index) => value - base[index]);
  const out = [0, 0, 0];
  for (let corner = 0; corner < 8; corner++) {
    const step = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
    const weight = step.reduce((total, on, index) => total * (on ? part[index] : 1 - part[index]), 1);
    const index = ((base[2] + step[2]) * size * size + (base[1] + step[1]) * size + (base[0] + step[0])) * 4;
    for (let channel = 0; channel < 3; channel++) {
      out[channel] += weight * data[index + channel];
    }
  }
  return out.map((value) => Math.min(1, Math.max(0, value)));
};

describe('adjust math', () => {
  it('gives Curator its own numbers, slider by slider and filter by filter', () => {
    expect(cases.length).toBeGreaterThan(30);
    for (const { name, settings, raw } of cases) {
      const pixel = colour(effective(settings));
      for (const [index, [r, g, b]] of colours.entries()) {
        const mine = pixel(r, g, b, false);
        for (let channel = 0; channel < 3; channel++) {
          expect(Math.abs(mine[channel] - raw[index][channel]), `${name}, colour ${index}`).toBeLessThan(1e-9);
        }
        // kept, the same clipped
        expect(pixel(r, g, b)).toEqual(mine.map((value) => Math.min(1, Math.max(0, value))));
      }
    }
  });

  it('weighs the vignette as Curator does', () => {
    for (const { u, v, weight } of parity.vignette) {
      expect(vignetteWeight(u, v)).toBeCloseTo(weight, 9);
    }
    expect(vignette(0.5, 1, 1)).toBeCloseTo(0.2, 9);
    expect(vignette(0.5, 1, -1)).toBeCloseTo(0.8, 9);
    expect(vignette(0.5, 0, 1)).toBe(0.5);
  });

  it('straightens to the frame Curator cuts', () => {
    for (const { angle, size, scale, places } of parity.straighten) {
      const [width, height] = size;
      expect(straightenScale(angle, width, height)).toBeCloseTo(scale, 9);
      const matrix = sourceMatrix(angle, width, height);
      for (const [u, v, su, sv] of places) {
        const [mu, mv] = sourceUv(angle, width, height, u, v);
        expect(mu).toBeCloseTo(su, 9);
        expect(mv).toBeCloseTo(sv, 9);
        // the shader's matrix, column by column, says the same (in single precision)
        expect(matrix[0] * u + matrix[3] * v + matrix[6]).toBeCloseTo(su, 5);
        expect(matrix[1] * u + matrix[4] * v + matrix[7]).toBeCloseTo(sv, 5);
      }
    }
  });

  it('changes nothing at zero', () => {
    const pixel = colour(effective(neutral()));
    for (const [r, g, b] of colours) {
      const [r2, g2, b2] = pixel(r, g, b);
      expect(Math.abs(r2 - r) + Math.abs(g2 - g) + Math.abs(b2 - b)).toBeLessThan(1e-12);
    }
  });

  it('shows the preview within a few levels of what is kept', () => {
    // a heavy edit and a few strong single sliders, at 33 points a side: what the preview reads while a slider moves
    const strong = cases.filter(({ name }) =>
      ['a heavy edit', 'exposure+1', 'contrast+1', 'vibrance+1', 'warmth+1', 'vivid', 'noir'].includes(name),
    );
    expect(strong).toHaveLength(7);
    let seed = 7;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    for (const { name, settings } of strong) {
      const e = effective(settings);
      const pixel = colour(e);
      const table = lutData(e, 33);
      let worst = 0;
      let total = 0;
      for (let index = 0; index < 4000; index++) {
        const rgb = [random(), random(), random()].map((value) => Math.round(value * 255) / 255);
        const exact = pixel(rgb[0], rgb[1], rgb[2]);
        const seen = throughTable(table, 33, rgb);
        const off = Math.max(...exact.map((value, channel) => Math.abs(value - seen[channel]))) * 255;
        worst = Math.max(worst, off);
        total += off;
      }
      expect(worst, name).toBeLessThan(6);
      expect(total / 4000, name).toBeLessThan(0.5);
    }
  });
});
