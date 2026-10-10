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
// height chosen so the row ends exactly at the viewport edge (shrinking photos by at most MIN_SCALE;
// growing them as far as needed, up to 70% of the viewport height). Days that span several lines take
// a row to themselves with their lines balanced. Only a month's last row may stay short (MAX_SCALE). Falls back to upstream's packing while any day's layout is deferred.
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.6;

type DayLine = { day: TimelineMonth['timelineDays'][number]; ratios: number[] };

const singleLineRatios = (day: TimelineMonth['timelineDays'][number]): number[] | undefined => {
  const positions = day.viewerAssets.map((viewerAsset) => viewerAsset.position);
  if (positions.length === 0 || positions.some((position) => !position || position.height <= 0)) {
    return undefined;
  }
  if (positions.some((position) => position!.top !== positions[0]!.top)) {
    return undefined;
  }
  return positions.map((position) => position!.width / position!.height);
};

const placeLine = (line: DayLine, height: number, spacing: number) => {
  let left = 0;
  for (const [index, viewerAsset] of line.day.viewerAssets.entries()) {
    const width = line.ratios[index] * height;
    viewerAsset.position = { top: 0, left, width, height };
    left += width + spacing;
  }
  line.day.width = left - spacing;
  line.day.height = height;
};

const allRatios = (day: TimelineMonth['timelineDays'][number]): number[] | undefined => {
  const positions = day.viewerAssets.map((viewerAsset) => viewerAsset.position);
  if (positions.length === 0 || positions.some((position) => !position || position.height <= 0)) {
    return undefined;
  }
  return positions.map((position) => position!.width / position!.height);
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
    const height = Math.floor((width - (indexes.length - 1) * spacing) / ratioSum);
    let left = 0;
    for (const index of indexes) {
      const tileWidth = ratios[index] * height;
      day.viewerAssets[index].position = { top, left, width: tileWidth, height };
      left += tileWidth + spacing;
    }
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
  if (month.timelineDays.some((day) => day.viewerAssets.length > 0 && !day.viewerAssets[0].position)) {
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

  let top = 0;
  let row = 0;
  let pending: DayLine[] = [];

  const flush = (isLast: boolean) => {
    if (pending.length === 0) {
      return;
    }
    const ratioSum = pending.reduce((sum, line) => sum + line.ratios.reduce((a, b) => a + b, 0), 0);
    const fixed =
      pending.reduce((sum, line) => sum + (line.ratios.length - 1) * spacing, 0) + (pending.length - 1) * gap;
    const fill = (viewportWidth - fixed) / ratioSum;
    // the last row of a month may stay short rather than blow one photo up to the full width
    const ceiling = isLast ? rowHeight * MAX_SCALE : Math.max(rowHeight * MAX_SCALE, timelineManager.viewportHeight * 0.7);
    const height = Math.max(rowHeight * MIN_SCALE, Math.min(fill, ceiling));
    let start = 0;
    for (const [col, line] of pending.entries()) {
      placeLine(line, Math.floor(height), spacing);
      line.day.row = row;
      line.day.col = col;
      line.day.start = start;
      line.day.top = top;
      line.day.updateAssetBoundaries();
      start += line.day.width + gap;
    }
    top += Math.floor(height) + headerHeight + rowGap;
    row++;
    pending = [];
  };

  for (const timelineDay of month.timelineDays) {
    const ratios = singleLineRatios(timelineDay);
    if (!ratios) {
      // a multi-line day takes a row of its own, its lines balanced and justified to the full width
      flush(false);
      const tileRatios = allRatios(timelineDay);
      if (tileRatios) {
        placeBalanced(timelineDay, tileRatios, viewportWidth, rowHeight, spacing);
      }
      timelineDay.row = row++;
      timelineDay.col = 0;
      timelineDay.start = 0;
      timelineDay.top = top;
      timelineDay.updateAssetBoundaries();
      top += timelineDay.height + headerHeight + rowGap;
      continue;
    }
    const candidate = [...pending, { day: timelineDay, ratios }];
    const ratioSum = candidate.reduce((sum, line) => sum + line.ratios.reduce((a, b) => a + b, 0), 0);
    const fixed =
      candidate.reduce((sum, line) => sum + (line.ratios.length - 1) * spacing, 0) + (candidate.length - 1) * gap;
    if (pending.length > 0 && ratioSum * rowHeight * MIN_SCALE + fixed > viewportWidth) {
      flush(false);
      pending = [{ day: timelineDay, ratios }];
    } else {
      pending = candidate;
    }
  }
  flush(true);

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
