import { searchAssets, type SearchResponseDto } from '@immich/sdk';
import { placeFaces } from '$lib/managers/place-faces.svelte';
import { BRIGHT } from '@test-data/thumbhash';

// Local Omarchy layer: a place tile's photo is chosen once per page load, a few places at a time
// (managers/place-faces)
vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  searchAssets: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: { authenticated: true } }));

const found = (...ids: string[]) =>
  ({ assets: { items: ids.map((id) => ({ id, thumbhash: BRIGHT })) } }) as unknown as SearchResponseDto;

describe('placeFaces', () => {
  // the manager keeps its answers for the page load, so each test asks about places of its own
  beforeEach(() => {
    vi.mocked(searchAssets).mockReset();
  });

  it('has nothing while it looks, then the place’s face, asked once per page load', async () => {
    vi.mocked(searchAssets).mockResolvedValue(found('kept'));
    const riverton = { city: 'Riverton', country: 'Examplestan' };

    placeFaces.request([riverton]);
    expect(placeFaces.get(riverton)).toBeUndefined();
    await placeFaces.settle([riverton], 1000);

    expect(placeFaces.get(riverton)).toBe('kept');
    placeFaces.request([riverton]);
    expect(searchAssets).toHaveBeenCalledTimes(1);
    expect(searchAssets).toHaveBeenCalledWith(
      { metadataSearchDto: expect.objectContaining({ size: 3, withSharedSpaces: true }) },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("stands the server's photo in (null) where no photo qualifies or the question fails", async () => {
    vi.mocked(searchAssets).mockImplementation(({ metadataSearchDto }) =>
      metadataSearchDto.filter?.city?.eq === 'Offline'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(found()),
    );
    const portraits = { city: 'Portraits' };
    const offline = { city: 'Offline' };

    await placeFaces.settle([portraits, offline], 1000);

    expect(placeFaces.get(portraits)).toBeNull();
    expect(placeFaces.get(offline)).toBeNull();
  });
});
