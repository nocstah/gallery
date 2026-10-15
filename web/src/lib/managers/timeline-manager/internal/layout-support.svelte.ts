import { TimelineManager } from '../timeline-manager.svelte';
import type { TimelineMonth } from '../timeline-month.svelte';
import type { UpdateGeometryOptions } from '../types';

export function updateGeometry(timelineManager: TimelineManager, month: TimelineMonth, options: UpdateGeometryOptions) {
  const { invalidateHeight, noDefer = false } = options;
  if (invalidateHeight) {
    month.isHeightActual = false;
  }
  if (!month.isLoaded) {
    const viewportWidth = timelineManager.viewportWidth;
    if (!month.isHeightActual) {
      const unwrappedWidth = (3 / 2) * month.assetsCount * timelineManager.rowHeight * (7 / 10);
      const rows = Math.ceil(unwrappedWidth / viewportWidth);
      const height = timelineManager.headerHeight + Math.max(1, rows) * timelineManager.rowHeight;
      month.height = height;
    }
    return;
  }
  layoutTimelineMonth(timelineManager, month, noDefer);
}

// Local Omarchy layer ("Tiled Workspace"): rows of days fill the width edge to edge, the way tiled
// windows fill a workspace. Days that fit on one line are pooled into rows and re-laid at one shared
// height chosen so the row ends exactly at the viewport edge (photos shrink to MIN_SCALE or grow to
// MAX_SCALE of the target height). A row that cannot fill within that joins the row above it; days that
// span several lines take a row to themselves with their lines balanced. Everything is worked out from the
// photos' own ratios at the current width and zoom: a day whose upstream layout was deferred keeps
// positions from an older width, and judging rows by those let a row run past the edge (a video's corner
// icons and its stack badge were cut off) when the window narrowed or the zoom grew. No row is ever wider
// than the viewport.
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.6;
// A run of days too small to fill a row even at MAX_SCALE (a month of three or four photos) widens its tiles, their
// edges cropped as object-fit: cover does, by up to this much so the row still ends at the edge; a month of one or two
// photos would need more and stays short (2026-10-15, the owner: "make it so that images align on the right side").
const MAX_STRETCH = 1.35;
// A row that cannot reach the edge costs more than any arrangement of rows that can.
const SHORT_ROW_COST = 100;

type DayLine = { day: TimelineMonth['timelineDays'][number]; ratios: number[] };

/** Each photo's width over height: its own ratio (what upstream's justified layout uses too), else its last box. */
const ratiosOf = (day: TimelineMonth['timelineDays'][number]): number[] | undefined => {
  const ratios = day.viewerAssets.map((viewerAsset) => {
    const ratio = viewerAsset.asset?.ratio;
    if (ratio && Number.isFinite(ratio) && ratio > 0) {
      return ratio;
    }
    const position = viewerAsset.position;
    return position && position.height > 0 ? position.width / position.height : undefined;
  });
  return ratios.length > 0 && ratios.every((ratio) => ratio !== undefined) ? (ratios as number[]) : undefined;
};

/** A day's ratios when its photos fit on one line at the smallest allowed height (it can join a pooled row). */
const singleLineRatios = (
  day: TimelineMonth['timelineDays'][number],
  width: number,
  rowHeight: number,
  spacing: number,
): number[] | undefined => {
  const ratios = ratiosOf(day);
  if (!ratios) {
    return undefined;
  }
  const total = ratios.reduce((sum, ratio) => sum + ratio, 0);
  return total * rowHeight * MIN_SCALE + (ratios.length - 1) * spacing <= width ? ratios : undefined;
};

/**
 * Lays tiles out left to right from `x` (a fractional position on the row) at one height, each `ratio * height *
 * stretch` wide, and rounds every tile's edges to whole pixels relative to `origin`, so a line that fills ends exactly
 * at the edge (flooring the height lost up to a pixel per photo and left most rows a few pixels short). Returns where
 * the last tile ends.
 */
const placeTiles = (
  viewerAssets: TimelineMonth['timelineDays'][number]['viewerAssets'],
  ratios: number[],
  {
    x,
    origin,
    top,
    height,
    stretch,
    spacing,
  }: { x: number; origin: number; top: number; height: number; stretch: number; spacing: number },
) => {
  let at = x;
  for (const [index, viewerAsset] of viewerAssets.entries()) {
    const width = ratios[index] * height * stretch;
    const left = Math.round(at) - origin;
    viewerAsset.position = { top, left, width: Math.round(at + width) - origin - left, height };
    at += width + spacing;
  }
  return at - spacing;
};

