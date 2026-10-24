import {
  AssetTypeEnum,
  AssetVisibility,
  getAllAlbums,
  getTimeBuckets,
  MemorySearchOrder,
  MemoryType,
  searchAssets,
  searchMemories,
  searchRandom,
  type AlbumResponseDto,
  type AssetResponseDto,
  type MemoryResponseDto,
  type SearchResponseDto,
} from '@immich/sdk';
import { DateTime } from 'luxon';
import { userPreferencesManager } from '$lib/managers/user-preferences-manager.svelte';
import { memoriesPageSearch } from '$lib/utils/memory-cards';
import { YEAR_FILM } from './room-reels';
import { loadAlbumAssets, loadToday, loadYear } from './room-source';

vi.mock('@immich/sdk', async (original) => ({
  ...(await original<typeof import('@immich/sdk')>()),
  getAllAlbums: vi.fn(),
  getTimeBuckets: vi.fn(),
  searchAssets: vi.fn(),
  searchMemories: vi.fn(),
  searchRandom: vi.fn(),
}));

const asset = (id: string, day: string, type = AssetTypeEnum.Image) =>
  ({ id, localDateTime: `${day}T10:00:00.000Z`, type }) as AssetResponseDto;

const page = (items: AssetResponseDto[], nextPage: string | null = null) =>
  ({
    assets: { items, nextPage, count: items.length, total: items.length, facets: [] },
  }) as unknown as SearchResponseDto;

