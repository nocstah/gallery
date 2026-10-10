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
// height chosen so the row ends exactly at the viewport edge (shrinking photos by at most MIN_SCALE,
// growing them by at most MAX_SCALE). Days that already span several lines keep their own layout and
// take a row to themselves. Falls back to upstream's packing while any day's layout is deferred.
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
  const gap = timelineManager.gap;
  const spacing = options.spacing;
  const rowHeight = timelineManager.rowHeight;
  const headerHeight = timelineManager.headerHeight;

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
    const height = Math.max(rowHeight * MIN_SCALE, Math.min(fill, rowHeight * (isLast ? 1 : MAX_SCALE)));
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
    top += Math.floor(height) + headerHeight;
    row++;
    pending = [];
  };

  for (const timelineDay of month.timelineDays) {
    const ratios = singleLineRatios(timelineDay);
    if (!ratios) {
      // a multi-line day already fills the width: give it a row of its own
      flush(false);
      timelineDay.row = row++;
      timelineDay.col = 0;
      timelineDay.start = 0;
      timelineDay.top = top;
      top += timelineDay.height + headerHeight;
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
