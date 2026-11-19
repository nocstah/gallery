import { getTimelineAlbumQueryOptions, mergeTimeBuckets } from '#lib/gallery/timeline/album-picker-support.ts';
import { toTimeBucketRequest, toTimeBucketsRequest } from '#lib/gallery/timeline/request-options.ts';
import { workspaceGap } from '#lib/managers/VirtualScrollManager/VirtualScrollManager.svelte.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { periodFaces } from '#lib/managers/period-faces.ts';
import type { PersonPhotos } from '#lib/managers/timeline-manager/person-photos.ts';
import type { PersonStackIndex } from '#lib/managers/timeline-manager/person-stacks.ts';
import type {
  TimelineBucketDate,
  TimelineGrouping,
  TimelineManagerOptions,
} from '#lib/managers/timeline-manager/types.ts';
import { layoutPeriodGrid, periodSlot, type PeriodGrid } from '#lib/utils/period-grid.ts';
import {
  AssetOrder,
  TimeBucketSize,
  getTimeBucket,
  getTimeBucketCovers,
  getTimeBuckets,
  type TimeBucketCoverResponseDto,
  type TimeBucketsResponseDto,
} from '@immich/sdk';

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
Lays the buckets out. Local Omarchy layer: with a width, years and months are the archive's shape (utils/period-grid:
a row per decade or year, its periods at their places in it, the periods without photos as gaps), on the one gutter
and the desktop's gap, and the grid is returned for the gaps and the rows' names; without one, upstream's banners.
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

type TimelineBucketLayoutHost = TimelineBucketManager & {
  grouping: TimelineGrouping;
  timelineBuckets: TimelineBucket[];
  /** Local Omarchy layer: the Years and Months overviews' grid (utils/period-grid), for its gaps and its rows' names */
  periodGrid: PeriodGrid | undefined;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
};

/** Local Omarchy layer: a person's page as the timeline shows it, a photo search and/or its folded stacks. */
export type TimelineBucketPeople = {
  photos?: PersonPhotos;
  stacks?: PersonStackIndex;
};

/**
Gallery's day/month/year grouping as one layout object. Upstream's `TimelineManager` keeps its months for the
day view and guards into this object (`grouping !== 'day'`) for the year/month cards: fetching and merging the
time buckets, laying them out, their height and count, and the lazily loaded cover of each card.
*/
export class TimelineBucketLayout {
  #host: TimelineBucketLayoutHost;
  #options: TimelineManagerOptions = {};
  #people: TimelineBucketPeople = {};
  #generation = 0;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #coverRequested = new Set<string>();

  constructor(host: TimelineBucketLayoutHost) {
    this.#host = host;
  }

  get height() {
    const buckets = this.#host.timelineBuckets;
    if (buckets.length === 0) {
      return 0;
    }

    return this.#host.periodGrid?.height ?? timelineBucketsHeight(buckets);
  }

  get count() {
    let count = 0;
    for (const bucket of this.#host.timelineBuckets) {
      count += bucket.count;
    }
    return count;
  }

  /**
  The time buckets of `options` at `grouping`, merged with those of its `timelineAlbumId` overlay. Local Omarchy
  layer: `main`, when given, stands in for the server's own buckets (a person's photos found by search, PersonPhotos).
  */
  async fetch(
    options: TimelineManagerOptions,
    grouping: TimelineGrouping,
    signal: AbortSignal,
    main?: Promise<TimeBucketsResponseDto[]>,
  ) {
    const bucketSize = getTimeBucketSizeForGrouping(grouping);
    const albumQueryOptions = getTimelineAlbumQueryOptions(options, bucketSize);
    const [timebuckets, albumTimebuckets] = await Promise.all([
      main ?? getTimeBuckets({ ...authManager.params, ...toTimeBucketsRequest(options, bucketSize) }, { signal }),
      albumQueryOptions
        ? getTimeBuckets({ ...authManager.params, ...albumQueryOptions }, { signal })
        : Promise.resolve([]),
    ]);
    return albumTimebuckets.length > 0 ? mergeTimeBuckets(timebuckets, albumTimebuckets, options.order) : timebuckets;
  }

  /**
  Shows `timeBuckets` as the bucket list and returns what the manager builds its months from: the day buckets
  summed per month in day grouping, none otherwise. `people` is the person page the covers come from (Local Omarchy
  layer).
  */
  apply(
    options: TimelineManagerOptions,
    grouping: TimelineGrouping,
    timeBuckets: TimeBucketsResponseDto[],
    people: TimelineBucketPeople = {},
  ) {
    this.#generation++;
    this.#options = options;
    this.#people = people;
    this.#coverRequested.clear();
    this.#host.timelineBuckets = timeBuckets.map((timeBucket) => new TimelineBucket(this.#host, grouping, timeBucket));
    this.layout();
    return grouping === 'day' ? aggregateDayBucketsByMonth(timeBuckets, options.order) : [];
  }

