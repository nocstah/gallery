import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { load } from './+page';

const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
// Partial mock: upstream's loader pulls in the memory manager, which pulls in `$lib/utils` ->
// `preferences.store` -> `getPreferredLocale`. Replacing the whole module would drop it.
vi.mock(import('$lib/utils/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  getFormatter,
}));

describe('explore page load', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
    sdkMock.getExploreData.mockResolvedValue([]);
    sdkMock.getAllPeople.mockResolvedValue({ people: [], total: 0, hidden: 0, hasNextPage: false });
    sdkMock.getAssetsByCity.mockResolvedValue([]);
    sdkMock.searchMemories.mockResolvedValue([]);
    sdkMock.memoriesStatistics.mockResolvedValue({ total: 0 });
  });

  it('loads visible global people with shared-space identities', async () => {
    const url = new URL('https://gallery.test/explore');

    await load({ url } as never);

    expect(authenticate).toHaveBeenCalledWith(url);
    expect(sdkMock.getExploreData).toHaveBeenCalledWith();
    expect(sdkMock.getAllPeople).toHaveBeenCalledWith({ withHidden: false, withSharedSpaces: true });
  });

  // Local Omarchy layer: every place, so the row can show those that hold the most photos (managers/place-stats)
  it('loads every place for the places row, and leaves the row out when they fail', async () => {
    sdkMock.getAssetsByCity.mockRejectedValue(new Error('down'));

    const data = await load({ url: new URL('https://gallery.test/explore') } as never);

    expect(sdkMock.getAssetsByCity).toHaveBeenCalledWith();
    expect(data?.cities).toEqual([]);
  });
});
