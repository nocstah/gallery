import type { PersonResponseDto } from '@immich/sdk';
import { comparePeopleMatches, compareInPeopleOrder } from '$lib/utils/people-order';

export type Scope = 'all' | 'people' | 'tags' | 'collections' | 'nav';
export type ParsedQuery = { scope: Scope; payload: string };

const PREFIX_MAP: Record<string, Scope> = {
  '@': 'people',
  '#': 'tags',
  '/': 'collections',
  '>': 'nav',
};

export function parseScope(rawText: string): ParsedQuery {
  const text = rawText.trim();
  if (text.length === 0) {
    return { scope: 'all', payload: '' };
  }
  const scope = PREFIX_MAP[text[0]];
  if (!scope) {
    return { scope: 'all', payload: text };
  }
  return { scope, payload: text.slice(1).trim() };
}

/**
 * Sort comparator for the bare-`@` suggestions list.
 * Local Omarchy layer: the People page's order (utils/people-order): favourites first, then the most photos (or names
 * A to Z when the People page is set so), named before unnamed, id last. It had been favourites, then A to Z.
 */
export function personSuggestionsComparator(a: PersonResponseDto, b: PersonResponseDto): number {
  return compareInPeopleOrder(a, b);
}

/** Local Omarchy layer: people found for what was typed after `@`, the best match first, then the People page's order. */
export const personMatchComparator = (query: string) => comparePeopleMatches(query);
