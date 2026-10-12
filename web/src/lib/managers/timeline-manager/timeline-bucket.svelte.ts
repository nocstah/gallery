import { AssetOrder, TimeBucketSize, type TimeBucketsResponseDto } from '@immich/sdk';
import type { TimelineBucketDate, TimelineGrouping } from './types';

export const REPRESENTATIVE_TIMELINE_BUCKET_HEIGHT = 296;
export const REPRESENTATIVE_TIMELINE_BUCKET_GAP = 32;
// Local Omarchy layer: months are square tiles in a grid (a wide banner per month read as a mess of stretched crops);
// as many columns of about MONTH_TILE px as fit, MONTH_GAP between them, MONTH_INSET at the sides
export const MONTH_TILE = 240;
export const MONTH_GAP = 12;
export const MONTH_INSET = 16;

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

export function layoutTimelineBuckets(buckets: TimelineBucket[], width = 0) {
  if (buckets[0]?.grouping === 'month' && width > 0) {
    const inner = width - 2 * MONTH_INSET;
    const columns = Math.max(2, Math.floor((inner + MONTH_GAP) / (MONTH_TILE + MONTH_GAP)));
    const size = Math.floor((inner - MONTH_GAP * (columns - 1)) / columns);
    for (const [index, bucket] of buckets.entries()) {
      const row = Math.floor(index / columns);
      bucket.place(row * (size + MONTH_GAP), MONTH_INSET + (index % columns) * (size + MONTH_GAP), size);
    }
    return;
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
  /** in the month grid: the tile's left edge and side; null for a full-width banner */
  left = $state<number | null>(null);
  size = $state<number | null>(null);

  #top = $state(0);
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

  setTop(top: number) {
    this.#top = top;
    this.height = REPRESENTATIVE_TIMELINE_BUCKET_HEIGHT;
    this.left = null;
    this.size = null;
  }

  place(top: number, left: number, size: number) {
    this.#top = top;
    this.height = size;
    this.left = left;
    this.size = size;
  }
}
