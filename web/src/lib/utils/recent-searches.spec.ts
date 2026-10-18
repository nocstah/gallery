import {
  clearRecentSearches,
  readRecentSearches,
  RECENT_SEARCHES_MAX,
  rememberSearch,
} from '$lib/utils/recent-searches';

// Local Omarchy layer: the search page's recent searches, kept in this browser per account and never sent anywhere
describe('recent searches', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a search with its terms, newest first', () => {
    rememberSearch('me', { text: 'beach', mode: 'smart', terms: { query: 'beach' } }, 1);
    rememberSearch(
      'me',
      { text: 'IMG_2041', mode: 'metadata', terms: { originalFileName: 'IMG_2041', city: 'Oslo' } },
      2,
    );

    expect(readRecentSearches('me')).toEqual([
      { text: 'IMG_2041', mode: 'metadata', terms: { originalFileName: 'IMG_2041', city: 'Oslo' }, at: 2 },
      { text: 'beach', mode: 'smart', terms: { query: 'beach' }, at: 1 },
    ]);
  });

  it('moves the same words in the same mode up rather than repeating them', () => {
    rememberSearch('me', { text: 'beach', mode: 'smart', terms: { query: 'beach' } }, 1);
    rememberSearch('me', { text: 'snow', mode: 'smart', terms: { query: 'snow' } }, 2);
    rememberSearch('me', { text: ' Beach ', mode: 'smart', terms: { query: ' Beach ', city: 'Krabi' } }, 3);
    rememberSearch('me', { text: 'beach', mode: 'ocr', terms: { ocr: 'beach' } }, 4);

    expect(readRecentSearches('me').map(({ text, mode }) => `${text}/${mode}`)).toEqual([
      'beach/ocr',
      'Beach/smart',
      'snow/smart',
    ]);
    expect(readRecentSearches('me')[1].terms).toEqual({ query: ' Beach ', city: 'Krabi' });
  });

  it(`keeps the last ${RECENT_SEARCHES_MAX}`, () => {
    for (let index = 0; index < RECENT_SEARCHES_MAX + 3; index++) {
      rememberSearch('me', { text: `search ${index}`, mode: 'smart', terms: { query: `search ${index}` } }, index);
    }

    const kept = readRecentSearches('me');
    expect(kept).toHaveLength(RECENT_SEARCHES_MAX);
    expect(kept[0].text).toBe(`search ${RECENT_SEARCHES_MAX + 2}`);
  });

  it('keeps each account’s searches apart, and clears only its own', () => {
    rememberSearch('me', { text: 'beach', mode: 'smart', terms: { query: 'beach' } });
    rememberSearch('mom', { text: 'garden', mode: 'smart', terms: { query: 'garden' } });

    clearRecentSearches('me');

    expect(readRecentSearches('me')).toEqual([]);
    expect(readRecentSearches('mom').map(({ text }) => text)).toEqual(['garden']);
  });

  it('ignores blank words and anything unreadable in storage', () => {
    const blank = ' '.repeat(3);
    rememberSearch('me', { text: blank, mode: 'smart', terms: { query: blank } });
    expect(readRecentSearches('me')).toEqual([]);

    localStorage.setItem('gallery.recentSearches:me', '{not json');
    expect(readRecentSearches('me')).toEqual([]);

    localStorage.setItem('gallery.recentSearches:me', JSON.stringify([{ text: 'ok' }, 42, null]));
    expect(readRecentSearches('me')).toEqual([]);
  });

  it('carries on without a browser store', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => rememberSearch('me', { text: 'beach', mode: 'smart', terms: { query: 'beach' } })).not.toThrow();
    expect(readRecentSearches('me')).toEqual([]);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
