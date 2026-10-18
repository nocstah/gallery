import { AssetOrder, TimeBucketSize, type TimeBucketsResponseDto } from '@immich/sdk';
import { layoutPeriodGrid, periodSlot, type PeriodGrid } from '$lib/utils/period-grid';
import type { TimelineBucketDate, TimelineGrouping } from './types';

export const REPRESENTATIVE_TIMELINE_BUCKET_HEIGHT = 296;
export const REPRESENTATIVE_TIMELINE_BUCKET_GAP = 32;

type TimelineBucketManager = {
  topSectionHeight: number;
};

export function getTimeBucketSizeForGrouping(grouping: TimelineGrouping): TimeBucketSize {
  switch (grouping) {
    case 'year': {
      return TimeBucketSize.Year;
    }
    case 'month': {
      return TimeBucketSize.Month;
    }
    case 'day': {
      return TimeBucketSize.Day;
    }
  }
}

function getMonthBucket(timeBucket: string) {
  const [year, month] = timeBucket.split('-', 2);
  return `${year}-${month}-01`;
}

function getBucketDate(grouping: TimelineGrouping, timeBucket: string): TimelineBucketDate {
  const [year, month, day] = timeBucket.split('-').map(Number);

  if (grouping === 'year') {
    return { year };
  }

  if (grouping === 'month') {
    return { year, month };
  }

  return { year, month, day };
}

export function aggregateDayBucketsByMonth(
  timeBuckets: TimeBucketsResponseDto[],
  order: AssetOrder = AssetOrder.Desc,
): TimeBucketsResponseDto[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const months = new Map<string, TimeBucketsResponseDto>();

  for (const bucket of timeBuckets) {
    const timeBucket = getMonthBucket(bucket.timeBucket);
    const existing = months.get(timeBucket);
    months.set(timeBucket, {
      timeBucket,
      count: (existing?.count ?? 0) + bucket.count,
    });
  }

  return [...months.values()].sort((a, b) =>
    order === AssetOrder.Asc ? a.timeBucket.localeCompare(b.timeBucket) : b.timeBucket.localeCompare(a.timeBucket),
  );
}

/** Local Omarchy layer: how the Years and Months overviews are laid out besides their width */
export type TimelineBucketsLayout = {
  /** the desktop's gap between tiles (--ws-gap) */
  gap?: number;
  newestFirst?: boolean;
  /** the room in view under the timeline's top section, so a short archive fits it */
  viewportHeight?: number;
};

/**
 * Lays the buckets out. Local Omarchy layer: with a width, years and months are the archive's shape (utils/period-grid:
 * a row per decade or year, its periods at their places in it, the periods without photos as gaps), on the one gutter
 * and the desktop's gap, and the grid is returned for the gaps and the rows' names; without one, upstream's banners.
 */
export function layoutTimelineBuckets(
  buckets: TimelineBucket[],
  width = 0,
  { gap = 10, newestFirst = true, viewportHeight }: TimelineBucketsLayout = {},
): PeriodGrid | undefined {
  const grouping = buckets[0]?.grouping;
  if ((grouping === 'year' || grouping === 'month') && width > 0) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a lookup for this layout only
    const bySlot = new Map(buckets.map((bucket) => [periodSlot(grouping, bucket.date), bucket]));
    const grid = layoutPeriodGrid(
      buckets.map((bucket) => ({ slot: periodSlot(grouping, bucket.date), count: bucket.count })),
      { kind: grouping, width, gap, newestFirst, viewportHeight },
    );
    for (const row of grid?.rows ?? []) {
      if (row.kind !== 'period') {
        continue;
      }
      for (const cell of row.cells) {
        bySlot.get(cell.slot)?.place(cell.top, cell.left, cell.width, cell.height, row);
      }
    }
    return grid;
  }
  let top = 0;

  for (const bucket of buckets) {
    bucket.setTop(top);
    top += bucket.height + REPRESENTATIVE_TIMELINE_BUCKET_GAP;
  }
}

/** The height the buckets take, from the top of the first to the bottom of the lowest. */
export function timelineBucketsHeight(buckets: TimelineBucket[]) {
  let bottom = 0;
  for (const bucket of buckets) {
    bottom = Math.max(bottom, bucket.layoutTop + bucket.height);
  }
  return bottom;
}

export class TimelineBucket {
  readonly grouping: TimelineGrouping;
  readonly timeBucket: string;
  readonly count: number;
  representativeAssetId = $state<string | null>(null);
  representativeThumbhash = $state<string | null>(null);
  representativeRatio = $state<number | null>(null);
  readonly date: TimelineBucketDate;
  readonly isLoaded = true;
  height = $state(REPRESENTATIVE_TIMELINE_BUCKET_HEIGHT);
  /** Local Omarchy layer: in the Years and Months grid, the tile's left edge and width; null for a full-width banner */
  left = $state<number | null>(null);
  size = $state<number | null>(null);

  #top = $state(0);
  /** the row the tile stands in (its decade or year, the row's name included), where a jump to it scrolls */
  #rowTop = $state(0);
  #rowHeight = $state(REPRESENTATIVE_TIMELINE_BUCKET_HEIGHT);
  #manager: TimelineBucketManager;

  constructor(manager: TimelineBucketManager, grouping: TimelineGrouping, timeBucket: TimeBucketsResponseDto) {
    this.#manager = manager;
    this.grouping = grouping;
    this.timeBucket = timeBucket.timeBucket;
    this.count = timeBucket.count;
    this.date = getBucketDate(grouping, timeBucket.timeBucket);
  }

  setRepresentative(cover: {
    representativeAssetId: string | null;
    representativeThumbhash: string | null;
    representativeRatio: number | null;
  }) {
    this.representativeAssetId = cover.representativeAssetId;
    this.representativeThumbhash = cover.representativeThumbhash;
    this.representativeRatio = cover.representativeRatio;
  }

  get viewId() {
    return `${this.grouping}:${this.timeBucket}`;
  }

  get top() {
    return this.#top + this.#manager.topSectionHeight;
  }

  get layoutTop() {
    return this.#top;
  }

  get rowTop() {
    return this.#rowTop + this.#manager.topSectionHeight;
  }

  get rowHeight() {
    return this.#rowHeight;
  }

  setTop(top: number) {
    this.#top = top;
    this.height = REPRESENTATIVE_TIMELINE_BUCKET_HEIGHT;
    this.left = null;
    this.size = null;
    this.#rowTop = top;
    this.#rowHeight = this.height;
  }

  place(top: number, left: number, width: number, height = width, row?: { top: number; height: number }) {
    this.#top = top;
    this.height = height;
    this.left = left;
    this.size = width;
    this.#rowTop = row?.top ?? top;
    this.#rowHeight = row?.height ?? height;
  }
}