// A day too wide for one line: split its photos into lines of even weight and justify every line to
// the full width, so no line (the last included) is left with an orphan tile and empty ground.
const placeBalanced = (
  day: TimelineMonth['timelineDays'][number],
  ratios: number[],
  width: number,
  rowHeight: number,
  spacing: number,
) => {
  const total = ratios.reduce((a, b) => a + b, 0);
  const lineCount = Math.max(1, Math.round((total * rowHeight) / width));
  const target = total / lineCount;
  const lines: number[][] = [];
  let line: number[] = [];
  let sum = 0;
  for (const [index, ratio] of ratios.entries()) {
    const remainingLines = lineCount - lines.length;
    const remainingTiles = ratios.length - index;
    // close a line once it is past its share, but never strand fewer tiles than lines left
    if (line.length > 0 && remainingLines > 1 && sum + ratio / 2 > target && remainingTiles >= remainingLines - 1) {
      lines.push(line);
      line = [];
      sum = 0;
    }
    line.push(index);
    sum += ratio;
  }
  lines.push(line);

  let top = 0;
  for (const indexes of lines) {
    const ratioSum = indexes.reduce((acc, index) => acc + ratios[index], 0);
    const fill = (width - (indexes.length - 1) * spacing) / ratioSum;
    const height = Math.round(fill);
    placeTiles(
      indexes.map((index) => day.viewerAssets[index]),
      indexes.map((index) => ratios[index]),
      { x: 0, origin: 0, top, height, stretch: fill / height, spacing },
    );
    top += height + spacing;
  }
  day.width = width;
  day.height = top - spacing;
};

