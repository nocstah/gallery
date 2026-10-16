// Local Omarchy layer: the grid of Show selected (modals/SelectionReviewModal): square tiles on the desktop's gap, as
// many to a row as fit, and only the rows in view drawn, so a selection of thousands opens as fast as one of ten.

export type ReviewGrid = {
  columns: number;
  /** a tile's side, in px */
  tile: number;
  gap: number;
  rows: number;
  /** the whole grid's height, in px */
  height: number;
};

/** Square tiles at least `min` wide, as many to a row as `width` holds, the room left over shared out among them. */
export const reviewGrid = (width: number, count: number, { min, gap }: { min: number; gap: number }): ReviewGrid => {
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)));
  const tile = Math.max(1, (width - gap * (columns - 1)) / columns);
  const rows = Math.ceil(count / columns);
  return { columns, tile, gap, rows, height: rows > 0 ? rows * (tile + gap) - gap : 0 };
};

/** A length in px from a computed style (the desktop's --ws-gap), or `fallback` when it is none. */
export const pxOf = (value: string, fallback: number) => {
  const text = value.trim();
  const px = Number(text.replace(/px$/, ''));
  return text !== '' && Number.isFinite(px) && px >= 0 ? px : fallback;
};

/** Where a tile sits in the grid, in px. */
export const tilePosition = ({ columns, tile, gap }: ReviewGrid, index: number) => ({
  x: (index % columns) * (tile + gap),
  y: Math.floor(index / columns) * (tile + gap),
});

/** The tiles to draw (`start` up to `end`): the rows in view and `overscan` rows on either side. */
export const visibleRange = (grid: ReviewGrid, count: number, scrollTop: number, viewport: number, overscan = 2) => {
  const row = grid.tile + grid.gap;
  const first = Math.max(0, Math.floor(scrollTop / row) - overscan);
  const last = Math.min(grid.rows, Math.ceil((scrollTop + viewport) / row) + overscan);
  return { start: Math.min(count, first * grid.columns), end: Math.min(count, last * grid.columns) };
};

/**
 * Where the keyboard's caret goes for a key, or undefined when the key does not move it. Down from a row whose
 * neighbour below is short of tiles lands on the last tile; Page Up and Page Down move a screenful of rows.
 */
export const moveCaret = (
  index: number,
  key: string,
  { columns, count, pageRows }: { columns: number; count: number; pageRows: number },
): number | undefined => {
  const last = count - 1;
  switch (key) {
    case 'ArrowRight': {
      return Math.min(last, index + 1);
    }
    case 'ArrowLeft': {
      return Math.max(0, index - 1);
    }
    case 'ArrowDown': {
      const below = index + columns;
      return below <= last ? below : Math.floor(index / columns) < Math.floor(last / columns) ? last : index;
    }
    case 'ArrowUp': {
      return index >= columns ? index - columns : index;
    }
    case 'Home': {
      return 0;
    }
    case 'End': {
      return last;
    }
    case 'PageDown': {
      return Math.min(last, index + columns * Math.max(1, pageRows));
    }
    case 'PageUp': {
      return Math.max(0, index - columns * Math.max(1, pageRows));
    }
    default: {
      return undefined;
    }
  }
};
