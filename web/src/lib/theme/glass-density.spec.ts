import { describe, expect, it } from 'vitest';
import { contrast, mix } from '$lib/theme/derive';
import { GLASS_DENSITY_CEILING, GLASS_DENSITY_FLOOR, glassDensity } from '$lib/theme/glass-density';

// Local Omarchy layer: the glass chrome's ground is as dense as its faintest words (the muted ink halfway to the ink)
// need to keep 4.6:1 over a white photo and a black one, in the theme's own colours
const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
const hex = (colour: number[]) => '#' + colour.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('');
const glass = (surface: string, density: number, photo: number) =>
  hex(rgb(surface).map((value) => (density / 100) * value + (1 - density / 100) * photo));
const worst = (words: string, surface: string, density: number) =>
  Math.min(...[0, 255].map((photo) => contrast(words, glass(surface, density, photo))));

// the build's own faces (gallery-theme.css), the words as omarchy-world.css mixes them (--ws-glass-muted)
const faces = {
  dark: { surface: '#131314', words: mix('#9aa0a6', '#e3e3e3', 0.5) },
  light: { surface: '#ffffff', words: mix('#5f6368', '#1f1f1f', 0.5) },
};

describe('glassDensity', () => {
  it.each(Object.entries(faces))('gives the %s face the least ground at which its words hold 4.6:1', (_, face) => {
    const density = glassDensity(rgb(face.surface), rgb(face.words));

    expect(density).toBeGreaterThan(GLASS_DENSITY_FLOOR);
    expect(density).toBeLessThan(GLASS_DENSITY_CEILING);
    expect(worst(face.words, face.surface, density)).toBeGreaterThanOrEqual(4.6);
    expect(worst(face.words, face.surface, density - 1)).toBeLessThan(4.6);
  });

  it('works out what the fallback faces need: 76% dark, 68% light', () => {
    expect(glassDensity(rgb(faces.dark.surface), rgb(faces.dark.words))).toBe(76);
    expect(glassDensity(rgb(faces.light.surface), rgb(faces.light.words))).toBe(68);
  });

  it('never goes under the glass the bar had', () => {
    expect(glassDensity([0, 0, 0], [255, 255, 255])).toBe(GLASS_DENSITY_FLOOR);
  });

  it('stops at the ceiling when no glass would do', () => {
    expect(glassDensity([128, 128, 128], [136, 136, 136])).toBe(GLASS_DENSITY_CEILING);
  });
});
