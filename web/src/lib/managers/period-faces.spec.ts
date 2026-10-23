import {
  AssetOrder,
  AssetTypeEnum,
  AssetVisibility,
  getAssetInfo,
  getAssetOcr,
  getTimeBucket,
  getTimeBucketCovers,
  searchAssets,
  TimeBucketSize,
  type AssetResponseDto,
  type SearchResponseDto,
  type TimeBucketCoverResponseDto,
} from '@immich/sdk';
import { PeriodFaceManager, type PeriodScope } from '$lib/managers/period-faces';
import { BRIGHT } from '@test-data/thumbhash';

// Local Omarchy layer: the Years and Months overviews' faces are asked of Gallery with the timeline's own filters and
// kept for the page load (managers/period-faces)
vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  getAssetInfo: vi.fn(),
  getAssetOcr: vi.fn(),
  getTimeBucket: vi.fn(),
  getTimeBucketCovers: vi.fn(),
  searchAssets: vi.fn(),
}));

type CoversArgs = Parameters<typeof getTimeBucketCovers>[0];
const scope: PeriodScope = {
  userId: 'me',
  visibility: AssetVisibility.Timeline,
  withStacked: true,
  withPartners: true,
  withSharedSpaces: true,
  bucketSize: TimeBucketSize.Year,
};
const cover = (timeBucket: string, id: string): TimeBucketCoverResponseDto => ({
  timeBucket,
  representativeAssetId: id,
  representativeThumbhash: BRIGHT,
  representativeRatio: 1.5,
});
const asset = (id: string, camera: boolean) =>
  ({
    id,
    type: AssetTypeEnum.Image,
    visibility: AssetVisibility.Timeline,
    isFavorite: false,
    originalMimeType: camera ? 'image/heic' : 'image/png',
    width: 4032,
    height: 3024,
  }) as unknown as AssetResponseDto;
const found = (...items: AssetResponseDto[]) => ({ assets: { items } }) as unknown as SearchResponseDto;
const server = () => Promise.resolve([cover('2025-01-01', 'newest')]);
const years = [{ timeBucket: '2025-01-01', count: 1100 }];
const searchedIds = (call: unknown[]) => {
  const { metadataSearchDto } = call[0] as { metadataSearchDto: { filter: { or: { id: { eq: string } }[] } } };
  return metadataSearchDto.filter.or.map(({ id }) => id.eq);
};

