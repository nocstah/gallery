import { TimelineManager } from '../timeline-manager.svelte';
import type { TimelineMonth } from '../timeline-month.svelte';
import type { MonthStart, UpdateGeometryOptions } from '../types';
import {
  cutRows,
  fitsOneLine,
  HAND_ON_COST,
  justifiedRow,
  MAX_SCALE,
  MIN_SCALE,
  type CutOptions,
  type RowPart,
} from './row-cuts';

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
  layoutTimelineMonths(timelineManager, month, noDefer);
}

// Local Omarchy layer ("Tiled Workspace"): rows of days fill the width edge to edge, the way tiled
// windows fill a workspace. A month's photos are cut into rows (internal/row-cuts: a day that fits on one
// line stays together, one too wide takes rows of its own, either gives way where a row would stay short)
// and each row is re-laid at one shared height chosen so it ends exactly at the viewport edge (photos
// shrink to MIN_SCALE or grow to MAX_SCALE of the target height). Everything is worked out from the
// photos' own ratios at the current width and zoom: a day whose upstream layout was deferred keeps
// positions from an older width, and judging rows by those let a row run past the edge (a video's corner
// icons and its stack badge were cut off) when the window narrowed or the zoom grew. No row is ever wider
// than the viewport.
// A run of days too small to fill a row even at MAX_SCALE (a month of three or four photos) widens its tiles, their
// edges cropped as object-fit: cover does, by up to this much so the row still ends at the edge; a month of one or two
// photos would need more and stays short (2026-10-15, the owner: "make it so that images align on the right side").
const MAX_STRETCH = 1.35;

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

// Months share rows (2026-10-15, the owner: "yes let months share rows"): a month whose last row cannot fill the width
// even at MAX_SCALE hands it to the next month instead of leaving it short, and the next month cuts it in with its own
// first days. The handed-on days hang below their own month's box, exactly where the next month's box begins, so the
// row reads as one; a month whose photos all go on that way has no height of its own. What a month hands on, and its
// height when it did (the next month places those days relative to it):
type Carry = { lines: DayLine[]; height: number };
const carried = new WeakMap<TimelineMonth, Carry>();

const sameCarry = (a: Carry | undefined, b: Carry | undefined) =>
  a === b ||
  (!!a &&
    !!b &&
    a.height === b.height &&
    a.lines.length === b.lines.length &&
    a.lines.every(
      (line, index) => line.day === b.lines[index].day && line.ratios.length === b.lines[index].ratios.length,
    ));

/**
 * Lays out a loaded month and what its change reaches: the month before it decides afresh whether its short last row
 * waits for this one, and each month after is laid out again while what it is handed changes.
 */
function layoutTimelineMonths(timelineManager: TimelineManager, month: TimelineMonth, noDefer: boolean) {
  const months = timelineManager.months;
  const requested = months.indexOf(month);
  if (requested === -1) {
    layoutTimelineMonth(timelineManager, month, noDefer);
    markMonthStart(timelineManager, month);
    return;
  }
  const from = requested > 0 && months[requested - 1].isLoaded ? requested - 1 : requested;
  let last = from;
  for (let index = from; index < months.length && months[index].isLoaded; index++) {
    const current = months[index];
    const before = carried.get(current);
    layoutTimelineMonth(timelineManager, current, noDefer);
    last = index;
    if (index >= requested && sameCarry(before, carried.get(current))) {
      break;
    }
  }
  // only now: a month whose first days were handed on had them placed by the month after it, and a month before these
  // whose photos all went on (it has no height of its own) may have had them placed again here
  for (let index = from; index <= last; index++) {
    markMonthStart(timelineManager, months[index]);
  }
  for (let index = from - 1; index >= 0 && months[index].isLoaded && months[index].height === 0; index--) {
    markMonthStart(timelineManager, months[index]);
  }
}

