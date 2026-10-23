import { get } from 'svelte/store';
import { PeopleSortBy, peopleViewSettings } from '$lib/stores/preferences.store';
import { comparePeople, type SortablePerson } from '$lib/utils/people-utils';
import { normalizeSearchString } from '$lib/utils/string-utils';

// Local Omarchy layer: one people ranking (DESIGN.md, People; the owner's "one people ranking", 2026-10-23). Every
// list that offers people ranks them as the People page does, with its one comparator (utils/people-utils'
// comparePeople) under the People page's own sort: favourites first, then the most photos (names A to Z when the
// People page is set to Name), named people before unnamed ones, hidden people last. Ctrl+K's @ had listed the first
// ten names A to Z and the filter rail its people A to Z (the server's orders), so the three disagreed. A list of
// matches to something typed ranks the best match first, then the same order.

type RankedPerson = SortablePerson & {
  filterId?: string;
  primaryProfile?: { type?: string; id: string };
};

/** The People page's sort, read as it reads it: anything it does not know is Most photos. */
export const peopleSortBy = (value: unknown = get(peopleViewSettings).sortBy): PeopleSortBy =>
  Object.values(PeopleSortBy).includes(value as PeopleSortBy) ? (value as PeopleSortBy) : PeopleSortBy.PhotoCount;

/** The one people ranking: the People page's order. */
export const compareInPeopleOrder = (a: SortablePerson, b: SortablePerson, sortBy = peopleSortBy()) =>
  comparePeople(a, b, sortBy);

/** A copy of `people` in the People page's order. */
export const sortInPeopleOrder = <T extends SortablePerson>(people: T[], sortBy = peopleSortBy()): T[] =>
  [...people].sort((a, b) => comparePeople(a, b, sortBy));

/**
 * How well a name answers what was typed, best first: the whole name (0), its start (1), the start of one of its words
 * (2), anywhere in it (3), or not as typed at all (4: the server's fuzzy match). Case, accents and spaces aside.
 */
export const nameMatch = (name: string | null | undefined, query: string): number => {
  const typed = normalizeSearchString(query);
  const words = normalizeSearchString(name ?? '');
  if (!typed) {
    return 0;
  }
  if (words === typed) {
    return 0;
  }
  if (words.startsWith(typed)) {
    return 1;
  }
  if (words.split(/[\s\-'’.]+/u).some((word) => word.startsWith(typed))) {
    return 2;
  }
  return words.includes(typed) ? 3 : 4;
};

/** `items` with the best matches to what was typed first, each match's order kept (a list already in the People
 * page's order stays in it within each). */
export const bestMatchFirst = <T extends { name?: string | null }>(items: T[], query: string): T[] =>
  items
    .map((item, index) => ({ item, index, match: nameMatch(item.name, query) }))
    .sort((a, b) => a.match - b.match || a.index - b.index)
    .map(({ item }) => item);

/** People who match what was typed: the best match first, then the People page's order. */
export const comparePeopleMatches =
  (query: string, sortBy = peopleSortBy()) =>
  (a: SortablePerson, b: SortablePerson) =>
    nameMatch(a.name, query) - nameMatch(b.name, query) || comparePeople(a, b, sortBy);

/**
 * The people a picker offers for what was typed: everyone while nothing is, in the People page's order, else those
 * whose name holds it, the best match first, then that order. Case, accents and spaces aside.
 */
export const pickPeople = <T extends SortablePerson>(people: T[], query: string, sortBy = peopleSortBy()): T[] => {
  const typed = normalizeSearchString(query);
  if (!typed) {
    return sortInPeopleOrder(people, sortBy);
  }
  return people
    .filter((person) => normalizeSearchString(person.name ?? '').includes(typed))
    .sort(comparePeopleMatches(query, sortBy));
};

/** Every id a person goes by: its own, its filter token and its profile's, as the lists that offer people know it. */
const idsOf = (person: RankedPerson) => {
  const ids = [person.id];
  if (person.filterId) {
    ids.push(person.filterId);
  }
  if (person.primaryProfile?.id) {
    const kind = person.primaryProfile.type === 'space-person' ? 'space-person' : 'person';
    ids.push(person.primaryProfile.id, `${kind}:${person.primaryProfile.id}`);
  }
  return ids;
};

/** Where each person stands in the People page's order, under every id they go by. */
export const peoplePositions = (people: RankedPerson[], sortBy = peopleSortBy()): Map<string, number> => {
  const positions = new Map<string, number>();
  for (const [index, person] of sortInPeopleOrder(people, sortBy).entries()) {
    for (const id of idsOf(person)) {
      if (!positions.has(id)) {
        positions.set(id, index);
      }
    }
  }
  return positions;
};

/**
 * A list that carries people's ids and names only (the filter rail's People, an album's faces) in the People page's
 * order, by where each stands among `positions`. Anyone it does not know follows, in the order they came.
 */
export const inPeopleOrder = <T extends { id: string }>(items: T[], positions: Map<string, number>): T[] =>
  items
    .map((item, index) => ({ item, index, at: positions.get(item.id) ?? Infinity }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map(({ item }) => item);
