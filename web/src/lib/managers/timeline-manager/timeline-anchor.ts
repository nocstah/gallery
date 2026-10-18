import type { TimelineManager } from './timeline-manager.svelte';
import type { TimelineBucketDate, TimelineTemporalAnchor } from './types';

type TimelineTemporalAnchorTarget = {
  top: number;
  height: number;
};

function matchesAnchorDate(date: TimelineBucketDate, anchor: TimelineTemporalAnchor) {
  // A bucket without a month (year overview) matches on the year alone, so a
  // month-precision anchor still resolves when the grouping is coarser than the anchor.
  return (
    date.year === anchor.year && (anchor.month === undefined || date.month === undefined || date.month === anchor.month)
  );
}

function targetIsInViewport(timelineManager: TimelineManager, target: TimelineTemporalAnchorTarget): boolean {
  const viewportTop = timelineManager.scrollTop;
  const viewportBottom = viewportTop + timelineManager.viewportHeight;
  const targetBottom = target.top + target.height;

  return targetBottom > viewportTop && target.top < viewportBottom;
}

function getScrollTopForTarget(timelineManager: TimelineManager, target: TimelineTemporalAnchorTarget): number {
  return Math.min(target.top, Math.max(0, timelineManager.maxScroll));
}

export function getTimelineTemporalAnchorTarget(
  timelineManager: TimelineManager,
  anchor: TimelineTemporalAnchor,
): TimelineTemporalAnchorTarget | undefined {
  if (timelineManager.grouping === 'day' && anchor.month !== undefined) {
    const month = timelineManager.months.find(
      (month) => month.yearMonth.year === anchor.year && month.yearMonth.month === anchor.month,
    );

    if (!month) {
      return;
    }

    return { top: month.top, height: month.height };
  }

  // Local Omarchy layer: in the Years and Months grid a period's tile shares a row (its decade or year) with others,
  // which may break into lines on a narrow screen; a jump goes to the top of the row, its name included, so a year
  // opened into its months shows January's line first
  const bucket = timelineManager.timelineBuckets.find((bucket) => matchesAnchorDate(bucket.date, anchor));
  if (!bucket) {
    return;
  }

  return { top: bucket.rowTop, height: bucket.rowHeight };
}

/**
 * The date currently at the top of the viewport, expressed as a temporal anchor
 * for the active grouping. Used to preserve the visible position when the user
 * changes the grouping granularity, so the rebuilt timeline can scroll back to it
 * instead of jumping to the most recent content.
 */
export function getTimelineTopVisibleAnchor(timelineManager: TimelineManager): TimelineTemporalAnchor | undefined {
  if (!timelineManager?.isInitialized) {
    return undefined;
  }

  const { scrollTop } = timelineManager;

  // When the viewport top sits above the first card/month, the top section (e.g. the memories
  // strip) is showing and there is nothing to anchor to. Return undefined so callers keep the
  // current top position instead of scrolling down past the top section on a grouping change.
  if (timelineManager.grouping === 'day') {
    const months = timelineManager.months;
    if (!months || months.length === 0) {
      return undefined;
    }
    const month =
      months.find((month) => scrollTop >= month.top && scrollTop < month.top + month.height) ??
      (scrollTop < months[0].top ? undefined : months[0]);
    if (!month) {
      return undefined;
    }
    return { year: month.yearMonth.year, month: month.yearMonth.month };
  }

  const buckets = timelineManager.timelineBuckets;
  if (!buckets || buckets.length === 0) {
    return undefined;
  }
  // Local Omarchy layer: the topmost period still in view (past the last one, the last). In the Years and Months grid
  // several share a row, a row may break into lines and gaps and rows' names lie between them, so neither the first in
  // the timeline's order nor one under the very top edge is always the one at the top
  let bucket: TimelineManager['timelineBuckets'][number] | undefined;
  let lowest = buckets[0];
  let firstTop = Infinity;
  for (const candidate of buckets) {
    firstTop = Math.min(firstTop, candidate.top);
    if (candidate.top > lowest.top) {
      lowest = candidate;
    }
    if (candidate.top + candidate.height > scrollTop && (!bucket || candidate.top < bucket.top)) {
      bucket = candidate;
    }
  }
  if (scrollTop < firstTop) {
    return undefined;
  }
  bucket ??= lowest;

  return bucket.date.month === undefined
    ? { year: bucket.date.year }
    : { year: bucket.date.year, month: bucket.date.month };
}

export function scrollTimelineToTemporalAnchor(
  timelineManager: TimelineManager,
  anchor: TimelineTemporalAnchor,
): boolean {
  const target = getTimelineTemporalAnchorTarget(timelineManager, anchor);
  if (!target) {
    return false;
  }

  timelineManager.scrollTo(getScrollTopForTarget(timelineManager, target));
  return targetIsInViewport(timelineManager, target);
}