// Local Omarchy layer ("quiet month marks", 2026-10-16): with months sharing rows and no day labels, nothing in the
// grid said where one month ends and the next begins. Each layout notes where a month starts (its first photo in grid
// order, that photo's row and the gaps around it); Month.svelte draws the month's mark on that photo and a hairline in
// the gap before it, and moves no tile for either. Only months laid out in rows here, on the plain grid: day labels
// date every day already, and upstream's packing (the fallback) leaves no gap between months to draw in.
const laidOutInRows = new WeakSet<TimelineMonth>();

const sameStart = (a: MonthStart | undefined, b: MonthStart | undefined) =>
  a === b ||
  (!!a &&
    !!b &&
    a.assetId === b.assetId &&
    a.start === b.start &&
    a.top === b.top &&
    a.height === b.height &&
    a.gap === b.gap &&
    a.rowGap === b.rowGap);

function markMonthStart(timelineManager: TimelineManager, month: TimelineMonth) {
  const first = month.timelineDays[0];
  const assetId = first?.viewerAssets[0]?.id;
  // the first photo's own place: a day can start along a row and go on to the next ones, its box from the row's start
  const head = first?.viewerAssets[0]?.position;
  const headerHeight = timelineManager.headerHeight;
  const spacing = timelineManager.justifiedLayoutOptions.spacing;
  const next: MonthStart | undefined =
    first && assetId && head && headerHeight === 0 && laidOutInRows.has(month)
      ? {
          assetId,
          start: first.start + head.left,
          top: first.top + head.top,
          height: head.height,
          gap: spacing,
          rowGap: spacing,
        }
      : undefined;
  if (!sameStart(month.monthStart, next)) {
    month.monthStart = next;
  }
}

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

