import type { TimeBucketsResponseDto } from '@immich/sdk';

// Local Omarchy layer: what a place tile says beside its name (DESIGN.md, Places): how many photos the place holds and
// the years they span, "1,375 · 2010–2026", in data type, and the order places stand in: most photos first. Worked out
// from the place's timeline (its photos by year, as the Photos page filtered to the place counts them), so the count
// is what the tile opens.

/** A place as Gallery lists it: a city, and the country it is in when the geocoder knew it. */
export type PlaceKey = { city: string; country?: string | null };

/** How many photos a place holds and the first and last year they were taken in. */
export type PlaceStats = { count: number; first: number; last: number };

/** One key per place: a city's name can recur in several countries. */
export const placeKey = ({ city, country }: PlaceKey) => `${country ?? ''}\u{1F}${city}`;

/** A place's count and years from its timeline's buckets (by year or month); none for a timeline without photos. */
export const placeStatsOf = (buckets: Pick<TimeBucketsResponseDto, 'count' | 'timeBucket'>[]): PlaceStats => {
  let count = 0;
  let first = Infinity;
  let last = -Infinity;
  for (const bucket of buckets) {
    const year = Number(bucket.timeBucket.slice(0, 4));
    if (!Number.isFinite(year) || bucket.count <= 0) {
      continue;
    }
    count += bucket.count;
    first = Math.min(first, year);
    last = Math.max(last, year);
  }
  return count === 0 ? { count: 0, first: 0, last: 0 } : { count, first, last };
};

/** "2010–2026", or the year alone; years are names here, never grouped ("2,010"). */
export const placeYears = ({ first, last }: Pick<PlaceStats, 'first' | 'last'>) =>
  first === last ? String(first) : `${first}–${last}`;

/** "1,375 · 2010–2026", the count in the reader's digits. */
export const placeLine = (stats: PlaceStats, locale?: string) =>
  `${stats.count.toLocaleString(locale)} · ${placeYears(stats)}`;

/**
 * Places in the order they stand: those that hold the most photos first, then by name; a place whose count is not
 * known yet keeps its turn after the counted ones, in the order it came. `keyOf` says which place an item is, and
 * `statsOf` what is known of it.
 */
export const rankPlaces = <T>(
  places: T[],
  keyOf: (place: T) => PlaceKey,
  statsOf: (place: PlaceKey) => PlaceStats | null | undefined,
  locale?: string,
): T[] =>
  places
    .map((place, index) => {
      const key = keyOf(place);
      return { place, index, city: key.city, count: statsOf(key)?.count };
    })
    .sort((a, b) => {
      if (a.count === undefined || b.count === undefined) {
        return a.count === undefined ? (b.count === undefined ? a.index - b.index : 1) : -1;
      }
      return b.count - a.count || a.city.localeCompare(b.city, locale) || a.index - b.index;
    })
    .map(({ place }) => place);
