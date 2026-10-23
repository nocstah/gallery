import {
  AssetOrder,
  AssetVisibility,
  searchAssets,
  TimeBucketSize,
  type AssetResponseDto,
  type TimeBucketAssetResponseDto,
  type TimeBucketsResponseDto,
} from '@immich/sdk';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { toTimelineAsset } from '$lib/utils/timeline-util';
import type { PersonStackIndex } from './person-stacks';
import type { TimelineGrouping } from './types';

const prefixLength = (grouping: TimelineGrouping) => (grouping === 'year' ? 4 : grouping === 'month' ? 7 : 10);
const bucketName = (date: string, grouping: TimelineGrouping) =>
  grouping === 'year'
    ? `${date.slice(0, 4)}-01-01`
    : grouping === 'month'
      ? `${date.slice(0, 7)}-01`
      : date.slice(0, 10);

/**
 * A face page is a photo search, not the home timeline. The timeline API subtracts albums hidden
 * from Photos; search keeps those matches, as the People list's counts do. Gallery still applies
 * the signed-in viewer's access, identity, visibility and shared-space rules.
 */
export class PersonPhotos {
  constructor(private readonly photos: AssetResponseDto[]) {}

  static async load(personId: string, signal: AbortSignal): Promise<PersonPhotos> {
    const photos = new Map<string, AssetResponseDto>();
    let page = 1;
    while (true) {
      signal.throwIfAborted();
      const result = await searchAssets(
        {
          ...authManager.params,
          metadataSearchDto: {
            personIds: [personId],
            visibility: AssetVisibility.Timeline,
            withSharedSpaces: true,
            withDeleted: false,
            isOffline: false,
            withStacked: true,
            withExif: true,
            withPeople: false,
            size: 1000,
            page,
            order: AssetOrder.Desc,
          },
        },
        { signal },
      );
      signal.throwIfAborted();
      for (const photo of result.assets.items) {
        photos.set(photo.id, photo);
      }
      if (!result.assets.nextPage) {
        break;
      }
      const nextPage = Number(result.assets.nextPage);
      if (!Number.isSafeInteger(nextPage) || nextPage <= page) {
        throw new Error('Invalid next page in person photo search');
      }
      page = nextPage;
    }
    return new PersonPhotos(
      [...photos.values()].sort(
        (a, b) =>
          b.localDateTime.localeCompare(a.localDateTime) ||
          b.fileCreatedAt.localeCompare(a.fileCreatedAt) ||
          a.id.localeCompare(b.id),
      ),
    );
  }

  buckets(grouping: TimelineGrouping): TimeBucketsResponseDto[] {
    const counts = new Map<string, number>();
    for (const photo of this.photos) {
      const key = bucketName(photo.localDateTime, grouping);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].map(([timeBucket, count]) => ({ timeBucket, count }));
  }

  private inBucket(timeBucket: string, grouping: TimelineGrouping) {
    const prefix = timeBucket.slice(0, prefixLength(grouping));
    return this.photos.filter((photo) => photo.localDateTime.startsWith(prefix));
  }

  covers(timeBuckets: string[], grouping: TimelineGrouping, stacks?: PersonStackIndex) {
    return timeBuckets.map((timeBucket) => {
      const photo = this.inBucket(timeBucket, grouping).find((photo) => !stacks?.isHidden(photo.id));
      return {
        timeBucket,
        representativeAssetId: photo?.id ?? null,
        representativeThumbhash: photo?.thumbhash ?? null,
        representativeRatio: photo ? toTimelineAsset(photo).ratio : null,
      };
    });
  }

  bucket(timeBucket: string, size: TimeBucketSize): TimeBucketAssetResponseDto {
    const photos = this.inBucket(timeBucket, size);
    return {
      id: photos.map((photo) => photo.id),
      ownerId: photos.map((photo) => photo.ownerId),
      createdAt: photos.map((photo) => photo.createdAt),
      fileCreatedAt: photos.map((photo) => photo.fileCreatedAt),
      localOffsetHours: photos.map(
        (photo) => (Date.parse(photo.localDateTime) - Date.parse(photo.fileCreatedAt)) / 3_600_000,
      ),
      duration: photos.map((photo) => photo.duration),
      isFavorite: photos.map((photo) => photo.isFavorite),
      isImage: photos.map((photo) => photo.type === 'IMAGE'),
      isTrashed: photos.map((photo) => photo.isTrashed),
      visibility: photos.map((photo) => photo.visibility),
      livePhotoVideoId: photos.map((photo) => photo.livePhotoVideoId ?? null),
      projectionType: photos.map((photo) => photo.exifInfo?.projectionType ?? null),
      ratio: photos.map((photo) => toTimelineAsset(photo).ratio),
      thumbhash: photos.map((photo) => photo.thumbhash),
      city: photos.map((photo) => photo.exifInfo?.city ?? null),
      country: photos.map((photo) => photo.exifInfo?.country ?? null),
      latitude: photos.map((photo) => photo.exifInfo?.latitude ?? null),
      longitude: photos.map((photo) => photo.exifInfo?.longitude ?? null),
      // The person-specific stack index decorates matching members after loading.
      stack: photos.map(() => null),
    };
  }
}
