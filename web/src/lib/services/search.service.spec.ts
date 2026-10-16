import { beforeEach, describe, expect, it, vi } from 'vitest';
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { collectSearchResultAssetIds, countSearchResults, countSmartSearchResults } from './search.service';

const page = (ids: string[], nextPage: string | null) =>
  ({
    albums: { items: [], count: 0, facets: [], nextPage: null, total: 0 },
    assets: { items: ids.map((id) => ({ id })), count: ids.length, facets: [], nextPage, total: ids.length },
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('collectSearchResultAssetIds', () => {
  it('pages through metadata search until nextPage is null and returns all ids', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(page(['a', 'b'], '2')).mockResolvedValueOnce(page(['c'], null));

    const ids = await collectSearchResultAssetIds({ isFavorite: true }, { smartSearchEnabled: false, language: 'en' });

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(sdkMock.searchAssets).toHaveBeenCalledTimes(2);
    expect(sdkMock.searchAssets).toHaveBeenNthCalledWith(1, {
      metadataSearchDto: { isFavorite: true, page: 1, size: 1000, withExif: false },
    });
    expect(sdkMock.searchAssets).toHaveBeenNthCalledWith(2, {
      metadataSearchDto: { isFavorite: true, page: 2, size: 1000, withExif: false },
    });
    expect(sdkMock.searchSmart).not.toHaveBeenCalled();
  });

  it('handles a single page', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(page(['x'], null));
    const ids = await collectSearchResultAssetIds({}, { smartSearchEnabled: false, language: 'en' });
    expect(ids).toEqual(['x']);
    expect(sdkMock.searchAssets).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array for no matches', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(page([], null));
    const ids = await collectSearchResultAssetIds({}, { smartSearchEnabled: false, language: 'en' });
    expect(ids).toEqual([]);
  });

  it('uses smart search (with language) when a query is present and smart search is enabled', async () => {
    sdkMock.searchSmart.mockResolvedValueOnce(page(['q1'], null));
    const ids = await collectSearchResultAssetIds({ query: 'dogs' }, { smartSearchEnabled: true, language: 'de' });
    expect(ids).toEqual(['q1']);
    expect(sdkMock.searchSmart).toHaveBeenCalledWith({
      smartSearchDto: { query: 'dogs', page: 1, size: 1000, withExif: false, language: 'de' },
    });
    expect(sdkMock.searchAssets).not.toHaveBeenCalled();
  });

  it('uses metadata search when a query is present but smart search is disabled', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(page(['m1'], null));
    await collectSearchResultAssetIds({ query: 'dogs' }, { smartSearchEnabled: false, language: 'en' });
    expect(sdkMock.searchAssets).toHaveBeenCalledTimes(1);
    expect(sdkMock.searchSmart).not.toHaveBeenCalled();
  });

  it('stops if a page returns no items even when a nextPage token is present (no infinite loop)', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(page([], '2'));
    const ids = await collectSearchResultAssetIds({}, { smartSearchEnabled: false, language: 'en' });
    expect(ids).toEqual([]);
    expect(sdkMock.searchAssets).toHaveBeenCalledTimes(1);
  });

  it('forces pagination fields to override colliding filter terms', async () => {
    sdkMock.searchAssets.mockResolvedValueOnce(page(['a'], null));
    await collectSearchResultAssetIds(
      { size: 5, page: 9, withExif: true, isFavorite: true },
      { smartSearchEnabled: false, language: 'en' },
    );
    expect(sdkMock.searchAssets).toHaveBeenCalledWith({
      metadataSearchDto: { isFavorite: true, page: 1, size: 1000, withExif: false },
    });
  });

  it('uses smart search when queryAssetId is present and smart search is enabled', async () => {
    sdkMock.searchSmart.mockResolvedValueOnce(page(['x'], null));
    await collectSearchResultAssetIds({ queryAssetId: 'abc' }, { smartSearchEnabled: true, language: 'en' });
    expect(sdkMock.searchSmart).toHaveBeenCalledWith({
      smartSearchDto: { queryAssetId: 'abc', page: 1, size: 1000, withExif: false, language: 'en' },
    });
    expect(sdkMock.searchAssets).not.toHaveBeenCalled();
  });
});

describe('countSearchResults', () => {
  it('counts a search by terms the statistics endpoint knows, leaving out paging', async () => {
    sdkMock.searchAssetStatistics.mockResolvedValueOnce({ total: 42 });

    const total = await countSearchResults({
      city: 'Berlin',
      visibility: 'timeline' as never,
      withSharedSpaces: true,
      page: 2,
      withExif: true,
    });

    expect(total).toBe(42);
    expect(sdkMock.searchAssetStatistics).toHaveBeenCalledWith(
      { statisticsSearchDto: { city: 'Berlin', visibility: 'timeline', withSharedSpaces: true } },
      { signal: undefined },
    );
  });

  // The server drops a term it does not know, so these would be counted as if the term were not there.
  it.each([{ originalFileName: 'IMG' }, { originalPath: '/photos' }, { query: 'beach' }, { queryAssetId: 'asset-1' }])(
    'cannot count a search by %o',
    async (terms) => {
      expect(await countSearchResults({ city: 'Berlin', ...terms })).toBeUndefined();
      expect(sdkMock.searchAssetStatistics).not.toHaveBeenCalled();
    },
  );
});

describe('countSmartSearchResults', () => {
  it('counts a cut-off ranking by paging its ids, each photo once', async () => {
    sdkMock.searchSmart.mockResolvedValueOnce(page(['a', 'b'], '2')).mockResolvedValueOnce(page(['b', 'c'], null));

    const total = await countSmartSearchResults(
      { query: 'beach', visibility: 'timeline' as never },
      { language: 'en' },
    );

    expect(total).toBe(3);
    expect(sdkMock.searchSmart).toHaveBeenNthCalledWith(
      2,
      {
        smartSearchDto: {
          query: 'beach',
          visibility: 'timeline',
          page: 2,
          size: 1000,
          withExif: false,
          language: 'en',
        },
      },
      { signal: undefined },
    );
  });

  it('gives up past the cap', async () => {
    sdkMock.searchSmart.mockResolvedValueOnce(page(['a', 'b', 'c'], '2'));

    expect(await countSmartSearchResults({ query: 'photo' }, { language: 'en', cap: 2 })).toBeUndefined();
    expect(sdkMock.searchSmart).toHaveBeenCalledTimes(1);
  });
});
