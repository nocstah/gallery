import { pickYearLabels, yearRank, YEAR_LABEL_SPACING, type YearMark } from './scrubber-labels';

// Local Omarchy layer: the scrubber's year names never run into each other, and the ones it keeps say the most.

/** years from `newest` down, each `step` px above the one before it, the oldest at the foot */
const years = (newest: number, oldest: number, step: number): YearMark[] =>
  Array.from({ length: newest - oldest + 1 }, (_, index) => ({
    year: newest - index,
    at: (newest - oldest - index) * step,
  }));

describe(pickYearLabels.name, () => {
  it('names every year where they all fit', () => {
    const marks = years(2026, 2017, 40);
    expect([...pickYearLabels(marks)].sort((a, b) => a - b)).toEqual(
      marks.map(({ year }) => year).sort((a, b) => a - b),
    );
  });

  it('keeps no two names closer than a name and its air', () => {
    const marks = years(2026, 1977, 9);
    const kept = marks.filter(({ year }) => pickYearLabels(marks).has(year));
    for (const [index, mark] of kept.entries()) {
      for (const other of kept.slice(index + 1)) {
        expect(Math.abs(mark.at - other.at)).toBeGreaterThanOrEqual(YEAR_LABEL_SPACING);
      }
    }
  });

  it('names the newest and the oldest year, then the decades, before the years between', () => {
    const marks = years(2026, 1977, 9);
    const kept = pickYearLabels(marks);
    for (const year of [2026, 1977, 2010, 2000, 1990]) {
      expect(kept.has(year), String(year)).toBe(true);
    }
    // the years beside a decade give way to it
    expect(kept.has(2001)).toBe(false);
    expect(kept.has(1999)).toBe(false);
  });

  it('is nothing for no years', () => {
    expect(pickYearLabels([]).size).toBe(0);
  });
});

describe(yearRank.name, () => {
  it('ranks the ends, then decades, fives, even years and the rest', () => {
    expect([2026, 1977, 2020, 2015, 2014, 2013].map((year) => yearRank(year, 2026, 1977))).toEqual([0, 0, 1, 2, 3, 4]);
  });
});
