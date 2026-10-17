import { type AlbumResponseDto, type AssetResponseDto, type MemoryResponseDto, MemoryType } from '@immich/sdk';
import { DateTime } from 'luxon';
import { UUID_REGEX } from '$lib/constants';
import { joinNames } from '$lib/utils/memory-title';
import { fromISODateTimeUTC } from '$lib/utils/timeline-util';

// Local Omarchy layer: what Room plays (DESIGN.md, Room), worked out from what Gallery lists, as plain functions. Plain
// /room is a chain of films: today's memories, then the albums Curator keeps for the TV once the owner has accepted
// them ("Best of <year>", "<Month> across the years", "Growing up · <name>", and any album named "On the TV", the
// names Curator's own Kiosk job looks for: curator/jobs/kiosk.py), and round again. /room?album= plays that album and
// /room?year= that year: its favourites spread through its months, or a sample of the year spread by month when it has
// few favourites.

/** What Room was opened for. */
export type RoomRequest = { kind: 'today' } | { kind: 'album'; albumId: string } | { kind: 'year'; year: number };

/** A film of Room's chain: a memory, an album or a year. */
export type RoomReel =
  | { kind: 'memory'; key: string; memory: MemoryResponseDto }
  | { kind: 'album'; key: string; album: AlbumResponseDto }
  | { kind: 'year'; key: string; year: number };

export const roomRequest = (params: URLSearchParams): RoomRequest => {
  const album = params.get('album');
  if (album && UUID_REGEX.test(album)) {
    return { kind: 'album', albumId: album };
  }
  const year = Number(params.get('year'));
  if (params.has('year') && Number.isSafeInteger(year) && year >= 1800 && year <= 2200) {
    return { kind: 'year', year };
  }
  return { kind: 'today' };
};

export const memoryReel = (memory: MemoryResponseDto): RoomReel => ({
  kind: 'memory',
  key: `memory:${memory.id}`,
  memory,
});
export const albumReel = (album: AlbumResponseDto): RoomReel => ({ kind: 'album', key: `album:${album.id}`, album });
export const yearReel = (year: number): RoomReel => ({ kind: 'year', key: `year:${year}`, year });

/** The albums Curator keeps for the TV, as its Kiosk job finds them. */
export const LIVING_ALBUM = /^Best of \d{4}$|^[A-Z][a-z]+ across the years$|^Growing up · |^On the TV$/;

// Curator names its months in English (Python's calendar.month_name)
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The living albums in the order Room plays them: the one the owner named On the TV, this month across the years, the
 * best of each year from the newest, growing up, then the other months across the years from this one on. Empty
 * albums are left out.
 */
