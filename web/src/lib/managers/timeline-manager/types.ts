import type { AssetStackResponseDto, AssetVisibility } from '@immich/sdk';
import type { TimelineDate, TimelineDateTime, TimelineYearMonth } from '$lib/utils/timeline-util';

export type ViewportTopMonth = TimelineYearMonth | undefined | 'lead-in' | 'lead-out';

export type AssetApiGetTimeBucketsRequest = Parameters<typeof import('@immich/sdk').getTimeBuckets>[0];
export type AssetApiGetTimeBucketRequest = Parameters<typeof import('@immich/sdk').getTimeBucket>[0];

export type TimelineGrouping = 'year' | 'month' | 'day';
export const DEFAULT_TIMELINE_GROUPING: TimelineGrouping = 'day';
export type TimelineTemporalAnchor = { year: number; month?: number };

export type TimelineManagerOptions = Omit<AssetApiGetTimeBucketsRequest, 'bucketSize' | 'size'> & {
  grouping?: TimelineGrouping;
  timelineAlbumId?: string;
  timelineSpaceId?: string;
  deferInit?: boolean;
  assetFilter?: Set<string>;
};

export type TimelineBucketDate = { year: number; month?: number; day?: number };

export type AssetDescriptor = { id: string };

export type Direction = 'earlier' | 'later';

export type TimelineAsset = {
  id: string;
  ownerId: string;
  tags?: string[];
  ratio: number;
  thumbhash: string | null;
  localDateTime: TimelineDateTime;
  createdAt: TimelineDateTime;
  fileCreatedAt: TimelineDateTime;
  visibility: AssetVisibility;
  isFavorite: boolean;
  isTrashed: boolean;
  isVideo: boolean;
  isImage: boolean;
  stack: AssetStackResponseDto | null;
  duration: number | null;
  projectionType: string | null;
  livePhotoVideoId: string | null;
  city: string | null;
  country: string | null;
  people: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type MoveAsset = { asset: TimelineAsset; date: TimelineDate };

export interface Viewport {
  width: number;
  height: number;
}

export interface AddAsset {
  type: 'add';
  values: TimelineAsset[];
}

export interface UpdateAsset {
  type: 'update';
  values: TimelineAsset[];
}

export interface DeleteAsset {
  type: 'delete';
  values: string[];
}

export interface TrashAssets {
  type: 'trash';
  values: string[];
}

export type PendingChange = AddAsset | UpdateAsset | DeleteAsset | TrashAssets;

export type ScrubberMonth = {
  height: number;
  assetCount: number;
  year: number;
  month: number;
  title: string;
};

export interface UpdateGeometryOptions {
  invalidateHeight: boolean;
  noDefer?: boolean;
}

/**
 * Local Omarchy layer: where a month starts in the grid, worked out once per layout (internal/layout-support), for its
 * month mark and the hairline in the gap before it (components/timeline/Month.svelte). Only on the plain grid, where no
 * day labels date the days already.
 */
export type MonthStart = {
  /** the month's first photo in grid order, which carries the mark */
  assetId: string;
  /** the month's first day on its row: where it begins along the row, the row's top in the month's box, its height */
  start: number;
  top: number;
  height: number;
  /** the gap between two days on a row, and between two rows */
  gap: number;
  rowGap: number;
};
