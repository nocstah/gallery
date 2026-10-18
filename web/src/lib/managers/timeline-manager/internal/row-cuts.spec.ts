import {
  cutRows,
  fitsOneLine,
  justifiedRow,
  MAX_SCALE,
  MIN_SCALE,
  type CutDay,
  type CutOptions,
  type RowPart,
} from './row-cuts';

// the Dell's grid: 963px wide, the default row height, the desktop's 10px gap
const DELL: CutOptions = { width: 963, rowHeight: 235, spacing: 10, gap: 10, share: true };

const day = (...ratios: number[]): CutDay => ({ ratios });
/** How tall a row stands against the target height, before any cap. */
const scaleOf = (row: RowPart[], days: CutDay[], { width, rowHeight, spacing, gap }: CutOptions) => {
  const ratios = row.flatMap((part) => days[part.day].ratios.slice(part.from, part.to));
  const fixed = (ratios.length - row.length) * spacing + (row.length - 1) * gap;
  return (width - fixed) / ratios.reduce((sum, ratio) => sum + ratio, 0) / rowHeight;
};
const shortRows = (rows: RowPart[][], days: CutDay[], options: CutOptions) =>
  rows.filter((row) => scaleOf(row, days, options) > MAX_SCALE).length;
/** Every photo once, in order. */
const photosOf = (rows: RowPart[][]) =>
  rows.flatMap((row) =>
    row.flatMap((part) => Array.from({ length: part.to - part.from }, (_, at) => [part.day, part.from + at])),
  );
const allPhotos = (days: CutDay[]) => days.flatMap((d, index) => d.ratios.map((_, at) => [index, at]));

describe(cutRows.name, () => {
  it('cuts nothing out of nothing', () => {
    expect(cutRows([], DELL)).toEqual([]);
  });

  it('keeps days that fill a row together whole', () => {
    // two days of two photos fill one row at about the target height (a ratio of 3.9 across the Dell's 963px)
    const days = [day(1.33, 0.75), day(1.33, 0.5)];
    const rows = cutRows(days, DELL);

    expect(rows).toEqual([
      [
        { day: 0, from: 0, to: 2 },
        { day: 1, from: 0, to: 2 },
      ],
    ]);
  });

  it('lets two portraits between two days that fill rows of their own share a row (the Dell, 2026-10-18)', () => {
    // a day of seven too wide for one line, a day of two portraits, a day of fifteen: the two stood alone and left
    // 389px of the Dell's 963 empty beside them
    const days = [
      day(0.75, 0.75, 1.33, 0.75, 0.75, 0.56, 0.75),
      day(0.75, 0.75),
      day(...Array.from({ length: 15 }, () => 1.33)),
    ];
    expect(fitsOneLine(days[0].ratios, DELL)).toBe(false);
    const rows = cutRows(days, DELL);

    expect(shortRows(rows, days, DELL)).toBe(0);
    // the two portraits end the first day's second row
    const shared = rows.find((row) => row.some((part) => part.day === 1))!;
    expect(shared.map((part) => part.day)).toEqual([0, 1]);
    expect(shared[0].from).toBeGreaterThan(0);
    expect(photosOf(rows)).toEqual(allPhotos(days));
  });

  it('breaks a day that fits one line where that keeps a lone photo beside it from standing short', () => {
    // a day that all but fills a line (at 0.8 of the target height), a day of one portrait, another like the first:
    // the portrait fits beside neither
    const nearlyFull = day(1.33, 1.33, 1.33, 0.97);
    const days = [nearlyFull, day(0.75), nearlyFull];
    expect(days.every((d) => fitsOneLine(d.ratios, DELL))).toBe(true);
    const rows = cutRows(days, DELL);

    expect(shortRows(rows, days, DELL)).toBe(0);
    expect(photosOf(rows)).toEqual(allPhotos(days));
  });

  it('never breaks a whole day, the days the month before handed on', () => {
    const nearlyFull = { ratios: [1.33, 1.33, 1.33, 0.97], whole: true };
    expect(cutRows([nearlyFull, day(0.75)], DELL)[0]).toEqual([{ day: 0, from: 0, to: 4 }]);
    // and one too wide to stand alone at MIN_SCALE still has a row to itself
    const wideWhole = { ratios: [1.33, 1.33, 0.75, 1.33, 1.33], whole: true };
    expect(cutRows([wideWhole, day(0.75)], DELL)[0]).toEqual([{ day: 0, from: 0, to: 5 }]);
  });

  it('never shrinks a row of more than one photo below MIN_SCALE, nor grows one past MAX_SCALE where another cut fills', () => {
    const days = [day(...Array.from({ length: 40 }, (_, index) => 0.5 + ((index * 0.618) % 2.5)))];
    const rows = cutRows(days, DELL);

    for (const row of rows) {
      const scale = scaleOf(row, days, DELL);
      expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(MAX_SCALE);
    }
    expect(photosOf(rows)).toEqual(allPhotos(days));
  });

  it('leaves a short last row of whole days for the next month rather than break a day, where it can take them', () => {
    const days = [day(1.33, 1.33, 1.33, 0.97), day(0.75)];

    const handed = cutRows(days, { ...DELL, handOn: 0.5 });
    expect(handed).toEqual([[{ day: 0, from: 0, to: 4 }], [{ day: 1, from: 0, to: 1 }]]);
    // without a next month to take it, the month fills its own last row
    expect(shortRows(cutRows(days, DELL), days, DELL)).toBe(0);
  });

  describe('with day labels', () => {
    const LABELS: CutOptions = { ...DELL, gap: 12, share: false };

    it('keeps a day too wide for one line on rows of its own, each justified to the edge', () => {
      const days = [day(1.33, 1.33), day(...Array.from({ length: 9 }, () => 1.33)), day(1.33, 1.33)];
      const rows = cutRows(days, LABELS);

      for (const row of rows) {
        expect(new Set(row.map((part) => part.day)).size === 1 || row.every((part) => part.day !== 1)).toBe(true);
      }
      expect(rows.filter((row) => row[0].day === 1).every((row) => justifiedRow(row, days, LABELS))).toBe(true);
      expect(rows.filter((row) => row[0].day !== 1).some((row) => justifiedRow(row, days, LABELS))).toBe(false);
    });

    it('never breaks a day that fits one line', () => {
      const nearlyFull = day(1.33, 1.33, 1.33, 0.97);
      const rows = cutRows([nearlyFull, day(0.75), nearlyFull], LABELS);

      expect(rows.every((row) => row.every((part) => part.from === 0))).toBe(true);
    });
  });
});