export function layoutTimelineMonth(timelineManager: TimelineManager, month: TimelineMonth, noDefer: boolean = false) {
  const options = timelineManager.justifiedLayoutOptions;
  for (const timelineDay of month.timelineDays) {
    timelineDay.layout(options, noDefer);
  }
  // a tile with neither a ratio nor a box to take one from: upstream's packing (and nothing handed on either way)
  if (month.timelineDays.some((day) => !ratiosOf(day))) {
    carried.delete(month);
    laidOutInRows.delete(month);
    layoutTimelineMonthPacked(timelineManager, month);
    return;
  }
  laidOutInRows.add(month);

  const viewportWidth = timelineManager.viewportWidth;
  const spacing = options.spacing;
  const rowHeight = timelineManager.rowHeight;
  const headerHeight = timelineManager.headerHeight;
  // Without day labels the days merge into one grid: days and rows sit on the photo spacing, and a day may share rows
  // across its own breaks (internal/row-cuts); with them every day keeps rows of its own under its label.
  const share = headerHeight === 0;
  const gap = share ? spacing : timelineManager.gap;
  const rowGap = share ? spacing : 0;

  const fillHeight = (lines: DayLine[]) => {
    const ratioSum = lines.reduce((sum, line) => sum + line.ratios.reduce((a, b) => a + b, 0), 0);
    const fixed = lines.reduce((sum, line) => sum + (line.ratios.length - 1) * spacing, 0) + (lines.length - 1) * gap;
    return (viewportWidth - fixed) / ratioSum;
  };

  const months = timelineManager.months;
  const index = months.indexOf(month);
  const previous = index > 0 ? months[index - 1] : undefined;
  const next = index === -1 ? undefined : months[index + 1];
  // what the month before handed on starts this month's rows, each of its days whole
  const incoming = previous?.isLoaded ? carried.get(previous) : undefined;
  const run: (DayLine & { whole?: boolean })[] = [
    ...(incoming?.lines ?? []).map((line) => ({ ...line, whole: true })),
    ...month.timelineDays.map((day) => ({ day, ratios: ratiosOf(day)! })),
  ];

  // 1. cut the month's photos into rows (internal/row-cuts): the cuts that keep every row's height nearest the target,
  //    the last row included. A last row of whole days that cannot fill even at MAX_SCALE waits for the next month,
  //    when that one is here to take it: loaded, laid out the same way, and with room for them beside its first photo
  //    (its first day, whole, with day labels); the month fills its own last row where the next has no such room
  const cutOptions: CutOptions = { width: viewportWidth, rowHeight, spacing, gap, share };
  const nextFirst =
    next?.isLoaded && next.timelineDays.every((day) => ratiosOf(day)) ? next.timelineDays[0] : undefined;
  const nextRatios = nextFirst ? ratiosOf(nextFirst) : undefined;
  const beside = share
    ? nextRatios?.slice(0, 1)
    : nextRatios && fitsOneLine(nextRatios, cutOptions)
      ? nextRatios
      : undefined;
  const wholeDaysOf = (row: RowPart[]) => row.map((part) => run[part.day]);
  let rows = cutRows(run, beside ? { ...cutOptions, handOn: HAND_ON_COST } : cutOptions);
  let handOn: DayLine[] | undefined;
  const last = rows.at(-1);
  if (nextFirst && beside && last?.[0].from === 0 && fillHeight(wholeDaysOf(last)) > rowHeight * MAX_SCALE) {
    if (fillHeight([...wholeDaysOf(last), { day: nextFirst, ratios: beside }]) >= rowHeight * MIN_SCALE) {
      handOn = wholeDaysOf(last);
      rows = rows.slice(0, -1);
    } else {
      rows = cutRows(run, cutOptions);
    }
  }

  // 2. place: each row fills the width at one shared height; a row that cannot fill at MAX_SCALE widens its tiles
  //    within MAX_STRETCH to end at the edge, or stays short past it. A day's box holds all of its rows: it starts at
  //    its first photo, or at the row's start when the day goes on to the next rows
  let top = 0;
  for (const [rowIndex, row] of rows.entries()) {
    // the height that ends the row at the edge, capped at MAX_SCALE, in whole pixels; the widths then take the hair
    // that rounding left (or, past the cap, widen the tiles, their edges cropped, by up to MAX_STRETCH) so the row ends
    // exactly at the edge; a row that would need more stays short. With day labels a row of a day too wide for one
    // line is justified to the edge at its own height
    const fill = fillHeight(
      row.map((part) => ({ ...run[part.day], ratios: run[part.day].ratios.slice(part.from, part.to) })),
    );
    const height = Math.round(justifiedRow(row, run, cutOptions) ? fill : Math.min(fill, rowHeight * MAX_SCALE));
    const reach = fill / height;
    const stretch = reach <= MAX_STRETCH ? reach : 1;
    let x = 0;
    for (const [col, part] of row.entries()) {
      const { day, ratios } = run[part.day];
      // a day handed on by an earlier month hangs below that month's box, on this month's row
      const rowTop = top + (day.timelineMonth === month ? 0 : month.top - day.timelineMonth.top);
      if (part.from === 0) {
        day.row = rowIndex;
        day.col = col;
        day.start = part.to < ratios.length ? 0 : Math.round(x);
        day.top = rowTop;
        day.width = 0;
      }
      const end = placeTiles(day.viewerAssets.slice(part.from, part.to), ratios.slice(part.from, part.to), {
        x,
        origin: day.start,
        top: rowTop - day.top,
        height,
        stretch,
        spacing,
      });
      day.width = Math.max(day.width, Math.round(end) - day.start);
      day.height = rowTop - day.top + height;
      if (part.to === ratios.length) {
        day.updateAssetBoundaries();
      }
      x = end + gap;
    }
    // with day labels, the rows of one day stand under its one label
    const goesOn = (rows[rowIndex + 1]?.[0]?.from ?? 0) > 0;
    top += height + (goesOn ? spacing : headerHeight + rowGap);
  }

  month.height = top;
  month.isHeightActual = true;
  if (handOn) {
    carried.set(month, { lines: handOn, height: month.height });
  } else {
    carried.delete(month);
  }
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
