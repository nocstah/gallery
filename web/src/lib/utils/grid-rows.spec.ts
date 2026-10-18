import { describe, expect, it } from 'vitest';
import { revealDelta, rowNeighbour, rowOf, type TileBox } from './grid-rows';

// Local Omarchy layer: ↑ and ↓ in the timeline's justified grid, by the rows as they are drawn (utils/grid-rows)
const tile = (top: number, left: number, right: number, height = 100): TileBox => ({
  top,
  bottom: top + height,
  left,
  right,
});

// three justified rows on a 10px gap; the middle one is shared by two months (September's last days, then
// October's first), and the third is taller
const september = [tile(0, 0, 200), tile(0, 210, 400), tile(0, 410, 600), tile(110, 0, 300)];
const october = [tile(110, 310, 600), tile(220, 0, 150, 140), tile(220, 160, 450, 140), tile(220, 460, 600, 140)];
const grid = [...september, ...october];

describe('rowNeighbour', () => {
  it('goes down to the tile in the row below nearest by horizontal centre', () => {
    // from the middle of the first row (centre 305): the row below has centres 150 and 455
    expect(rowNeighbour(grid, grid[1], 'down')).toBe(4);
    expect(rowNeighbour(grid, grid[0], 'down')).toBe(3);
  });

  it('goes up to the row above, across a month that shares the row', () => {
    expect(rowNeighbour(grid, grid[6], 'up')).toBe(4);
    expect(rowNeighbour(grid, grid[5], 'up')).toBe(3);
    expect(rowNeighbour(grid, grid[4], 'up')).toBe(2);
  });

  it('skips nothing: the nearest row, not the nearest tile in any row further on', () => {
    expect(rowNeighbour(grid, grid[2], 'down')).toBe(4);
    expect(rowNeighbour(grid, grid[3], 'down')).toBe(5);
  });

  it('reads the rows from where the tiles are, whatever order they come in', () => {
    const shuffled = [grid[6], grid[0], grid[4], grid[2], grid[7], grid[3], grid[1], grid[5]];
    expect(shuffled[rowNeighbour(shuffled, grid[1], 'down')!]).toBe(grid[4]);
    expect(shuffled[rowNeighbour(shuffled, grid[7], 'up')!]).toBe(grid[4]);
  });

  it('has nothing above the first row or below the last one drawn', () => {
    expect(rowNeighbour(grid, grid[0], 'up')).toBeUndefined();
    expect(rowNeighbour(grid, grid[7], 'down')).toBeUndefined();
    expect(rowNeighbour([], grid[0], 'down')).toBeUndefined();
  });

  it('counts tops a subpixel apart as one row', () => {
    const uneven = [tile(0.6, 0, 200), tile(0, 210, 400), tile(110.4, 0, 600)];
    expect(rowNeighbour(uneven, uneven[1], 'down')).toBe(2);
    expect(rowNeighbour(uneven, uneven[2], 'up')).toBe(1);
  });

  it('takes the tile further left when two are as near', () => {
    const even = [tile(0, 200, 400), tile(110, 0, 290), tile(110, 310, 600)];
    expect(rowNeighbour(even, even[0], 'down')).toBe(1);
  });
});

describe('rowOf', () => {
  it("lists the tiles of the row a tile is in, in the grid's order", () => {
    expect(rowOf(grid, grid[3])).toEqual([3, 4]);
    expect(rowOf(grid, grid[0])).toEqual([0, 1, 2]);
  });
});

describe('revealDelta', () => {
  const band = { top: 100, bottom: 900 };

  it('leaves a tile that is wholly in view where it is', () => {
    expect(revealDelta({ top: 200, bottom: 400 }, band)).toBe(0);
  });

  it('scrolls a tile under the top of the band down into view, with air above it', () => {
    expect(revealDelta({ top: 60, bottom: 260 }, band)).toBe(-48);
  });

  it('scrolls a tile past the foot of the band up into view, with air below it', () => {
    expect(revealDelta({ top: 800, bottom: 1000 }, band)).toBe(108);
  });

  it('lines up a tile taller than the band with its top', () => {
    expect(revealDelta({ top: 300, bottom: 1300 }, band)).toBe(192);
  });
});