export const livingAlbums = (albums: AlbumResponseDto[], month: number): AlbumResponseDto[] => {
  const rank = ({ albumName: name }: AlbumResponseDto): [number, number] => {
    if (name === 'On the TV') {
      return [0, 0];
    }
    const across = /^([A-Z][a-z]+) across the years$/.exec(name);
    if (across) {
      const its = MONTHS.indexOf(across[1]) + 1;
      if (its === month) {
        return [1, 0];
      }
      return [4, its === 0 ? 12 : (its - month + 12) % 12];
    }
    const best = /^Best of (\d{4})$/.exec(name);
    if (best) {
      return [2, -Number(best[1])];
    }
    return [3, 0];
  };
  return albums
    .filter((album) => LIVING_ALBUM.test(album.albumName) && album.assetCount > 0)
    .map((album) => ({ album, rank: rank(album) }))
    .sort(
      (a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.album.albumName.localeCompare(b.album.albumName),
    )
    .map(({ album }) => album);
};

/** Plain Room's chain: today's memories (birthdays first, as the memories strip has them), then the living albums. */
export const todayReels = (memories: MemoryResponseDto[], albums: AlbumResponseDto[], month: number): RoomReel[] => [
  ...memories
    .filter((memory) => memory.assets.length > 0)
    .map((memory, order) => ({ memory, order }))
    .sort(
      (a, b) =>
        Number(b.memory.type === MemoryType.Birthday) - Number(a.memory.type === MemoryType.Birthday) ||
        a.order - b.order,
    )
    .map(({ memory }) => memoryReel(memory)),
  ...livingAlbums(albums, month).map((album) => albumReel(album)),
];

// ---- a year: its favourites spread through its months, or a sample of it by month ----

/** A year's film holds this many photos at most; with fewer favourites than `few` it is a sample of the year. */
export const YEAR_FILM = { most: 48, few: 12 } as const;

/** 'YYYY-MM' of a photo's own day */
export const monthOf = (asset: Pick<AssetResponseDto, 'localDateTime'>) => asset.localDateTime.slice(0, 7);

/**
 * `size` shared out over months that hold `counts`: one each in turn, the busiest months first, while they have more,
 * so every month is in it and the months where more happened give a little more.
 */
export const shareOut = (counts: Map<string, number>, size: number): Map<string, number> => {
  const quotas = new Map([...counts.keys()].map((key) => [key, 0]));
  const order = [...counts]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
  let left = Math.max(0, Math.floor(size));
  let open = order;
  while (left > 0 && open.length > 0) {
    for (const key of open) {
      if (left === 0) {
        break;
      }
      quotas.set(key, (quotas.get(key) ?? 0) + 1);
      left--;
    }
    open = open.filter((key) => (quotas.get(key) ?? 0) < (counts.get(key) ?? 0));
  }
  return quotas;
};

/** `count` of `items`, taken evenly through them (the middle of each equal stretch). */
const evenly = <T>(items: T[], count: number): T[] =>
  count >= items.length
    ? [...items]
    : Array.from({ length: count }, (_, index) => items[Math.floor(((index + 0.5) * items.length) / count)]);

/** At most `most` of `items` (in time order), spread over their months: each month gives its share of them, evenly. */
export const spreadByMonth = <T>(items: T[], most: number, month: (item: T) => string): T[] => {
  if (items.length <= most) {
    return [...items];
  }
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = month(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  const quotas = shareOut(new Map([...groups].map(([key, group]) => [key, group.length])), most);
  return [...groups].flatMap(([key, group]) => evenly(group, quotas.get(key) ?? 0));
};

/** Photos in the order they were taken, each once. */
export const inTimeOrder = (assets: AssetResponseDto[]): AssetResponseDto[] => {
  const byId = new Map<string, AssetResponseDto>();
  for (const asset of assets) {
    if (!byId.has(asset.id)) {
      byId.set(asset.id, asset);
    }
  }
  // sorted on a copy: a TV's browser may be older than Array.prototype.toSorted
  return [...byId.values()].sort((a, b) => a.localDateTime.localeCompare(b.localDateTime));
};

/** What a year's film holds: the photos, the year's favourites and photos, and whether it is a sample. */
export type YearFilm = { assets: AssetResponseDto[]; favorites: number; total: number; sample: boolean };

// ---- the caption: names · place · date ----

/** Names a caption gives at most; the rest are counted. */
const MOST_NAMES = 3;

/**
 * The photo on screen in words, for Room's caption: who is in it (its named people, three at most and how many more),
 * where (its city and country) and when (its day, in the reader's language).
 */
export const roomCaption = (
  asset: Pick<AssetResponseDto, 'people' | 'exifInfo' | 'localDateTime'>,
  locale: string | undefined,
  more: (count: number) => string,
): string => {
  const names: string[] = [];
  for (const person of asset.people ?? []) {
    const name = person.name?.trim();
    if (name && !person.isHidden && !names.includes(name)) {
      names.push(name);
    }
  }
  const who =
    names.length > MOST_NAMES
      ? joinNames([...names.slice(0, MOST_NAMES), more(names.length - MOST_NAMES)], locale)
      : names.length > 0
        ? joinNames(names, locale)
        : '';
  const where = [asset.exifInfo?.city, asset.exifInfo?.country].filter(Boolean).join(', ');
  const when = asset.localDateTime
    ? fromISODateTimeUTC(asset.localDateTime).toLocaleString(DateTime.DATE_FULL, { locale })
    : '';
  return [who, where, when].filter(Boolean).join(' · ');
};
