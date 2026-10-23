import { searchAssets, searchSmart, type SearchResponseDto } from '@immich/sdk';
import { placeFaces } from '$lib/managers/place-faces.svelte';
import { PLACE_LOOK } from '$lib/utils/place-faces';
import { BRIGHT } from '@test-data/thumbhash';

// Local Omarchy layer: a place tile's photo is chosen once per page load, a few places at a time
// (managers/place-faces)
vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  searchAssets: vi.fn(),
  searchSmart: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: { authenticated: true } }));

const found = (...ids: string[]) =>
  ({
    assets: { items: ids.map((id) => ({ id, thumbhash: BRIGHT, isFavorite: false })) },
  }) as unknown as SearchResponseDto;

describe('placeFaces', () => {
  // the manager keeps its answers for the page load, so each test asks about places of its own
  beforeEach(() => {
    vi.mocked(searchAssets).mockReset();
    vi.mocked(searchSmart).mockReset();
  });

  it('has nothing while it looks, then the place’s face, asked once per page load', async () => {
    vi.mocked(searchSmart).mockResolvedValue(found('view'));
    const riverton = { city: 'Riverton', country: 'Examplestan' };

    placeFaces.request([riverton]);
    expect(placeFaces.get(riverton)).toBeUndefined();
    await placeFaces.settle([riverton], 1000);

    expect(placeFaces.get(riverton)).toBe('view');
    placeFaces.request([riverton]);
    expect(searchSmart).toHaveBeenCalledTimes(1);
    expect(searchSmart).toHaveBeenCalledWith(
      { smartSearchDto: expect.objectContaining({ query: PLACE_LOOK, size: 6, withSharedSpaces: true }) },
      { signal: expect.any(AbortSignal) },
    );
    expect(searchAssets).not.toHaveBeenCalled();
  });

  it("asks the metadata search where the image search does not answer, and stands the server's photo in (null)", async () => {
    vi.mocked(searchSmart).mockRejectedValue(new Error('machine learning away'));
    vi.mocked(searchAssets).mockImplementation(({ metadataSearchDto }) =>
      metadataSearchDto.filter?.city?.eq === 'Offline'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(found()),
    );
    const portraits = { city: 'Portraits' };
    const offline = { city: 'Offline' };

    await placeFaces.settle([portraits, offline], 1000);

    expect(searchAssets).toHaveBeenCalled();
    expect(placeFaces.get(portraits)).toBeNull();
    expect(placeFaces.get(offline)).toBeNull();
  });
});
