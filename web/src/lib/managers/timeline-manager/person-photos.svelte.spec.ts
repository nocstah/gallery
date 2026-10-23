import { AssetVisibility, TimeBucketSize, type AssetResponseDto, type SearchResponseDto } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { curator } from '$lib/utils/curator';
import { assetFactory } from '@test-data/factories/asset-factory';
import { toTimeBucketsRequest } from './internal/request-options';
import { PersonPhotos } from './person-photos';
import { TimelineManager } from './timeline-manager.svelte';

const photo = (id: string, localDateTime: string, fileCreatedAt = localDateTime) =>
  assetFactory.build({
    id,
    localDateTime,
    fileCreatedAt,
    visibility: AssetVisibility.Timeline,
    isTrashed: false,
    stack: null,
    width: 1200,
    height: 800,
  });
const first = photo('july-7', '2007-07-07T09:35:39.000Z', '2007-07-07T02:35:39.000Z');
const second = photo('july-6', '2007-07-06T00:14:03.000Z', '2007-07-05T17:14:03.000Z');
const third = photo('july-5', '2007-07-05T23:44:57.000Z', '2007-07-05T16:44:57.000Z');
const response = (items: AssetResponseDto[], nextPage: string | null = null): SearchResponseDto => ({
  assets: { items, nextPage, total: items.length, count: items.length, facets: [] },
  albums: { items: [], total: 0, count: 0, facets: [] },
});
const options = {
  personIds: ['person'],
  visibility: AssetVisibility.Timeline,
  withSharedSpaces: true,
  personPhotoSearch: true,
};

describe('face page photo source', () => {
  let manager: TimelineManager;
  beforeEach(() => {
    vi.resetAllMocks();
    sdkMock.getTimeBuckets.mockResolvedValue([]);
    sdkMock.searchAssets.mockResolvedValue(response([first, second, third]));
    vi.spyOn(curator, 'personStacks').mockResolvedValue([]);
    manager = new TimelineManager();
  });
  afterEach(() => manager.destroy());

  it('shows all three matches when the home-timeline query would be empty', async () => {
    await manager.updateOptions(options);
    const photos = [];
    for await (const asset of manager.assetsIterator()) {
      photos.push(asset);
    }
    expect(photos.map((asset) => asset.id)).toEqual(['july-7', 'july-6', 'july-5']);
    expect(photos[1].localDateTime).toMatchObject({ year: 2007, month: 7, day: 6, hour: 0 });
    expect(manager.assetCount).toBe(3);
    expect(manager.ungroupedAssetCount).toBe(3);
    expect(sdkMock.getTimeBuckets).not.toHaveBeenCalled();
    expect(sdkMock.getTimeBucket).not.toHaveBeenCalled();
    expect(sdkMock.searchAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataSearchDto: expect.objectContaining({
          personIds: ['person'],
          visibility: AssetVisibility.Timeline,
          withDeleted: false,
          isOffline: false,
          withStacked: true,
          withSharedSpaces: true,
        }),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each(['year', 'month'] as const)('uses the same matches for %s counts and covers', async (grouping) => {
    await manager.updateOptions({ ...options, grouping });
    const buckets = manager.timelineBuckets;
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(3);
    await manager.loadCoversForBuckets(buckets.map((bucket) => bucket.timeBucket));
    expect(buckets[0].representativeAssetId).toBe('july-7');
    expect(sdkMock.getTimeBucketCovers).not.toHaveBeenCalled();
  });

  it('folds duplicate matches while retaining the full photo count and a matching cover', async () => {
    vi.mocked(curator.personStacks).mockResolvedValue([
      {
        id: 'stack',
        primaryAssetId: 'not-this-person',
        representativeId: first.id,
        members: [first, second].map(({ id, localDateTime }) => ({ id, localDateTime })),
      },
    ]);
    await manager.updateOptions({ ...options, groupPersonStacks: true });
    const ids = [];
    for await (const asset of manager.assetsIterator()) {
      ids.push(asset.id);
    }
    expect(ids).toEqual(['july-7', 'july-5']);
    expect(manager.assetCount).toBe(2);
    expect(manager.ungroupedAssetCount).toBe(3);
    expect(manager.personStackMembers('stack')).toEqual(new Set(['july-7', 'july-6']));
  });

  it('pages to completion and deduplicates overlapping search pages', async () => {
    sdkMock.searchAssets
      .mockResolvedValueOnce(response([first, second], '2'))
      .mockResolvedValueOnce(response([second, third]));
    const source = await PersonPhotos.load('person', new AbortController().signal);
    expect(source.bucket('2007-07-01', TimeBucketSize.Month).id).toEqual(['july-7', 'july-6', 'july-5']);
    expect(sdkMock.searchAssets.mock.calls.map(([request]) => request.metadataSearchDto.page)).toEqual([1, 2]);
  });

  it('rejects failed or looping pagination instead of presenting a partial count', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(response([first], '2')).mockRejectedValueOnce(new Error('offline'));
    await expect(PersonPhotos.load('person', new AbortController().signal)).rejects.toThrow('offline');
    sdkMock.searchAssets.mockResolvedValueOnce(response([first], '1'));
    await expect(PersonPhotos.load('person', new AbortController().signal)).rejects.toThrow('Invalid next page');
  });

  it('does not apply a search response after cancellation', async () => {
    const controller = new AbortController();
    sdkMock.searchAssets.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(response([first]));
    });
    await expect(PersonPhotos.load('person', controller.signal)).rejects.toThrow();
  });

  it('keeps the default timeline on its existing API and excludes the local option from requests', async () => {
    await manager.updateOptions({ visibility: AssetVisibility.Timeline });
    expect(sdkMock.getTimeBuckets).toHaveBeenCalledOnce();
    expect(sdkMock.searchAssets).not.toHaveBeenCalled();
    expect(toTimeBucketsRequest(options, TimeBucketSize.Day)).not.toHaveProperty('personPhotoSearch');
  });
});
