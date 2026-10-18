import { layoutPeriodGrid, periodDensity, periodSlot, type PeriodCell, type PeriodRow } from '$lib/utils/period-grid';

// the archive's own shape: 1977 and 1978, nothing from 1979 to 1988, then 1989, 1991 and every year from 1993
const YEARS = [1977, 1978, 1989, 1991, ...Array.from({ length: 34 }, (_, index) => 1993 + index)];
const years = (list = YEARS) => list.map((year) => ({ slot: year, count: year === 2024 ? 1468 : 100 }));

type Period = Extract<PeriodRow, { kind: 'period' }>;
const periodRows = (rows: PeriodRow[]) => rows.filter((row): row is Period => row.kind === 'period');
const cellOf = (rows: PeriodRow[], slot: number): PeriodCell | undefined =>
  periodRows(rows)
    .flatMap((row) => row.cells)
    .find((cell) => cell.slot === slot);

describe(periodSlot.name, () => {
  it('places a year at its number and a month at its year and month', () => {
    expect(periodSlot('year', { year: 1989 })).toBe(1989);
    expect(periodSlot('month', { year: 2026, month: 1 })).toBe(2026 * 12);
    expect(periodSlot('month', { year: 2026, month: 10 })).toBe(2026 * 12 + 9);
  });
});

