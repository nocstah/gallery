import { AssetTypeEnum, AssetVisibility, type AssetOcrResponseDto, type TagResponseDto } from '@immich/sdk';
import {
  chooseFaces,
  COVER_ALBUMS,
  FaceKind,
  faceKey,
  faceKind,
  FACES,
  FAVOURITE_ALBUMS,
  isTextHeavy,
  SPARE,
  spreadFaces,
  type FaceAlbum,
  type FacePicture,
  type FaceSources,
} from '$lib/utils/folder-faces';

// Local Omarchy layer: the Albums page's folder faces, photos only and best first (the owner, 2026-10-18)

const picture = (id: string, overrides: Partial<FacePicture> = {}): FacePicture => ({
  id,
  type: AssetTypeEnum.Image,
  visibility: AssetVisibility.Timeline,
  isFavorite: false,
  originalMimeType: 'image/jpeg',
  exifInfo: { make: 'Apple', model: 'iPhone 15 Pro' },
  tags: [],
  width: 4032,
  height: 3024,
  ...overrides,
});
const plain = (id: string, overrides: Partial<FacePicture> = {}) =>
  picture(id, { exifInfo: {}, width: 1080, height: 1440, ...overrides });
const tagged = (...values: string[]) => values.map((value) => ({ value }) as TagResponseDto);
const album = (id: string, cover: string | null = `cover-${id}`): FaceAlbum => ({ id, albumThumbnailAssetId: cover });
const box = (x1: number, y1: number, x2: number, y2: number) =>
  ({ x1, y1, x2, y2: y1, x3: x2, y3: y2, x4: x1, y4: y2 }) as AssetOcrResponseDto;

type Fake = {
  favourites?: Record<string, FacePicture[]>;
  pictures?: FacePicture[];
  text?: string[];
  fail?: string[];
};

/** Sources answering from a few fixed photos, counting what they were asked */
const fake = ({ favourites = {}, pictures = [], text = [], fail = [] }: Fake = {}) => {
  const asked = { favourites: [] as string[], picture: [] as string[], textHeavy: [] as string[] };
  const failing = new Set(fail);
  const byId = new Map(pictures.map((item) => [item.id, item]));
  const sources: FaceSources = {
    favourites: (albumId) => {
      asked.favourites.push(albumId);
      return failing.has(albumId) ? Promise.reject(new Error('offline')) : Promise.resolve(favourites[albumId] ?? []);
    },
    picture: (assetId) => {
      asked.picture.push(assetId);
      const found = byId.get(assetId);
      return failing.has(assetId) || !found ? Promise.reject(new Error('offline')) : Promise.resolve(found);
    },
    textHeavy: (assetId) => {
      asked.textHeavy.push(assetId);
      return Promise.resolve(text.includes(assetId));
    },
  };
  return { sources, asked };
};

describe('faceKind', () => {
  it('takes a photo with a camera on the timeline as a photo', () => {
    expect(faceKind(picture('a'))).toBe(FaceKind.Photo);
  });

  it('leaves an image without a camera to its text', () => {
    expect(faceKind(plain('a'))).toBe(FaceKind.Plain);
  });

  it('takes a PNG or a GIF without a camera, or a screen-shaped image, as no photo', () => {
    expect(faceKind(plain('a', { originalMimeType: 'image/png' }))).toBe(FaceKind.Not);
    expect(faceKind(plain('a', { originalMimeType: 'image/gif' }))).toBe(FaceKind.Not);
    expect(faceKind(plain('a', { width: 1170, height: 2532 }))).toBe(FaceKind.Not);
    // a camera's tall photo is still a photo
    expect(faceKind(picture('a', { width: 1170, height: 2532 }))).toBe(FaceKind.Photo);
  });

  it('reads the size from the camera data when the photo has none of its own', () => {
    expect(
      faceKind(plain('a', { width: null, height: null, exifInfo: { exifImageWidth: 1179, exifImageHeight: 2556 } })),
    ).toBe(FaceKind.Not);
  });

  it('never takes a bank slip, a receipt or what is locked away', () => {
    expect(faceKind(picture('a', { tags: tagged('QR'), visibility: AssetVisibility.Archive }))).toBe(FaceKind.Never);
    expect(faceKind(picture('a', { tags: tagged('Auto/Receipts') }))).toBe(FaceKind.Never);
    expect(faceKind(picture('a', { visibility: AssetVisibility.Locked }))).toBe(FaceKind.Never);
    expect(faceKind(picture('a', { visibility: AssetVisibility.Hidden }))).toBe(FaceKind.Never);
  });

  it('takes a document, a screenshot or what is archived as no photo', () => {
    expect(faceKind(picture('a', { tags: tagged('Auto/Documents') }))).toBe(FaceKind.Not);
    expect(faceKind(picture('a', { tags: tagged('Auto/Screenshots') }))).toBe(FaceKind.Not);
    expect(faceKind(picture('a', { visibility: AssetVisibility.Archive }))).toBe(FaceKind.Not);
  });

  it('takes a video as a video, unless it recorded a screen', () => {
    expect(faceKind(picture('a', { type: AssetTypeEnum.Video, exifInfo: {}, width: 1920, height: 1080 }))).toBe(
      FaceKind.Video,
    );
    expect(faceKind(picture('a', { type: AssetTypeEnum.Video, exifInfo: {}, width: 886, height: 1920 }))).toBe(
      FaceKind.Not,
    );
  });
});

