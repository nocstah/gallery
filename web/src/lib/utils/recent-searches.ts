import type { SearchTerms } from '$lib/services/search.service';
import type { TextSearchMode } from '$lib/utils/search-mode-terms';

// Local Omarchy layer: the searches a person ran on the search page, offered again when they open it bare (DESIGN.md,
// Search page). Kept in this browser alone, per account (two accounts on one browser never see each other's), never
// sent anywhere, and cleared by the page's Clear. A search is its text in its mode, kept with the rest of its terms
// (a person, a place, a date) so it runs again exactly; the same text in the same mode is one search, the newest kept.

/** One search as it ran: the words, how they searched, and every term it had. */
export type RecentSearch = { text: string; mode: TextSearchMode; terms: SearchTerms; at: number };

/** how many searches are kept */
export const RECENT_SEARCHES_MAX = 8;

const keyFor = (userId: string) => `gallery.recentSearches:${userId}`;

const sameSearch = (a: Pick<RecentSearch, 'text' | 'mode'>, b: Pick<RecentSearch, 'text' | 'mode'>) =>
  a.mode === b.mode && a.text.trim().toLocaleLowerCase() === b.text.trim().toLocaleLowerCase();

const isRecentSearch = (value: unknown): value is RecentSearch => {
  const entry = value as Partial<RecentSearch> | null;
  return (
    !!entry &&
    typeof entry.text === 'string' &&
    entry.text.trim().length > 0 &&
    typeof entry.mode === 'string' &&
    typeof entry.at === 'number' &&
    !!entry.terms &&
    typeof entry.terms === 'object'
  );
};

/** This account's searches in this browser, newest first; none when the browser keeps nothing. */
export const readRecentSearches = (userId: string): RecentSearch[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyFor(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => isRecentSearch(entry)).slice(0, RECENT_SEARCHES_MAX) : [];
  } catch {
    return [];
  }
};

const write = (userId: string, searches: RecentSearch[]) => {
  try {
    if (searches.length === 0) {
      localStorage.removeItem(keyFor(userId));
    } else {
      localStorage.setItem(keyFor(userId), JSON.stringify(searches));
    }
  } catch {
    // a private window or full storage: the page simply offers nothing next time
  }
};

/** Keep a search that ran, first in the list; the same words in the same mode move up rather than repeat. */
export const rememberSearch = (userId: string, search: Omit<RecentSearch, 'at'>, at = Date.now()): RecentSearch[] => {
  const text = search.text.trim();
  if (!text) {
    return readRecentSearches(userId);
  }
  const entry: RecentSearch = { ...search, text, at };
  const next = [entry, ...readRecentSearches(userId).filter((other) => !sameSearch(other, entry))].slice(
    0,
    RECENT_SEARCHES_MAX,
  );
  write(userId, next);
  return next;
};

/** Forget every search this account ran in this browser. */
export const clearRecentSearches = (userId: string) => write(userId, []);
