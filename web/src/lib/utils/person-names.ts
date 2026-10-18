import { placeYears, type PlaceStats } from '$lib/utils/place-stats';
import { normalizeSearchString } from '$lib/utils/string-utils';

// Local Omarchy layer: telling apart people who bear the same name (DESIGN.md, People). Eleven of the owner's names
// belong to more than one person (three Daniels, four Anders) and nothing on People told them apart. Where a name
// repeats among the people shown, each one's tile says how many photos they are in and the years those span, in data
// type ("140 · 2010–2026", as a place's tile does), read-only: nobody is merged or renamed.

/** One key per name as a person reads it: case, accents and the spaces around it left out. */
export const nameKey = (name: string) => normalizeSearchString(name);

/** The names that more than one of these people bear (by `nameKey`); people without a name never repeat. */
export const repeatedNames = (people: Iterable<{ name: string }>): Set<string> => {
  const counts = new Map<string, number>();
  for (const { name } of people) {
    const key = nameKey(name ?? '');
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
};

/** Whether this name is one of the repeated ones. */
export const isRepeatedName = (repeated: Set<string>, name: string) => repeated.has(nameKey(name ?? ''));

/**
 * What a person's tile says under a repeated name: "140 · 2010–2026" from their timeline, as the person's page counts
 * it; nothing while that is still being asked (undefined), and the count Gallery lists them with alone when the
 * timeline could not be read (null) or holds none of their photos (all archived, say).
 */
export const personSpanLine = (
  span: PlaceStats | null | undefined,
  listedCount: number | undefined,
  locale?: string,
): string | undefined => {
  if (span === undefined) {
    return undefined;
  }
  if (span && span.count > 0) {
    return `${span.count.toLocaleString(locale)} · ${placeYears(span)}`;
  }
  return listedCount === undefined ? undefined : listedCount.toLocaleString(locale);
};