describe('isTextHeavy', () => {
  it('takes a photo with a line or two of words as a photo', () => {
    expect(isTextHeavy([])).toBe(false);
    expect(isTextHeavy([box(0.7, 0.9, 0.95, 0.97)])).toBe(false);
    expect(isTextHeavy(Array.from({ length: 9 }, (_, i) => box(0.1, i * 0.05, 0.3, i * 0.05 + 0.02)))).toBe(false);
  });

  it('takes ten lines of words, or a fifth of the picture under words, as a page', () => {
    expect(isTextHeavy(Array.from({ length: 10 }, (_, i) => box(0.1, i * 0.05, 0.3, i * 0.05 + 0.02)))).toBe(true);
    expect(isTextHeavy([box(0, 0, 1, 0.12), box(0, 0.5, 1, 0.6)])).toBe(true);
  });
});

describe('chooseFaces', () => {
  const facesOf = async (albums: FaceAlbum[], sources: FaceSources) => {
    const { faces } = await chooseFaces(albums, sources);
    return faces;
  };

  it('leads with the favourites of the newest albums, then their covers, newest album first', async () => {
    const albums = ['a', 'b', 'c', 'd', 'e'].map((id) => album(id));
    const { sources, asked } = fake({
      favourites: { b: [picture('fav-b')], d: [picture('fav-d')] },
      pictures: albums.map(({ albumThumbnailAssetId }) => picture(albumThumbnailAssetId as string)),
    });

    const { faces, complete } = await chooseFaces(albums, sources);

    expect(faces).toEqual(['fav-b', 'fav-d', 'cover-a', 'cover-c', 'cover-e']);
    expect(complete).toBe(true);
    expect(asked.picture).toEqual(['cover-a', 'cover-c', 'cover-e']);
  });

  it('takes an album favourite with a camera over one without', async () => {
    const { sources } = fake({ favourites: { a: [plain('chat-photo', { isFavorite: true }), picture('camera')] } });

    expect(await facesOf([album('a')], sources)).toEqual(['camera']);
  });

  it('keeps out the covers that are no photo: a slip, a screenshot, a page of text', async () => {
    const albums = ['bank', 'shot', 'notes', 'trip'].map((id) => album(id));
    const { sources, asked } = fake({
      pictures: [
        plain('cover-bank', { tags: tagged('QR', 'Auto/Receipts'), visibility: AssetVisibility.Archive }),
        plain('cover-shot', { originalMimeType: 'image/png' }),
        plain('cover-notes'),
        picture('cover-trip'),
      ],
      text: ['cover-notes'],
    });

    expect(await facesOf(albums, sources)).toEqual(['cover-trip']);
    // only a picture without a camera's data has its text read
    expect(asked.textHeavy).toEqual(['cover-notes']);
  });

  it('takes a picture without a camera when its text says it is a photo', async () => {
    const { sources } = fake({ pictures: [plain('cover-a')] });

    expect(await facesOf([album('a')], sources)).toEqual(['cover-a']);
  });

  it('ranks a favourite cover with the favourites', async () => {
    const albums = [album('a'), album('b')];
    const { sources } = fake({ pictures: [picture('cover-a'), picture('cover-b', { isFavorite: true })] });

    expect(await facesOf(albums, sources)).toEqual(['cover-b', 'cover-a']);
  });

  it('shows videos only where there is no photo', async () => {
    const video = (id: string) => picture(id, { type: AssetTypeEnum.Video, exifInfo: {}, width: 1920, height: 1080 });
    const withPhoto = fake({ pictures: [video('cover-a'), picture('cover-b')] });
    const videosOnly = fake({ pictures: [video('cover-a'), video('cover-b')] });

    expect(await facesOf([album('a'), album('b')], withPhoto.sources)).toEqual(['cover-b']);
    expect(await facesOf([album('a'), album('b')], videosOnly.sources)).toEqual(['cover-a', 'cover-b']);
  });

  it('falls back to the covers that are no photo only when there is nothing else, and never to a slip', async () => {
    const albums = [album('bank'), album('scan'), album('shot')];
    const { sources } = fake({
      pictures: [
        picture('cover-bank', { tags: tagged('QR') }),
        picture('cover-scan', { tags: tagged('Auto/Documents'), visibility: AssetVisibility.Archive }),
        plain('cover-shot', { originalMimeType: 'image/png' }),
      ],
    });

    expect(await facesOf(albums, sources)).toEqual(['cover-scan', 'cover-shot']);
  });

  it('shows a photo once, though two albums have it for their cover', async () => {
    const albums = [album('a', 'shared'), album('b', 'shared'), album('c')];
    const { sources } = fake({ pictures: [picture('shared'), picture('cover-c')] });

    expect(await facesOf(albums, sources)).toEqual(['shared', 'cover-c']);
  });

  it('shows one photo from each album', async () => {
    const albums = [album('a'), album('b')];
    const { sources } = fake({
      favourites: { a: [picture('fav-a'), picture('fav-a-2')] },
      pictures: [picture('cover-a'), picture('cover-b')],
    });

    expect(await facesOf(albums, sources)).toEqual(['fav-a', 'cover-b']);
  });

  it('chooses spares beyond the four, and stops asking once it has them', async () => {
    const albums = Array.from({ length: 12 }, (_, i) => album(`a${i}`));
    const favourites = Object.fromEntries(albums.map(({ id }) => [id, [picture(`fav-${id}`)]]));
    const { sources, asked } = fake({ favourites });

    const { faces } = await chooseFaces(albums, sources);

    expect(faces).toHaveLength(FACES + SPARE);
    expect(faces[0]).toBe('fav-a0');
    // two rounds of four albums, then no covers at all
    expect(asked.favourites).toHaveLength(8);
    expect(asked.picture).toEqual([]);
  });

  it('asks about covers four at a time until the collage is full, then only for the spares', async () => {
    const albums = Array.from({ length: 10 }, (_, i) => album(`a${i}`));
    const { sources, asked } = fake({ pictures: albums.map(({ id }) => picture(`cover-${id}`)) });

    expect(await facesOf(albums, sources)).toHaveLength(FACES + SPARE);
    expect(asked.picture).toEqual(albums.slice(0, FACES + SPARE).map(({ id }) => `cover-${id}`));
  });

  it('asks for favourites in the newest albums only, and for covers in the newest COVER_ALBUMS', async () => {
    const albums = Array.from({ length: COVER_ALBUMS + 5 }, (_, i) => album(`a${i}`));
    const { sources, asked } = fake({ pictures: [] });

    expect(await facesOf(albums, sources)).toEqual([]);
    expect(asked.favourites).toEqual(albums.slice(0, FAVOURITE_ALBUMS).map(({ id }) => id));
    expect(asked.picture).toHaveLength(COVER_ALBUMS);
  });

  it('skips an album without a cover', async () => {
    const { sources, asked } = fake({ pictures: [picture('cover-b')] });

    expect(await facesOf([album('a', null), album('b')], sources)).toEqual(['cover-b']);
    expect(asked.favourites).toEqual(['b']);
  });

  it('says when a question failed, and chooses from the answers it had', async () => {
    const { sources } = fake({ pictures: [picture('cover-b')], fail: ['a', 'cover-a'] });

    expect(await chooseFaces([album('a'), album('b')], sources)).toEqual({ faces: ['cover-b'], complete: false });
  });
});