export function layoutTimelineMonth(timelineManager: TimelineManager, month: TimelineMonth, noDefer: boolean = false) {
  const options = timelineManager.justifiedLayoutOptions;
  for (const timelineDay of month.timelineDays) {
    timelineDay.layout(options, noDefer);
  }
  // a tile with neither a ratio nor a box to take one from: upstream's packing
  if (month.timelineDays.some((day) => !ratiosOf(day))) {
    layoutTimelineMonthPacked(timelineManager, month);
    return;
  }

  const viewportWidth = timelineManager.viewportWidth;
  const spacing = options.spacing;
  const rowHeight = timelineManager.rowHeight;
  const headerHeight = timelineManager.headerHeight;
  // Without day labels the days merge into one grid: days and rows sit on the photo spacing.
  const gap = headerHeight === 0 ? spacing : timelineManager.gap;
  const rowGap = headerHeight === 0 ? spacing : 0;

  type Row = { kind: 'pool'; lines: DayLine[] } | { kind: 'multi'; day: TimelineMonth['timelineDays'][number] };
  const fillHeight = (lines: DayLine[]) => {
    const ratioSum = lines.reduce((sum, line) => sum + line.ratios.reduce((a, b) => a + b, 0), 0);
    const fixed = lines.reduce((sum, line) => sum + (line.ratios.length - 1) * spacing, 0) + (lines.length - 1) * gap;
    return (viewportWidth - fixed) / ratioSum;
  };

  // 1. cut each run of single-line days (between days that take several lines) into rows as a whole, choosing the cuts
  //    that keep every row's height nearest the target, the last row included, so no run ends on a short row while
  //    another cut would have filled it (greedy pooling left the month's last row wherever its days ran out)
  const balanceRun = (lines: DayLine[]): Row[] => {
    const ratioPrefix = [0];
    const tilePrefix = [0];
    for (const line of lines) {
      ratioPrefix.push(ratioPrefix.at(-1)! + line.ratios.reduce((a, b) => a + b, 0));
      tilePrefix.push(tilePrefix.at(-1)! + line.ratios.length);
    }
    const heightOf = (from: number, to: number) => {
      const days = to - from;
      const fixed = (tilePrefix[to] - tilePrefix[from] - days) * spacing + (days - 1) * gap;
      return (viewportWidth - fixed) / (ratioPrefix[to] - ratioPrefix[from]);
    };
    const best: number[] = [0];
    const cutAt: number[] = [0];
    for (let to = 1; to <= lines.length; to++) {
      best[to] = Infinity;
      cutAt[to] = to - 1;
      for (let from = to - 1; from >= 0; from--) {
        const scale = heightOf(from, to) / rowHeight;
        // more days only squeeze the row further; a single day always fits at MIN_SCALE
        if (scale < MIN_SCALE && from < to - 1) {
          break;
        }
        const cost = best[from] + Math.log(scale) ** 2 + (scale > MAX_SCALE ? SHORT_ROW_COST : 0);
        if (cost >= best[to]) {
          continue;
        }
        best[to] = cost;
        cutAt[to] = from;
      }
    }
    const balanced: Row[] = [];
    for (let to = lines.length; to > 0; to = cutAt[to]) {
      balanced.unshift({ kind: 'pool', lines: lines.slice(cutAt[to], to) });
    }
    return balanced;
  };

  const rows: Row[] = [];
  let run: DayLine[] = [];
  for (const timelineDay of month.timelineDays) {
    const ratios = singleLineRatios(timelineDay, viewportWidth, rowHeight, spacing);
    if (ratios) {
      run.push({ day: timelineDay, ratios });
      continue;
    }
    rows.push(...balanceRun(run), { kind: 'multi', day: timelineDay });
    run = [];
  }
  rows.push(...balanceRun(run));

  // 2. place: pooled rows fill the width at one shared height; a row that cannot fill at MAX_SCALE widens its tiles
  //    within MAX_STRETCH to end at the edge, or stays short past it; multi-line days get balanced, full-width lines
  let top = 0;
  for (const [rowIndex, entry] of rows.entries()) {
    if (entry.kind === 'multi') {
      const day = entry.day;
      const tileRatios = ratiosOf(day);
      if (tileRatios) {
        placeBalanced(day, tileRatios, viewportWidth, rowHeight, spacing);
      }
      day.row = rowIndex;
      day.col = 0;
      day.start = 0;
      day.top = top;
      day.updateAssetBoundaries();
      top += day.height + headerHeight + rowGap;
      continue;
    }
    // the height that ends the row at the edge, capped at MAX_SCALE, in whole pixels; the widths then take the hair
    // that rounding left (or, past the cap, widen the tiles, their edges cropped, by up to MAX_STRETCH) so the row ends
    // exactly at the edge; a row that would need more stays short
    const fill = fillHeight(entry.lines);
    const height = Math.round(Math.min(fill, rowHeight * MAX_SCALE));
    const reach = fill / height;
    const stretch = reach <= MAX_STRETCH ? reach : 1;
    let x = 0;
    for (const [col, line] of entry.lines.entries()) {
      const start = Math.round(x);
      const end = placeTiles(line.day.viewerAssets, line.ratios, {
        x,
        origin: start,
        top: 0,
        height,
        stretch,
        spacing,
      });
      line.day.width = Math.round(end) - start;
      line.day.height = height;
      line.day.row = rowIndex;
      line.day.col = col;
      line.day.start = start;
      line.day.top = top;
      line.day.updateAssetBoundaries();
      x = end + gap;
    }
    top += height + headerHeight + rowGap;
  }

  month.height = top;
  month.isHeightActual = true;
}

function layoutTimelineMonthPacked(timelineManager: TimelineManager, month: TimelineMonth) {
  let cumulativeHeight = 0;
  let cumulativeWidth = 0;
  let currentRowHeight = 0;

  let timelineDayRow = 0;
  let timelineDayCol = 0;

  for (const timelineDay of month.timelineDays) {
    // Calculate space needed for this item (including gap if not first in row)
    const spaceNeeded = timelineDay.width + (timelineDayCol > 0 ? timelineManager.gap : 0);
    const fitsInCurrentRow = cumulativeWidth + spaceNeeded <= timelineManager.viewportWidth;

    if (fitsInCurrentRow) {
      timelineDay.row = timelineDayRow;
      timelineDay.col = timelineDayCol++;
      timelineDay.start = cumulativeWidth;
      timelineDay.top = cumulativeHeight;
    } else {
      // Move to next row
      cumulativeHeight += currentRowHeight;
      cumulativeWidth = 0;
      timelineDayRow++;
      timelineDayCol = 0;

      // Position at start of new row
      timelineDay.row = timelineDayRow;
      timelineDay.col = timelineDayCol;
      timelineDay.start = 0;
      timelineDay.top = cumulativeHeight;

      timelineDayCol++;
    }
    cumulativeWidth += timelineDay.width + timelineManager.gap;
    currentRowHeight = timelineDay.height + timelineManager.headerHeight;
  }

  // Add the height of the final row
  cumulativeHeight += currentRowHeight;

  month.height = cumulativeHeight;
  month.isHeightActual = true;
}
