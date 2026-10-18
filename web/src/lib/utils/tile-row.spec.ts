import { tileRowColumns } from '$lib/utils/tile-row';

describe(tileRowColumns.name, () => {
  const tiles = { min: 144, gap: 10 };

  it('takes as many tiles as fit when there are more', () => {
    // the laptop's row: seven of the twelve
    expect(tileRowColumns(1167, 12, tiles)).toBe(7);
  });

  it('widens a few tiles to fill the row: twelve where fourteen would fit (the AORUS)', () => {
    expect(tileRowColumns(2287, 12, tiles)).toBe(12);
  });

  it('widens them no further than a third and more, and leaves the rest of the row empty', () => {
    // two tiles in a row for fourteen: at most 1.35 times as wide, eleven to the row
    expect(tileRowColumns(2287, 2, tiles)).toBe(11);
  });

  it('keeps a tile even where none fits', () => {
    expect(tileRowColumns(0, 12, tiles)).toBe(1);
  });
});