  /** Drops the buckets; a cover response still in flight is discarded. */
  clear() {
    this.#generation++;
    this.#people = {};
    this.#host.timelineBuckets = [];
    this.#host.periodGrid = undefined;
  }

  // Local Omarchy layer: the Years and Months overviews on the desktop's gap, in the timeline's order, a short archive
  // fitted to the room under the top section (utils/period-grid)
  layout() {
    this.#host.periodGrid = layoutTimelineBuckets(this.#host.timelineBuckets, this.#host.viewportWidth, {
      gap: workspaceGap(),
      newestFirst: this.#options.order !== AssetOrder.Asc,
      viewportHeight: this.#host.viewportHeight - this.#host.topSectionHeight,
    });
  }

  async loadCovers(timeBuckets: string[]) {
    const grouping = this.#host.grouping;
    if (grouping === 'day') {
      return;
    }
    const { photos, stacks: index } = this.#people;
    if (photos) {
      const covers = photos.covers(timeBuckets, grouping, index);
      for (const cover of covers) {
        this.#host.timelineBuckets.find((bucket) => bucket.timeBucket === cover.timeBucket)?.setRepresentative(cover);
      }
      return;
    }
    const todo = timeBuckets.filter((tb) => !this.#coverRequested.has(tb));
    if (todo.length === 0) {
      return;
    }
    for (const tb of todo) {
      this.#coverRequested.add(tb);
    }

    const generation = this.#generation;
    const bucketSize = getTimeBucketSizeForGrouping(grouping);
    const requestOptions = toTimeBucketsRequest(this.#options, bucketSize);
    const albumOptions = getTimelineAlbumQueryOptions(this.#options, bucketSize);
    let mainCovers: TimeBucketCoverResponseDto[];
    let albumCovers: TimeBucketCoverResponseDto[];
    const options = this.#options;
    try {
      // Requests are not aborted on re-init by design — the stale-generation guard below prevents stale
      // application, and cover fetches are light GETs bounded to the currently visible bucket set.
      const serverCovers = () => getTimeBucketCovers({ ...authManager.params, ...requestOptions, timeBuckets: todo });
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a lookup for this request only
      const counts = new Map(this.#host.timelineBuckets.map((bucket) => [bucket.timeBucket, bucket.count]));
      [mainCovers, albumCovers] = await Promise.all([
        // Local Omarchy layer: each period's face by the folder rule, chosen before its tile shows and kept for the
        // page load, the server's cover where nothing qualifies (managers/period-faces); a person's folded stacks
        // keep the server's covers, which the fix below rereads
        index
          ? serverCovers()
          : periodFaces.covers(
              { ...authManager.params, ...requestOptions },
              todo.map((timeBucket) => ({ timeBucket, count: counts.get(timeBucket) ?? 0 })),
              serverCovers,
            ),
        albumOptions
          ? getTimeBucketCovers({ ...authManager.params, ...albumOptions, timeBuckets: todo })
          : Promise.resolve([]),
      ]);
      if (index) {
        // A period's usual cover can be folded under a representative in a different period.
        // Pick a visible photo from that exact period instead; never bring a hidden member back.
        mainCovers = await Promise.all(
          mainCovers.map(async (cover) => {
            if (!cover.representativeAssetId || !index.isHidden(cover.representativeAssetId)) {
              return cover;
            }
            const assets = await getTimeBucket({
              ...authManager.params,
              ...toTimeBucketRequest(options, cover.timeBucket, bucketSize),
            });
            const position = assets.id.findIndex((id) => !index.isHidden(id));
            return {
              timeBucket: cover.timeBucket,
              representativeAssetId: assets.id[position] ?? null,
              representativeRatio: assets.ratio[position] ?? null,
              representativeThumbhash: assets.thumbhash[position] ?? null,
            };
          }),
        );
      }
    } catch {
      for (const tb of todo) {
        this.#coverRequested.delete(tb);
      }
      return;
    }
    if (generation !== this.#generation) {
      return;
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const byBucket = new Map(mainCovers.map((c) => [c.timeBucket, c]));
    // Album covers take precedence over main covers when an album overlay is active
    for (const cover of albumCovers) {
      byBucket.set(cover.timeBucket, cover);
    }
    for (const bucket of this.#host.timelineBuckets) {
      const cover = byBucket.get(bucket.timeBucket);
      if (cover) {
        bucket.setRepresentative(cover);
      }
    }
  }
}