describe('spreadFaces', () => {
  it('gives each folder its first four that no folder before it shows', () => {
    expect(
      spreadFaces([
        ['x', 'a1', 'a2', 'a3', 'a4'],
        ['x', 'b1', 'b2', 'b3', 'b4'],
      ]),
    ).toEqual([
      ['x', 'a1', 'a2', 'a3'],
      ['b1', 'b2', 'b3', 'b4'],
    ]);
  });

  it('fills in with a photo shown before rather than show fewer', () => {
    expect(
      spreadFaces([
        ['x', 'y'],
        ['x', 'y', 'b1'],
      ]),
    ).toEqual([
      ['x', 'y'],
      ['b1', 'x', 'y'],
    ]);
  });

  it('leaves a folder without photos without photos', () => {
    expect(spreadFaces([[], ['a']])).toEqual([[], ['a']]);
  });
});

describe('faceKey', () => {
  it('changes with the folder, its newest albums and their covers, not with older ones', () => {
    const albums = Array.from({ length: COVER_ALBUMS + 2 }, (_, i) => album(`a${i}`));
    const key = faceKey('trips', albums);

    expect(faceKey('norway', albums)).not.toBe(key);
    expect(faceKey('trips', [album('new'), ...albums])).not.toBe(key);
    expect(faceKey('trips', [album('a0', 'another-cover'), ...albums.slice(1)])).not.toBe(key);
    expect(faceKey('trips', [...albums.slice(0, COVER_ALBUMS), album('older', 'cover-older')])).toBe(key);
  });
});
