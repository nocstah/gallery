import { type AlbumResponseDto, type AssetResponseDto, type MemoryResponseDto } from '@immich/sdk';
import { DateTime } from 'luxon';
import { UUID_REGEX } from '$lib/constants';
import type { MemoryCard } from '$lib/utils/memory-cards';
import { joinNames } from '$lib/utils/memory-title';
import { fromISODateTimeUTC } from '$lib/utils/timeline-util';

// Local Omarchy layer: what Room plays (DESIGN.md, Room), worked out from what Gallery lists, as plain functions. Plain
// /room is a chain of films: today's memories as the Memories page shows them (memories that read the same, one place
// and month, are one film: utils/memory-cards), then the albums Curator keeps for the TV once the owner has accepted
// them ("Best of <year>", "<Month> across the years", "Growing up · <name>", and any album named "On the TV", the
// names Curator's own Kiosk job looks for: curator/jobs/kiosk.py), and round again. /room?album= plays that album and
// /room?year= that year: its favourites spread through its months, or a sample of the year spread by month when it has
// few favourites.

/** What Room was opened for. */
export type RoomRequest = { kind: 'today' } | { kind: 'album'; albumId: string } | { kind: 'year'; year: number };

/** A film of Room's chain: a memory (with its card when the card holds several), an album or a year. */
export type RoomReel =
  | { kind: 'memory'; key: string; memory: MemoryResponseDto; card?: MemoryCard }
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

export const memoryReel = (memory: MemoryResponseDto, card?: MemoryCard): RoomReel => ({
  kind: 'memory',
  key: `memory:${memory.id}`,
  memory,
  card,
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

/**
 * Plain Room's chain: today's memories as their cards (utils/memory-cards: a birthday first, then as the server sent
 * them; memories that read the same play as one film, all their photos in the order taken, under the lead memory, whose
 * story and songs it has), then the living albums. Cards not due yet stay out.
 */
export const todayReels = (cards: MemoryCard[], albums: AlbumResponseDto[], month: number): RoomReel[] => [
  ...cards
    .filter((card) => card.section !== 'upcoming' && card.assets.length > 0)
    .map((card) =>
      card.members.length > 1 ? memoryReel({ ...card.lead, assets: card.assets }, card) : memoryReel(card.lead),
    ),
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

// ---- the caption: names · place · date, less what the story's line above it says ----

/** Names a caption gives at most; the rest are counted. */
const MOST_NAMES = 3;

/** A sentence as the caption reads it: its words, lowercased, letters and digits only, an ordinal's ending dropped
 * ("18th" is "18"), so a name, a place or a day is found in it whatever its punctuation. */
type Said = { text: string; words: string[] };

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => word.replace(/^(\d+)(?:st|nd|rd|th)$/, '$1'));

// scripts written without spaces between words: there a name is looked for anywhere in the sentence
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/** Whether the sentence says `phrase`: its words one after another, never inside another word ("Ra" is not in "rain"). */
const says = (said: Said, phrase: string) => {
  const wanted = wordsOf(phrase);
  if (wanted.length === 0) {
    return false;
  }
  if (UNSPACED.test(phrase)) {
    return said.text.toLowerCase().includes(phrase.trim().toLowerCase());
  }
  for (let at = 0; at + wanted.length <= said.words.length; at++) {
    if (wanted.every((word, offset) => said.words[at + offset] === word)) {
      return true;
    }
  }
  return false;
};

/** The words a sentence may name a month by: English (Curator writes in English) and the reader's language, long and
 * short, as they stand in a date ("октября", not the "октябрь" of a calendar's heading). */
const monthWords = (month: number, locale: string | undefined) => {
  const date = new Date(Date.UTC(2001, month - 1, 15));
  const names = new Set<string>();
  for (const language of ['en-US', 'en-GB', locale]) {
    for (const style of ['long', 'short'] as const) {
      try {
        const parts = new Intl.DateTimeFormat(language, {
          day: 'numeric',
          month: style,
          timeZone: 'UTC',
        }).formatToParts(date);
        for (const word of wordsOf(parts.find(({ type }) => type === 'month')?.value ?? '')) {
          names.add(word);
        }
      } catch {
        // a locale this browser does not know: English is there
      }
    }
  }
  return names;
};

/** Whether the sentence names the photo's day: its day and month side by side ("18 October", "October 18th", "the
 * 18th of October", "18. Okt."), with its year anywhere in it; the date in numbers (2025-10-18); or the date just as
 * the caption writes it. A month or a span of days ("12–19 March 2018") leaves the day to the caption. */
const saysDay = (said: Said, day: DateTime, written: string, locale: string | undefined) => {
  if (written && said.text.includes(written)) {
    return true;
  }
  const { words } = said;
  const [year, month, date] = [String(day.year), day.month, String(day.day)];
  const months = monthWords(month, locale);
  for (let at = 0; at < words.length; at++) {
    if (words[at] === year && Number(words[at + 1]) === month && words[at + 2] === date) {
      return true;
    }
  }
  if (!words.includes(year)) {
    return false;
  }
  return words.some((word, at) => {
    if (word !== date) {
      return false;
    }
    const after = words[at + 1] === 'of' ? words[at + 2] : words[at + 1];
    return months.has(words[at - 1] ?? '') || months.has(after ?? '');
  });
};

/**
 * The photo on screen in words, for Room's caption: who is in it (its named people, three at most and how many more),
 * where (its city and country) and when (its day, in the reader's language). `line` is what the story's line above it
 * says: a part it already names is left out (DESIGN.md, Room), so the caption never says a thing twice: the people
 * when it names every one of them, the place when it names the city (the country alone leaves the city), the day when
 * it names the day with its month and year. A line that says it all leaves no caption.
 */
export const roomCaption = (
  asset: Pick<AssetResponseDto, 'people' | 'exifInfo' | 'localDateTime'>,
  locale: string | undefined,
  more: (count: number) => string,
  line?: string,
): string => {
  const said: Said | undefined = line?.trim() ? { text: line, words: wordsOf(line) } : undefined;
  const names: string[] = [];
  for (const person of asset.people ?? []) {
    const name = person.name?.trim();
    if (name && !person.isHidden && !names.includes(name)) {
      names.push(name);
    }
  }
  const everyoneSaid = !!said && names.length > 0 && names.every((name) => says(said, name));
  const who =
    names.length === 0 || everyoneSaid
      ? ''
      : names.length > MOST_NAMES
        ? joinNames([...names.slice(0, MOST_NAMES), more(names.length - MOST_NAMES)], locale)
        : joinNames(names, locale);

  const city = asset.exifInfo?.city?.trim() ?? '';
  const country = asset.exifInfo?.country?.trim() ?? '';
  const where =
    said && city && says(said, city)
      ? ''
      : [city, said && country && says(said, country) ? '' : country].filter(Boolean).join(', ');

  const day = asset.localDateTime ? fromISODateTimeUTC(asset.localDateTime) : undefined;
  const written = day?.isValid ? day.toLocaleString(DateTime.DATE_FULL, { locale }) : '';
  const when = day?.isValid && said && saysDay(said, day, written, locale) ? '' : written;

  return [who, where, when].filter(Boolean).join(' · ');
};
