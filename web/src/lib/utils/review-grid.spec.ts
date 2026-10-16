import { moveCaret, pxOf, reviewGrid, tilePosition, visibleRange } from '$lib/utils/review-grid';

describe('reviewGrid', () => {
  it('fits as many square tiles to a row as the width holds and shares out what is left', () => {
    const grid = reviewGrid(1000, 20, { min: 150, gap: 10 });
    expect(grid.columns).toBe(6);
    expect(grid.tile).toBeCloseTo((1000 - 5 * 10) / 6);
    expect(grid.rows).toBe(4);
    expect(grid.height).toBeCloseTo(4 * (grid.tile + 10) - 10);
  });

  it('keeps one column however narrow, and no height for no tiles', () => {
    expect(reviewGrid(80, 3, { min: 150, gap: 10 }).columns).toBe(1);
    expect(reviewGrid(1000, 0, { min: 150, gap: 10 }).height).toBe(0);
  });

  it('places a tile by its row and column', () => {
    const grid = reviewGrid(320, 10, { min: 100, gap: 10 });
    expect(grid.columns).toBe(3);
    expect(tilePosition(grid, 4)).toEqual({ x: 110, y: 110 });
  });
});

describe('pxOf', () => {
  it('reads the desktop gap in px, and falls back when there is none', () => {
    expect(pxOf('12px', 10)).toBe(12);
    expect(pxOf(' 8px', 10)).toBe(8);
    expect(pxOf('', 10)).toBe(10);
    expect(pxOf('1rem', 10)).toBe(10);
  });
});

describe('visibleRange', () => {
  // three columns of 100px tiles on a 10px gap: a row every 110px
  const grid = reviewGrid(320, 3000, { min: 100, gap: 10 });

  it('draws the rows in view and two more on either side, not the thousands', () => {
    expect(visibleRange(grid, 3000, 0, 440)).toEqual({ start: 0, end: 6 * 3 });
    const { start, end } = visibleRange(grid, 3000, 110 * 500, 440);
    expect(start).toBe(498 * 3);
    expect(end).toBe(506 * 3);
  });

  it('stops at the last tile', () => {
    expect(visibleRange(grid, 3000, grid.height, 440).end).toBe(3000);
    expect(visibleRange(grid, 4, 0, 440)).toEqual({ start: 0, end: 4 });
  });
});

describe('moveCaret', () => {
  const grid = { columns: 4, count: 10, pageRows: 2 };

  it('moves along a row and between rows', () => {
    expect(moveCaret(1, 'ArrowRight', grid)).toBe(2);
    expect(moveCaret(9, 'ArrowRight', grid)).toBe(9);
    expect(moveCaret(0, 'ArrowLeft', grid)).toBe(0);
    expect(moveCaret(1, 'ArrowDown', grid)).toBe(5);
    expect(moveCaret(5, 'ArrowUp', grid)).toBe(1);
    expect(moveCaret(1, 'ArrowUp', grid)).toBe(1);
  });

  it('goes down to the last tile when the row below is short, and no further from the last row', () => {
    // rows: 0-3, 4-7, 8-9
    expect(moveCaret(7, 'ArrowDown', grid)).toBe(9);
    expect(moveCaret(9, 'ArrowDown', grid)).toBe(9);
    expect(moveCaret(8, 'ArrowDown', grid)).toBe(8);
  });

  it('jumps to the ends and by a screenful of rows', () => {
    expect(moveCaret(5, 'Home', grid)).toBe(0);
    expect(moveCaret(5, 'End', grid)).toBe(9);
    expect(moveCaret(0, 'PageDown', grid)).toBe(8);
    expect(moveCaret(9, 'PageUp', grid)).toBe(1);
  });

  it('leaves other keys alone', () => {
    expect(moveCaret(3, 'Enter', grid)).toBeUndefined();
    expect(moveCaret(3, 'l', grid)).toBeUndefined();
  });
});