describe(loadToday.name, () => {
  const today = DateTime.fromISO('2026-10-18T09:00:00');

  /** an on-this-day memory shown on `day` alone, of the photos given */
  const onThisDay = (id: string, day: string, assets: AssetResponseDto[]) =>
    ({
      id,
      type: MemoryType.OnThisDay,
      showAt: `${day}T00:00:00.000Z`,
      hideAt: `${day}T23:59:59.999Z`,
      assets,
    }) as MemoryResponseDto;

  afterEach(() => {
    userPreferencesManager.memories = { showUpcoming: false, onlyFavorites: false };
  });

  it('asks what the Memories page asks, and plays its Today cards and the living albums after them', async () => {
    vi.mocked(searchMemories).mockResolvedValue([
      { id: 'm1', type: 'on_this_day', assets: [asset('a', '2025-10-18')] } as unknown as MemoryResponseDto,
    ]);
    vi.mocked(getAllAlbums).mockResolvedValue([
      { id: 'tv', albumName: 'On the TV', assetCount: 4 },
      { id: 'bali', albumName: 'Bali', assetCount: 40 },
    ] as AlbumResponseDto[]);

    const reels = await loadToday({ memories: true, today });

    // every memory the server keeps, not a day's: a Today card holds the earlier days' that read the same
    expect(searchMemories).toHaveBeenCalledWith({ order: MemorySearchOrder.Desc, isUpcoming: false });
    expect(reels.map(({ key }) => key)).toEqual(['memory:m1', 'album:tv']);
  });

  // 2026-10-24, the owner's "always play everything": the Memories page's settings are the page's own
  it("plays every memory whatever this browser's Memories settings say, where the Memories page keeps to them", async () => {
    vi.mocked(getAllAlbums).mockResolvedValue([]);
    vi.mocked(searchMemories).mockResolvedValue([
      { ...onThisDay('kept', '2026-10-18', [asset('k', '2025-10-18')]), isSaved: true },
      { ...onThisDay('not-kept', '2026-10-18', [asset('n', '2013-10-18')]), isSaved: false },
    ]);

    for (const settings of [
      { showUpcoming: false, onlyFavorites: false },
      { showUpcoming: true, onlyFavorites: false },
      { showUpcoming: false, onlyFavorites: true },
      { showUpcoming: true, onlyFavorites: true },
    ]) {
      userPreferencesManager.memories = settings;
      vi.mocked(searchMemories).mockClear();

      const reels = await loadToday({ memories: true, today });

      // every memory that has come due, kept or not (an upcoming one never joins a Today card)
      expect(searchMemories).toHaveBeenCalledExactlyOnceWith({ order: MemorySearchOrder.Desc, isUpcoming: false });
      expect(reels.map(({ key }) => key)).toEqual(['memory:kept', 'memory:not-kept']);
    }

    // the Memories page, with the same settings, asks for the kept ones alone and the upcoming ones too
    expect(memoriesPageSearch(userPreferencesManager.memories)).toEqual({
      order: MemorySearchOrder.Desc,
      isSaved: true,
      isUpcoming: undefined,
    });
  });

  it("plays a Today card whole: today's memory with the earlier days' that read the same, under the lead", async () => {
    // two days' on this day of one month (titled alike by their photos, "October 2025"), and a day of another year
    vi.mocked(searchMemories).mockResolvedValue([
      onThisDay('today', '2026-10-18', [asset('c', '2025-10-18'), asset('b', '2025-10-17')]),
      onThisDay('yesterday', '2026-10-17', [asset('a', '2025-10-16'), asset('b', '2025-10-17')]),
      onThisDay('older', '2026-10-16', [asset('z', '2013-10-16')]),
    ]);
    vi.mocked(getAllAlbums).mockResolvedValue([]);

    const reels = await loadToday({ memories: true, today });

    // the earlier day's card of its own stays on the Memories page's Earlier
    expect(reels.map(({ key }) => key)).toEqual(['memory:today']);
    const [reel] = reels;
    if (reel.kind !== 'memory') {
      throw new Error('a memory film');
    }
    expect(reel.card?.members.map(({ id }) => id)).toEqual(['today', 'yesterday']);
    expect(reel.memory.assets.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('asks for no memories for someone who keeps them off', async () => {
    vi.mocked(searchMemories).mockClear();
    vi.mocked(getAllAlbums).mockResolvedValue([]);

    expect(await loadToday({ memories: false, today })).toEqual([]);
    expect(searchMemories).not.toHaveBeenCalled();
  });

  it('plays what answered, and fails only when nothing did', async () => {
    vi.mocked(searchMemories).mockRejectedValue(new Error('down'));
    vi.mocked(getAllAlbums).mockResolvedValue([
      { id: 'b', albumName: 'Best of 2020', assetCount: 3 },
    ] as AlbumResponseDto[]);
    const reels = await loadToday({ memories: true, today });
    expect(reels.map(({ key }) => key)).toEqual(['album:b']);

    vi.mocked(getAllAlbums).mockRejectedValue(new Error('down'));
    await expect(loadToday({ memories: true, today })).rejects.toThrow('down');
  });
});

describe(loadAlbumAssets.name, () => {
  it("reads every page of the album's timeline photos, in the order they were taken", async () => {
    vi.mocked(searchAssets)
      .mockResolvedValueOnce(page([asset('b', '2020-02-01'), asset('a', '2020-01-01')], '2'))
      .mockResolvedValueOnce(page([asset('c', '2020-03-01')]));

    const assets = await loadAlbumAssets('album-1');

    expect(assets.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(searchAssets).toHaveBeenNthCalledWith(1, {
      metadataSearchDto: expect.objectContaining({
        albumIds: ['album-1'],
        visibility: AssetVisibility.Timeline,
        page: 1,
      }),
    });
    expect(searchAssets).toHaveBeenNthCalledWith(2, {
      metadataSearchDto: expect.objectContaining({ page: 2 }),
    });
  });
});

describe(loadYear.name, () => {
  beforeEach(() => {
    vi.mocked(searchAssets).mockReset();
    vi.mocked(searchRandom).mockReset();
    vi.mocked(getTimeBuckets).mockResolvedValue([
      { timeBucket: '2020-12-01', count: 50 },
      { timeBucket: '2019-12-01', count: 300 },
      { timeBucket: '2019-07-01', count: 2000 },
      { timeBucket: '2019-01-01', count: 10 },
    ]);
  });

  it("plays a year's favourites spread through its months, counting the year's photos", async () => {
    const favorites = Array.from({ length: 60 }, (_, index) =>
      asset(`fav-${index}`, index < 50 ? '2019-07-14' : '2019-12-24'),
    );
    vi.mocked(searchAssets).mockResolvedValue(page(favorites));

    const year = await loadYear(2019, 'me');

    expect(year).toMatchObject({ favorites: 60, total: 2310, sample: false });
    expect(year.assets).toHaveLength(YEAR_FILM.most);
    // both months are in it
    expect(year.assets.some(({ localDateTime }) => localDateTime.startsWith('2019-12'))).toBe(true);
    expect(searchAssets).toHaveBeenCalledWith({
      metadataSearchDto: expect.objectContaining({
        isFavorite: true,
        takenAfter: '2019-01-01T00:00:00.000Z',
        takenBefore: '2020-01-01T00:00:00.000Z',
        visibility: AssetVisibility.Timeline,
      }),
    });
    expect(searchRandom).not.toHaveBeenCalled();
  });

  it('plays a sample of the year spread by month when it has few favourites, the favourites in it', async () => {
    vi.mocked(searchAssets).mockResolvedValue(page([asset('fav', '2019-07-14')]));
    vi.mocked(searchRandom).mockImplementation(({ randomSearchDto }) => {
      const month = randomSearchDto.takenAfter!.slice(0, 7);
      return Promise.resolve(
        Array.from({ length: randomSearchDto.size! }, (_, index) =>
          asset(index === 0 && month === '2019-07' ? 'fav' : `${month}-${index}`, `${month}-0${(index % 9) + 1}`),
        ),
      );
    });

    const year = await loadYear(2019, 'me');

    expect(year).toMatchObject({ favorites: 1, total: 2310, sample: true });
    expect(year.assets).toHaveLength(YEAR_FILM.most);
    expect(year.assets.filter(({ id }) => id === 'fav')).toHaveLength(1);
    // every month with photos gave some, and only photos were asked for
    expect(new Set(year.assets.map(({ localDateTime }) => localDateTime.slice(0, 7)))).toEqual(
      new Set(['2019-01', '2019-07', '2019-12']),
    );
    expect(searchRandom).toHaveBeenCalledWith({
      randomSearchDto: expect.objectContaining({
        takenAfter: '2019-12-01T00:00:00.000Z',
        takenBefore: '2020-01-01T00:00:00.000Z',
        type: AssetTypeEnum.Image,
        visibility: AssetVisibility.Timeline,
      }),
    });
  });

  it('is empty for a year without photos', async () => {
    vi.mocked(searchAssets).mockResolvedValue(page([]));

    expect(await loadYear(1990, 'me')).toEqual({ assets: [], favorites: 0, total: 0, sample: true });
    expect(searchRandom).not.toHaveBeenCalled();
  });
});
