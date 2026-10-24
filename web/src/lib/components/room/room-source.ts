import {
  AssetOrder,
  AssetTypeEnum,
  AssetVisibility,
  getAllAlbums,
  getTimeBuckets,
  searchAssets,
  searchMemories,
  searchRandom,
  type AssetResponseDto,
  type MetadataSearchDto,
} from '@immich/sdk';
import type { DateTime } from 'luxon';
import { memoryFacts } from '$lib/managers/memory-facts.svelte';
import { cardsByFacts, roomMemoriesSearch, wallClockAsUtc } from '$lib/utils/memory-cards';
import {
  inTimeOrder,
  monthOf,
  shareOut,
  spreadByMonth,
  todayReels,
  YEAR_FILM,
  type RoomReel,
  type YearFilm,
} from './room-reels';

// Local Omarchy layer: what Room asks Gallery for (DESIGN.md, Room). Only what Photos shows plays across the room:
// every search names the timeline's visibility, so archived photos (To do, Villa, QR's bank slips), hidden ones and
// the Locked Folder stay out even while the session is unlocked, when a search left open would let them in.

/** Curator's facts title the memories, and so tell which read the same: Room waits this long for them at most. */
const FACTS_PATIENCE_MS = 2000;

/**
 * Today's films: the Today cards of every memory (when the person keeps memories on), each whole, then Curator's living
 * albums. Room asks for every memory that has come due, whatever the Memories page's settings in this browser say
 * (utils/memory-cards' roomMemoriesSearch: it always plays everything), and makes the Memories page's cards of them
 * (cardsByFacts), so a trip whose anniversary or earlier days are still kept plays as the Memories page's film of its
 * card: all their photos, under the lead memory. It fails only when Gallery answered neither.
 */
export const loadToday = async ({ memories, today }: { memories: boolean; today: DateTime }): Promise<RoomReel[]> => {
  const [found, albums] = await Promise.allSettled([
    memories ? searchMemories(roomMemoriesSearch()) : Promise.resolve([]),
    getAllAlbums({}),
  ]);
  if (found.status === 'rejected' && albums.status === 'rejected') {
    throw found.reason;
  }
  const list = found.status === 'fulfilled' ? found.value : [];
  // the facts' titles tell which memories are one card: all of them, since an earlier day's memory may join today's
  if (list.length > 0) {
    let patience: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      memoryFacts.settle(list.map(({ id }) => id)),
      new Promise<void>((resolve) => (patience = setTimeout(resolve, FACTS_PATIENCE_MS))),
    ]);
    clearTimeout(patience);
  }
  const cards = cardsByFacts(list, wallClockAsUtc(today.toJSDate()));
  return todayReels(cards, albums.status === 'fulfilled' ? albums.value : [], today.month);
};

/** Every photo a search finds, a thousand at a time, `most` at most. */
const searchAll = async (dto: MetadataSearchDto, most = 5000): Promise<AssetResponseDto[]> => {
  const assets: AssetResponseDto[] = [];
  for (let page = 1; assets.length < most; page++) {
    const { assets: found } = await searchAssets({ metadataSearchDto: { ...dto, page, size: 1000 } });
    assets.push(...found.items);
    if (!found.nextPage || found.items.length === 0) {
      break;
    }
  }
  return assets.slice(0, most);
};

/** An album's photos for its film, in the order they were taken. */
export const loadAlbumAssets = async (albumId: string): Promise<AssetResponseDto[]> =>
  inTimeOrder(await searchAll({ albumIds: [albumId], visibility: AssetVisibility.Timeline, order: AssetOrder.Asc }));

const monthStart = (month: string) => `${month}-01T00:00:00.000Z`;
const nextMonthStart = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  return number === 12
    ? `${year + 1}-01-01T00:00:00.000Z`
    : `${year}-${String(number + 1).padStart(2, '0')}-01T00:00:00.000Z`;
};

/**
 * A year's film: its favourites spread through its months, `YEAR_FILM.most` at most; with fewer than `YEAR_FILM.few`
 * favourites, a sample of the year spread by month, the favourites in it. The year's photos are counted as the Years
 * overview counts them (the timeline's months), for the title card to say how many the film was taken from.
 */
export const loadYear = async (year: number, userId: string): Promise<YearFilm> => {
  const after = `${year}-01-01T00:00:00.000Z`;
  const before = `${year + 1}-01-01T00:00:00.000Z`;
  const [buckets, favorites] = await Promise.all([
    getTimeBuckets({
      userId,
      visibility: AssetVisibility.Timeline,
      withStacked: true,
      withPartners: true,
      withSharedSpaces: true,
    }),
    searchAll({
      isFavorite: true,
      takenAfter: after,
      takenBefore: before,
      visibility: AssetVisibility.Timeline,
      order: AssetOrder.Asc,
      withSharedSpaces: true,
    }),
  ]);
  const months = new Map(
    buckets
      .filter(({ timeBucket }) => timeBucket.startsWith(`${year}-`))
      .map(({ timeBucket, count }) => [timeBucket.slice(0, 7), count]),
  );
  let total = 0;
  for (const count of months.values()) {
    total += count;
  }
  const liked = inTimeOrder(favorites);
  if (liked.length >= YEAR_FILM.few) {
    return { assets: spreadByMonth(liked, YEAR_FILM.most, monthOf), favorites: liked.length, total, sample: false };
  }
  const chosen = new Set(liked.map(({ id }) => id));
  const quotas = shareOut(months, YEAR_FILM.most - liked.length);
  const picked = await Promise.all(
    [...quotas]
      .filter(([, count]) => count > 0)
      .map(([month, count]) =>
        searchRandom({
          randomSearchDto: {
            takenAfter: monthStart(month),
            takenBefore: nextMonthStart(month),
            // a few more than the month's share, for the favourites already in it
            size: count + liked.length,
            type: AssetTypeEnum.Image,
            visibility: AssetVisibility.Timeline,
            withSharedSpaces: true,
          },
        })
          .then((found) => found.filter(({ id }) => !chosen.has(id)).slice(0, count))
          .catch(() => [] as AssetResponseDto[]),
      ),
  );
  return { assets: inTimeOrder([...liked, ...picked.flat()]), favorites: liked.length, total, sample: true };
};
