import {
  searchAssets,
  searchAssetStatistics,
  searchSmart,
  type MetadataSearchDto,
  type SmartSearchDto,
  type StatisticsSearchDto,
} from '@immich/sdk';

const COLLECT_PAGE_SIZE = 1000;

export type SearchTerms = MetadataSearchDto & Pick<SmartSearchDto, 'query' | 'queryAssetId'>;

/**
 * Pages through the search API for the given filter and returns the ids of every matching asset.
 * IDs only — `withExif: false` keeps each page payload minimal.
 */
export const collectSearchResultAssetIds = async (
  terms: SearchTerms,
  options: { smartSearchEnabled: boolean; language: string },
): Promise<string[]> => {
  const ids: string[] = [];
  let page: number | undefined = 1;

  while (page) {
    // Our pagination fields go last so a filter term can never override them.
    const searchDto: SearchTerms = { ...terms, page, size: COLLECT_PAGE_SIZE, withExif: false };

    const useSmart = ('query' in searchDto || 'queryAssetId' in searchDto) && options.smartSearchEnabled;
    const { assets } = useSmart
      ? await searchSmart({ smartSearchDto: { ...searchDto, language: options.language } })
      : await searchAssets({ metadataSearchDto: searchDto });

    ids.push(...assets.items.map((asset) => asset.id));

    page = assets.items.length > 0 && assets.nextPage ? Number(assets.nextPage) : undefined;
  }

  return ids;
};

/**
 * Local Omarchy layer: how many photos a smart search finds when the server cuts its ranking off
 * (machineLearning.clip.maxDistance, the smartSearchHasCutoff feature): the results end there, so paging their ids
 * counts them, as Add all collects them. The facets endpoint's total cannot stand in: it counts archived photos too.
 * Undefined past `cap` photos, where the count would cost more than it says.
 */
export const countSmartSearchResults = async (
  terms: SearchTerms,
  options: { language: string; signal?: AbortSignal; cap?: number },
): Promise<number | undefined> => {
  const { language, signal, cap = 5000 } = options;
  const ids = new Set<string>();
  let page: number | undefined = 1;

  while (page) {
    const smartSearchDto = { ...terms, page, size: COLLECT_PAGE_SIZE, withExif: false, language };
    const { assets } = await searchSmart({ smartSearchDto }, { signal });
    for (const asset of assets.items) {
      ids.add(asset.id);
    }
    if (ids.size > cap) {
      return undefined;
    }
    page = assets.items.length > 0 && assets.nextPage ? Number(assets.nextPage) : undefined;
  }

  return ids.size;
};

// Local Omarchy layer: the terms the statistics endpoint counts by (StatisticsSearchDto), and those that only page or
// shape the results. The server drops a term it does not know without a word, so a search by anything else (a file
// name, a path, a smart query) would be counted as if that term were not there.
const STATISTICS_TERMS = new Set<string>([
  'albumIds',
  'city',
  'country',
  'createdAfter',
  'createdBefore',
  'description',
  'isEncoded',
  'isFavorite',
  'isMotion',
  'isNotInAlbum',
  'isOffline',
  'lensModel',
  'libraryId',
  'make',
  'model',
  'ocr',
  'personIds',
  'rating',
  'spaceId',
  'spacePersonIds',
  'state',
  'tagIds',
  'takenAfter',
  'takenBefore',
  'trashedAfter',
  'trashedBefore',
  'type',
  'updatedAfter',
  'updatedBefore',
  'visibility',
  'withSharedSpaces',
]);
const PAGING_TERMS = new Set<string>(['page', 'size', 'withExif', 'withPeople', 'withStacked', 'order']);

/**
 * Local Omarchy layer: how many photos a metadata search finds (the search page's count), or undefined when the
 * statistics endpoint cannot count these terms: a smart search, which ranks every photo rather than matching some,
 * or a term it does not know, such as a file name.
 */
export const countSearchResults = async (
  terms: SearchTerms,
  options: { signal?: AbortSignal } = {},
): Promise<number | undefined> => {
  const statisticsSearchDto: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(terms)) {
    if (value === undefined || PAGING_TERMS.has(key)) {
      continue;
    }
    if (!STATISTICS_TERMS.has(key)) {
      return undefined;
    }
    statisticsSearchDto[key] = value;
  }
  const { total } = await searchAssetStatistics(
    { statisticsSearchDto: statisticsSearchDto as StatisticsSearchDto },
    { signal: options.signal },
  );
  return total;
};
