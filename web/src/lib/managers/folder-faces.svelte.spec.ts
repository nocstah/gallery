import {
  AssetTypeEnum,
  AssetVisibility,
  getAssetInfo,
  getAssetOcr,
  searchAssets,
  type AssetResponseDto,
  type SearchResponseDto,
} from '@immich/sdk';
import { FolderFaceManager } from '$lib/managers/folder-faces.svelte';

// Local Omarchy layer: the Albums page's folder faces are asked of Gallery once per page load (managers/folder-faces)
vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  getAssetInfo: vi.fn(),
  getAssetOcr: vi.fn(),
  searchAssets: vi.fn(),
}));

const photo = (id: string, isFavorite = false) =>
  ({
    id,
    type: AssetTypeEnum.Image,
    visibility: AssetVisibility.Timeline,
    isFavorite,
    originalMimeType: 'image/jpeg',
    exifInfo: { make: 'Apple' },
    tags: [],
    width: 4032,
    height: 3024,
  }) as unknown as AssetResponseDto;
const found = (...items: AssetResponseDto[]) => ({ assets: { items } }) as unknown as SearchResponseDto;
const album = (id: string) => ({ id, albumThumbnailAssetId: `cover-${id}` });
const albumOf = (call: unknown[]) =>
  (call[0] as { metadataSearchDto: { albumIds: string[] } }).metadataSearchDto.albumIds[0];

describe('FolderFaceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchAssets).mockImplementation(({ metadataSearchDto }) =>
      Promise.resolve(found(photo(`fav-${metadataSearchDto.albumIds?.[0]}`, true))),
    );
    vi.mocked(getAssetInfo).mockImplementation(({ id }) => Promise.resolve(photo(id)));
    vi.mocked(getAssetOcr).mockResolvedValue([]);
  });

  it('has nothing to show while it looks, then the photos', async () => {
    const faces = new FolderFaceManager();
    const albums = [album('a'), album('b')];

    faces.resolve('trips', albums);
    expect(faces.get('trips', albums)).toBeUndefined();

    await vi.waitFor(() => expect(faces.get('trips', albums)).toEqual(['fav-a', 'fav-b']));
  });

  it("asks for an album's favourite photos on the timeline, with their camera data", async () => {
    const faces = new FolderFaceManager();

    faces.resolve('trips', [album('a')]);

    await vi.waitFor(() => expect(faces.get('trips', [album('a')])).toBeDefined());
    expect(searchAssets).toHaveBeenCalledWith(
      {
        metadataSearchDto: {
          albumIds: ['a'],
          isFavorite: true,
          type: AssetTypeEnum.Image,
          visibility: AssetVisibility.Timeline,
          withExif: true,
          size: 3,
        },
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('asks once per page load: a folder looked for again, and an album two folders share', async () => {
    const faces = new FolderFaceManager();

    faces.resolve('trips', [album('a'), album('b')]);
    faces.resolve('trips', [album('a'), album('b')]);
    faces.resolve('asia', [album('a')]);

    await vi.waitFor(() => expect(faces.get('asia', [album('a')])).toBeDefined());
    await vi.waitFor(() => expect(faces.get('trips', [album('a'), album('b')])).toBeDefined());
    expect(
      vi
        .mocked(searchAssets)
        .mock.calls.map((call) => albumOf(call))
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('asks again the next time for a folder whose question failed', async () => {
    const faces = new FolderFaceManager();
    vi.mocked(searchAssets).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(getAssetInfo).mockRejectedValueOnce(new Error('offline'));

    faces.resolve('trips', [album('a')]);
    await vi.waitFor(() => expect(faces.get('trips', [album('a')])).toEqual([]));

    faces.resolve('trips', [album('a')]);
    await vi.waitFor(() => expect(faces.get('trips', [album('a')])).toEqual(['fav-a']));
    expect(searchAssets).toHaveBeenCalledTimes(2);
  });

  it('keeps at most six questions in flight over every folder', async () => {
    const faces = new FolderFaceManager();
    const answers: Array<() => void> = [];
    vi.mocked(searchAssets).mockImplementation(
      ({ metadataSearchDto }) =>
        new Promise<SearchResponseDto>((resolve) => {
          answers.push(() => resolve(found(photo(`fav-${metadataSearchDto.albumIds?.[0]}`, true))));
        }),
    );

    faces.resolve(
      'trips',
      ['a', 'b', 'c', 'd'].map((id) => album(id)),
    );
    faces.resolve(
      'norway',
      ['e', 'f', 'g', 'h'].map((id) => album(id)),
    );
    await vi.waitFor(() => expect(searchAssets).toHaveBeenCalledTimes(6));
    await Promise.resolve();
    expect(searchAssets).toHaveBeenCalledTimes(6);

    answers.shift()?.();
    await vi.waitFor(() => expect(searchAssets).toHaveBeenCalledTimes(7));
  });
});
