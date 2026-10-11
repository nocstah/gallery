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
// span several lines take a row to themselves with their lines balanced. Falls back to upstream's packing while any day's layout is deferred.
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
  // any tile without a position (a deferred day, or photos added to it since): upstream's packing
  if (month.timelineDays.some((day) => day.viewerAssets.some((viewerAsset) => !viewerAsset.position))) {
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

  // 1. pool single-line days greedily into rows; multi-line days stand alone
  const rows: Row[] = [];
  let pending: DayLine[] = [];
  for (const timelineDay of month.timelineDays) {
    const ratios = singleLineRatios(timelineDay);
    if (!ratios) {
      if (pending.length > 0) {
        rows.push({ kind: 'pool', lines: pending });
        pending = [];
      }
      rows.push({ kind: 'multi', day: timelineDay });
      continue;
    }
    const candidate = [...pending, { day: timelineDay, ratios }];
    if (pending.length > 0 && fillHeight(candidate) < rowHeight * MIN_SCALE) {
      rows.push({ kind: 'pool', lines: pending });
      pending = [{ day: timelineDay, ratios }];
    } else {
      pending = candidate;
    }
  }
  if (pending.length > 0) {
    rows.push({ kind: 'pool', lines: pending });
  }

  // 2. a pooled row that could only fill by growing past MAX_SCALE joins the pooled row above it
  //    when the two together still fill at MIN_SCALE or more, so stray days never balloon
  for (let index = rows.length - 1; index > 0; index--) {
    const current = rows[index];
    const previous = rows[index - 1];
    if (current.kind !== 'pool' || previous.kind !== 'pool') {
      continue;
    }
    if (fillHeight(current.lines) > rowHeight * MAX_SCALE) {
      const merged = [...previous.lines, ...current.lines];
      if (fillHeight(merged) >= rowHeight * MIN_SCALE) {
        rows.splice(index - 1, 2, { kind: 'pool', lines: merged });
      }
    }
  }

  // 3. place: pooled rows fill the width at one shared height (a row that still cannot fill stays short
  //    at MAX_SCALE); multi-line days get balanced, full-width lines
  let top = 0;
  for (const [rowIndex, entry] of rows.entries()) {
    if (entry.kind === 'multi') {
      const day = entry.day;
      const tileRatios = allRatios(day);
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
    const height = Math.floor(Math.max(rowHeight * MIN_SCALE, Math.min(fillHeight(entry.lines), rowHeight * MAX_SCALE)));
    let start = 0;
    for (const [col, line] of entry.lines.entries()) {
      placeLine(line, height, spacing);
      line.day.row = rowIndex;
      line.day.col = col;
      line.day.start = start;
      line.day.top = top;
      line.day.updateAssetBoundaries();
      start += line.day.width + gap;
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
