// Local Omarchy layer: ↑ and ↓ in the timeline's photo grid, read from where the tiles are drawn. The rows are
// justified and months share rows (DESIGN.md, Layout), so the grid's order cannot say which photo is above another:
// the row above or below is the nearest line of tiles on that side, and the photo in it is the one nearest by its
// horizontal centre, as a person's eye moves.

/** A tile's box on screen (a DOMRect will do). */
export type TileBox = { top: number; bottom: number; left: number; right: number };

/** How far apart (px) two tiles' tops may be and still be one row: rows sit on whole pixels, a subpixel more is noise. */
export const ROW_TOLERANCE = 2;

const centre = (box: TileBox) => (box.left + box.right) / 2;

/** The tiles in the same row as `from`, by index, in the order given (the grid's own). */
export const rowOf = (boxes: readonly TileBox[], from: TileBox, tolerance = ROW_TOLERANCE) =>
  boxes.flatMap((box, index) => (Math.abs(box.top - from.top) <= tolerance ? [index] : []));

/**
 * The tile in the row above (`up`) or below (`down`) the one at `from`, by its index in `boxes`, nearest by horizontal
 * centre (the one further left when two are as near); undefined when no row is drawn on that side.
 */
export const rowNeighbour = (
  boxes: readonly TileBox[],
  from: TileBox,
  direction: 'up' | 'down',
  tolerance = ROW_TOLERANCE,
): number | undefined => {
  const down = direction === 'down';
  let rowTop: number | undefined;
  for (const box of boxes) {
    const beyond = down ? box.top > from.top + tolerance : box.top < from.top - tolerance;
    if (beyond && (rowTop === undefined || (down ? box.top < rowTop : box.top > rowTop))) {
      rowTop = box.top;
    }
  }
  if (rowTop === undefined) {
    return;
  }
  const at = centre(from);
  let best: number | undefined;
  for (const [index, box] of boxes.entries()) {
    if (Math.abs(box.top - rowTop) > tolerance) {
      continue;
    }
    const distance = Math.abs(centre(box) - at);
    const bestBox = best === undefined ? undefined : boxes[best];
    const bestDistance = bestBox ? Math.abs(centre(bestBox) - at) : Infinity;
    if (distance < bestDistance || (distance === bestDistance && bestBox && box.left < bestBox.left)) {
      best = index;
    }
  }
  return best;
};

/**
 * How far (px) to scroll so `tile` is wholly inside the clear band `[top, bottom]` with `air` around it, or 0 when it
 * already is; a tile taller than the band lines up with its top.
 */
export const revealDelta = (tile: { top: number; bottom: number }, band: { top: number; bottom: number }, air = 8) => {
  if (tile.top < band.top + air || tile.bottom - tile.top > band.bottom - band.top - 2 * air) {
    return tile.top - band.top - air;
  }
  if (tile.bottom > band.bottom - air) {
    return tile.bottom - band.bottom + air;
  }
  return 0;
};
