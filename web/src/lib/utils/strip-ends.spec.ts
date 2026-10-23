import { describe, expect, it } from 'vitest';
import { cutAtEnds } from '$lib/utils/strip-ends';

// Local Omarchy layer: the bar's year strip ends on whole years ("2015 20›" on the Dell): a year its ends would cut,
// the fade and the chevron at an end that has more, waits until it comes in whole
describe('cutAtEnds', () => {
  const box = { left: 100, right: 500 };
  // 40px years, one after another from the strip's left edge
  const years = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016].map(
    (year, index) => [year, { left: 100 + index * 40, right: 140 + index * 40 }] as const,
  );

  it('keeps every year the strip holds whole', () => {
    expect(cutAtEnds(box, years.slice(0, 10), 0, 0)).toEqual(new Set());
  });

  it('cuts the year that runs past the strip and the one under the chevron at an end with more', () => {
    // 2017 ends at 500, flush with the strip, but the last 20px are the fade and its chevron; 2016 runs past it
    expect(cutAtEnds(box, years, 0, 20)).toEqual(new Set([2017, 2016]));
  });

  it('cuts at the start too, once the strip has scrolled', () => {
    const scrolled = years.map(([year, { left, right }]) => [year, { left: left - 10, right: right - 10 }] as const);

    expect([...cutAtEnds(box, scrolled, 20, 20)]).toEqual([2026, 2017, 2016]);
  });

  it('lets half a pixel of rounding pass', () => {
    expect(cutAtEnds(box, [[1, { left: 99.6, right: 480.4 }]], 0, 20)).toEqual(new Set());
  });
});