describe('PeriodFaceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // the year's newest favourite photo is a camera's; its newest photo is the server's cover, a screenshot
    vi.mocked(getTimeBucketCovers).mockImplementation((args: CoversArgs) =>
      Promise.resolve(
        args.isFavorite ? [cover('2025-01-01', 'kept')] : args.$type ? [cover('2025-01-01', 'newest')] : [],
      ),
    );
    vi.mocked(searchAssets).mockImplementation(({ metadataSearchDto }) => {
      const ids = (metadataSearchDto.filter?.or ?? []).map(({ id }) => id?.eq ?? '');
      const camera = metadataSearchDto.filter?.make !== undefined;
      return Promise.resolve(found(...ids.filter((id) => (id === 'kept') === camera).map((id) => asset(id, camera))));
    });
    vi.mocked(getAssetOcr).mockResolvedValue([]);
  });

  it('fronts a period with its face by the folder rule, from covers asked with the timeline’s own filters', async () => {
    const faces = new PeriodFaceManager();

    const covers = await faces.covers(scope, years, server);

    expect(covers).toEqual([cover('2025-01-01', 'kept')]);
    expect(getTimeBucketCovers).toHaveBeenCalledWith(
      {
        ...scope,
        isFavorite: true,
        $type: AssetTypeEnum.Image,
        order: AssetOrder.Desc,
        timeBuckets: ['2025-01-01'],
      },
      { signal: expect.any(AbortSignal) },
    );
    // a camera's data is asked for in one search for the period's candidates
    expect(searchAssets).toHaveBeenCalledWith(
      {
        metadataSearchDto: {
          withSharedSpaces: true,
          filter: { or: [{ id: { eq: 'kept' } }], make: { ne: null } },
          size: 1,
        },
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('keeps the face a period has shown for the page load, asking nothing again', async () => {
    const faces = new PeriodFaceManager();
    await faces.covers(scope, years, server);
    vi.clearAllMocks();
    vi.mocked(getTimeBucketCovers).mockResolvedValue([cover('2025-01-01', 'another')]);

    expect(await faces.covers(scope, years, server)).toEqual([cover('2025-01-01', 'kept')]);
    expect(getTimeBucketCovers).not.toHaveBeenCalled();
    expect(searchAssets).not.toHaveBeenCalled();
  });

  it("keeps the server's covers for the Trash, the Archive and a shared link", async () => {
    for (const other of [
      { ...scope, isTrashed: true },
      { ...scope, visibility: AssetVisibility.Archive },
      { ...scope, key: 'shared-link-key' },
    ]) {
      const faces = new PeriodFaceManager();

      expect(await faces.covers(other, years, server)).toEqual([cover('2025-01-01', 'newest')]);
    }
    expect(getTimeBucketCovers).not.toHaveBeenCalled();
  });

  it("shows the server's cover where the choice takes too long, and keeps it", async () => {
    vi.useFakeTimers();
    try {
      let answer!: (covers: TimeBucketCoverResponseDto[]) => void;
      vi.mocked(getTimeBucketCovers).mockImplementation(() => new Promise((resolve) => (answer = resolve)));
      const faces = new PeriodFaceManager();

      const covers = faces.covers(scope, years, server);
      await vi.advanceTimersByTimeAsync(4000);

      expect(await covers).toEqual([cover('2025-01-01', 'newest')]);
      answer([cover('2025-01-01', 'kept')]);
      await vi.advanceTimersByTimeAsync(10);
      expect(await faces.covers(scope, years, server)).toEqual([cover('2025-01-01', 'newest')]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells a picture's kind by a search for a camera's data, then one for the rest, then its details", async () => {
    vi.mocked(getTimeBucketCovers).mockImplementation((args: CoversArgs) =>
      Promise.resolve(args.isFavorite ? [] : args.$type ? [cover('2025-01-01', 'elsewhere')] : []),
    );
    vi.mocked(searchAssets).mockResolvedValue(found());
    vi.mocked(getAssetInfo).mockResolvedValue({ ...asset('elsewhere', true), exifInfo: { make: 'Canon' } });
    const faces = new PeriodFaceManager();

    expect(await faces.covers(scope, years, server)).toEqual([cover('2025-01-01', 'elsewhere')]);
    expect(vi.mocked(searchAssets).mock.calls.map((call) => searchedIds(call))).toEqual([['elsewhere'], ['elsewhere']]);
    expect(getAssetInfo).toHaveBeenCalledWith(
      { id: 'elsewhere', spaceId: undefined },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("reads a small period's list where neither end qualifies, newest first", async () => {
    vi.mocked(getTimeBucketCovers).mockImplementation((args: CoversArgs) =>
      Promise.resolve(args.$type === AssetTypeEnum.Image && !args.isFavorite ? [cover('2025-01-01', 'screen')] : []),
    );
    vi.mocked(searchAssets).mockImplementation(({ metadataSearchDto }) => {
      const ids = (metadataSearchDto.filter?.or ?? []).map(({ id }) => id?.eq ?? '');
      const camera = metadataSearchDto.filter?.make !== undefined;
      return Promise.resolve(found(...ids.filter((id) => (id === 'middle') === camera).map((id) => asset(id, camera))));
    });
    vi.mocked(getTimeBucket).mockResolvedValue({
      id: ['screen', 'middle'],
      thumbhash: [BRIGHT, BRIGHT],
      ratio: [0.46, 1.33],
      isFavorite: [false, false],
      isImage: [true, true],
      livePhotoVideoId: [null, null],
    } as unknown as Awaited<ReturnType<typeof getTimeBucket>>);
    const faces = new PeriodFaceManager();

    const covers = await faces.covers(scope, [{ timeBucket: '2025-01-01', count: 40 }], server);

    expect(covers[0].representativeAssetId).toBe('middle');
    expect(getTimeBucket).toHaveBeenCalledWith(
      { ...scope, $type: AssetTypeEnum.Image, timeBucket: '2025-01-01' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("gives the server's covers when nothing is chosen, and fails only when they fail too", async () => {
    vi.mocked(getTimeBucketCovers).mockResolvedValue([]);
    const faces = new PeriodFaceManager();

    await expect(faces.covers(scope, years, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(await faces.covers(scope, years, server)).toEqual([cover('2025-01-01', 'newest')]);
  });
});