describe(layoutPeriodGrid.name, () => {
  it('lays nothing out without periods or room', () => {
    expect(layoutPeriodGrid([], { kind: 'year', width: 2000, gap: 10 })).toBeUndefined();
    expect(layoutPeriodGrid(years(), { kind: 'year', width: 0, gap: 10 })).toBeUndefined();
  });

  it('gives each decade a row on a wide screen, newest first, its years oldest first along it', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10 })!;

    expect(grid.perLine).toBe(10);
    expect(grid.labelWidth).toBe(72);
    expect(grid.tileWidth).toBe(Math.floor((2287 - 72 - 10 - 9 * 10) / 10));
    expect(periodRows(grid.rows).map((row) => row.unit)).toEqual([202, 201, 200, 199, 198, 197]);
    const [newest] = periodRows(grid.rows);
    expect(newest.cells.map(({ slot }) => slot)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  });

  it('keeps a year in the same column in every decade, and the years without photos as gaps in their place', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10 })!;

    expect(cellOf(grid.rows, 1977)).toMatchObject({ tile: true });
    expect(cellOf(grid.rows, 1987)).toMatchObject({ tile: false, left: cellOf(grid.rows, 1977)!.left });
    expect(cellOf(grid.rows, 1997)).toMatchObject({ tile: true, left: cellOf(grid.rows, 1977)!.left });
    // 1979 to 1988, 1990 and 1992 are gaps; nothing stands for the years before the first or after the last
    const gaps = periodRows(grid.rows)
      .flatMap((row) => row.cells)
      .filter((cell) => !cell.tile)
      .map(({ slot }) => slot)
      .sort((a, b) => a - b);
    expect(gaps).toEqual([1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1990, 1992]);
    expect(cellOf(grid.rows, 1976)).toBeUndefined();
    expect(cellOf(grid.rows, 2027)).toBeUndefined();
  });

  it('measures every density against the busiest period', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10 })!;

    expect(grid.busiest).toBe(1468);
    expect(periodDensity(1468, grid.busiest)).toBe(1);
    expect(periodDensity(734, grid.busiest)).toBe(0.5);
    expect(periodDensity(0, 0)).toBe(0);
  });

  it('fits a short archive on the screen, the tiles giving up to a quarter of their height', () => {
    const square = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10 })!;
    expect(square.tileHeight).toBe(square.tileWidth);
    expect(square.height).toBe(6 * square.tileWidth + 5 * 10);

    const fitted = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10, viewportHeight: 1240 })!;
    expect(fitted.tileHeight).toBe(Math.floor((1240 - 50) / 6));
    expect(fitted.height).toBeLessThanOrEqual(1240);

    // too short to fit without squashing the tiles: they stay square and the grid scrolls
    const scrolled = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10, viewportHeight: 600 })!;
    expect(scrolled.tileHeight).toBe(scrolled.tileWidth);
  });

  it('breaks a decade into halves on a phone, its name above, and leaves out a half outside the span', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 374, gap: 10 })!;

    expect(grid.perLine).toBe(5);
    expect(grid.labelWidth).toBe(0);
    expect(grid.labelHeight).toBe(36);
    const rows = periodRows(grid.rows);
    const [twenties] = rows;
    const seventies = rows.at(-1)!;
    // 2020-2024 on the first line, 2025 and 2026 on the second
    expect(new Set(twenties.cells.map(({ top }) => top)).size).toBe(2);
    expect(twenties.height).toBe(36 + 2 * grid.tileWidth + 10);
    // 1970-1974 lie before the archive: the 1970s keep one line, 1977 at its third place
    expect(seventies.cells.map(({ slot }) => slot)).toEqual([1977, 1978, 1979]);
    expect(seventies.height).toBe(36 + grid.tileWidth);
    expect(cellOf(grid.rows, 1977)!.left).toBe(2 * (grid.tileWidth + 10));
  });

  it('takes half decades on a portrait screen where the whole archive then fits with larger tiles', () => {
    // the Dell: 1023px wide, 2172px in view; ten to a line would leave three quarters of it empty
    expect(layoutPeriodGrid(years(), { kind: 'year', width: 1023, gap: 10 })!.perLine).toBe(10);
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 1023, gap: 10, viewportHeight: 2172 })!;

    expect(grid.perLine).toBe(5);
    expect(grid.tileWidth).toBe(Math.floor((1023 - 72 - 10 - 4 * 10) / 5));
    expect(grid.height).toBeLessThanOrEqual(2172);
    // a decade's two lines stand closer together than two decades
    const [twenties, tens] = periodRows(grid.rows);
    expect(tens.top - (twenties.top + twenties.height)).toBe(20);
    expect(new Set(twenties.cells.map(({ top }) => top)).size).toBe(2);
  });

  it('folds a half decade without photos into one slim line, the other half keeping its places (the Dell)', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 1023, gap: 10, viewportHeight: 2172 })!;
    const eighties = periodRows(grid.rows).find((row) => row.unit === 198)!;

    expect(grid.perLine).toBe(5);
    // 1980 to 1984 held nine empty frames over two lines with the second half; now one slim line names them
    expect(eighties.folds).toEqual([{ first: 1980, last: 1984, left: 72 + 10, top: eighties.top, height: 28 }]);
    expect(eighties.cells.map(({ slot, tile }) => [slot, tile])).toEqual([
      [1985, false],
      [1986, false],
      [1987, false],
      [1988, false],
      [1989, true],
    ]);
    expect(eighties.height).toBe(28 + 10 + grid.tileHeight);
    // a year still stands under the same year of the next decade
    expect(cellOf(grid.rows, 1989)!.left).toBe(cellOf(grid.rows, 1999)!.left);
    expect(cellOf(grid.rows, 1985)!.left).toBe(cellOf(grid.rows, 1995)!.left);
    // a half with photos in it keeps its gaps
    expect(periodRows(grid.rows).find((row) => row.unit === 199)!.folds).toEqual([]);
    expect(grid.height).toBeLessThanOrEqual(2172);
  });

  it('folds nothing where a decade is one line (the AORUS)', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10, viewportHeight: 1308 })!;
    expect(periodRows(grid.rows).flatMap((row) => row.folds)).toEqual([]);
  });

  it('counts a folded line as a slim one when fitting the archive to the screen', () => {
    // just tall enough for the half decades with the 1980s' first half folded, not with it as a line of tiles
    const open = layoutPeriodGrid(years(), { kind: 'year', width: 1023, gap: 10 })!;
    const halves = layoutPeriodGrid(years(), { kind: 'year', width: 1023, gap: 10, viewportHeight: 4000 })!;
    expect(open.perLine).toBe(10);
    expect(halves.perLine).toBe(5);
    const fitted = layoutPeriodGrid(years(), { kind: 'year', width: 1023, gap: 10, viewportHeight: halves.height })!;
    expect(fitted.perLine).toBe(5);
    expect(fitted.tileHeight).toBe(fitted.tileWidth);
  });

  it('keeps ten to a line where the tiles are big enough as they are, though halves would fit (a few years)', () => {
    // a person's photos from three years on the AORUS: halves would make tiles of 431px
    const few = years([2019, 2024, 2026]);
    const grid = layoutPeriodGrid(few, { kind: 'year', width: 2287, gap: 10, viewportHeight: 1308 })!;
    expect(grid.perLine).toBe(10);
    expect(grid.tileWidth).toBe(211);
  });

  it('keeps ten to a line where the archive fits the screen that way (a laptop)', () => {
    expect(layoutPeriodGrid(years(), { kind: 'year', width: 1167, gap: 10, viewportHeight: 768 })!.perLine).toBe(10);
  });

  it('runs oldest first when the timeline does', () => {
    const grid = layoutPeriodGrid(years(), { kind: 'year', width: 2287, gap: 10, newestFirst: false })!;
    expect(periodRows(grid.rows).map((row) => row.unit)).toEqual([197, 198, 199, 200, 201, 202]);
  });

  describe('months', () => {
    const months = [
      [2026, 1],
      [2026, 10],
      [1991, 7],
      [1989, 7],
      [1978, 7],
      [1977, 7],
      [1977, 9],
    ].map(([year, month]) => ({ slot: periodSlot('month', { year, month }), count: 5 }));

    it('gives each year a row of twelve, January to December, on a wide screen', () => {
      const grid = layoutPeriodGrid(months, { kind: 'month', width: 2287, gap: 10 })!;

      expect(grid.perLine).toBe(12);
      const [first] = periodRows(grid.rows);
      // 2026 holds January to October: the months after the newest photo are not drawn
      expect(first.unit).toBe(2026);
      expect(first.cells).toHaveLength(10);
      const july = (year: number) => cellOf(grid.rows, periodSlot('month', { year, month: 7 }))!;
      expect(july(1977).left).toBe(july(1989).left);
      expect(july(1991).left).toBe(july(2026).left);
    });

    it('draws a run of years without photos as one slim line', () => {
      const grid = layoutPeriodGrid(months, { kind: 'month', width: 2287, gap: 10 })!;

      expect(grid.rows.filter((row) => row.kind === 'empty')).toEqual([
        expect.objectContaining({ first: 1992, last: 2025, height: 28 }),
        expect.objectContaining({ first: 1990, last: 1990 }),
        expect.objectContaining({ first: 1979, last: 1988 }),
      ]);
      expect(grid.rows.map((row) => (row.kind === 'period' ? row.unit : `${row.first}-${row.last}`))).toEqual([
        2026,
        '1992-2025',
        1991,
        '1990-1990',
        1989,
        '1979-1988',
        1978,
        1977,
      ]);
    });

    it('leaves out the months before the first photo and keeps the gaps after it', () => {
      const grid = layoutPeriodGrid(months, { kind: 'month', width: 2287, gap: 10 })!;
      const oldest = periodRows(grid.rows).at(-1)!;

      expect(oldest.cells.map(({ slot, tile }) => [(slot % 12) + 1, tile])).toEqual([
        [7, true],
        [8, false],
        [9, true],
        [10, false],
        [11, false],
        [12, false],
      ]);
    });

    it('folds a part of a year without photos into one slim line on the portrait screen', () => {
      const grid = layoutPeriodGrid(months, { kind: 'month', width: 1023, gap: 10 })!;
      const year = (unit: number) => periodRows(grid.rows).find((row) => row.unit === unit)!;

      // 1989 has July alone: January to June fold, July to December keep their places
      expect(year(1989).folds.map(({ first, last }) => [(first % 12) + 1, (last % 12) + 1])).toEqual([[1, 6]]);
      expect(year(1989).cells.map(({ slot }) => (slot % 12) + 1)).toEqual([7, 8, 9, 10, 11, 12]);
      // 2026 has January and October, one in each half: nothing folds
      expect(year(2026).folds).toEqual([]);
    });

    it('breaks a year into lines of four on a phone and six on the portrait screen', () => {
      expect(layoutPeriodGrid(months, { kind: 'month', width: 374, gap: 10 })!.perLine).toBe(4);
      expect(layoutPeriodGrid(months, { kind: 'month', width: 1023, gap: 10 })!.perLine).toBe(6);
    });
  });
});
