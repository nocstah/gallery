// Local Omarchy layer: which photos a folder card on the Albums page shows (managers/folder-faces draws on this). A folder
// showed the covers of its four newest albums as the server sent them, so "Other" was fronted by three bank-transfer
// slips with their amounts and QR codes, and "Home Life" by a screenshot of text (critique 2026-10-18). The owner's
// decision: "Photos only, best first". A folder's face is photos only, one from each album, newest album first: the
// favourite photos of its newest albums lead, then the albums' own covers that are photos; videos only where there is no
// photo, and the covers as they were only where there is nothing else, never a slip.
import {
  AssetTypeEnum,
  AssetVisibility,
  type AssetOcrResponseDto,
  type AssetResponseDto,
  type SharedSpaceLinkedAlbumDto,
} from '@immich/sdk';

/** How many photos a folder's collage shows. */
export const FACES = 4;
/** Favourites chosen beyond those, for when one of them already fronts a folder beside it (spreadFaces). */
export const SPARE = 2;
/** The newest albums whose favourites are looked for. */
export const FAVOURITE_ALBUMS = 8;
/** The newest albums whose own covers are looked at; nothing older is asked about. */
export const COVER_ALBUMS = 16;
/** Albums asked about at once, for one folder. */
const AT_ONCE = 4;

/** What a picture is, as a folder's face. */
export enum FaceKind {
  /** a photo with a camera's data, on the timeline */
  Photo = 'photo',
  /** an image on the timeline without a camera's data (sent through a chat app, scanned, or a screenshot): a photo
   * unless its text says it is a page of words */
  Plain = 'plain',
  /** a video on the timeline, not a recording of a screen */
  Video = 'video',
  /** not a photo: kept out of Photos (the special albums, Gallery's Documents), a document or a screenshot. A face only
   * when the folder has nothing else */
  Not = 'not',
  /** a bank slip or a receipt (QR's, Gallery's Receipts), or the Locked Folder's: never on a face */
  Never = 'never',
}

export type FacePicture = Pick<
  AssetResponseDto,
  'id' | 'type' | 'visibility' | 'isFavorite' | 'originalMimeType' | 'exifInfo' | 'tags' | 'width' | 'height'
>;
export type FaceAlbum = Pick<SharedSpaceLinkedAlbumDto, 'id' | 'albumThumbnailAssetId'>;

/** Where a folder's faces are read from (managers/folder-faces: Gallery's search, the photo, its recognised text). */
export type FaceSources = {
  /** a few of an album's favourite photos on the timeline, newest first */
  favourites: (albumId: string) => Promise<FacePicture[]>;
  /** a photo by its id, its tags with it */
  picture: (assetId: string) => Promise<FacePicture>;
  /** whether a photo holds a page of words (isTextHeavy over its recognised text) */
  textHeavy: (assetId: string) => Promise<boolean>;
};

/** The faces, and whether every question was answered (a failed one leaves its album out; the answer is not kept). */
export type FaceChoice = { faces: string[]; complete: boolean };

// QR's tag (the special album tags what it holds) and Gallery's own classification, which tags and archives receipts and
// documents (and once screenshots): what these mark is never a photo
const SLIPS = new Set(['QR', 'Auto/Receipts']);
const PAGES = new Set(['Auto/Documents', 'Auto/Screenshots']);
// a phone's screen is taller than 1.9:1 (9:19.5 these days); a photo is 4:3, 3:2 or 16:9
const SCREEN_RATIO = 1.9;
// image types a screenshot, a sticker or a meme comes as; a camera's photos are JPEG or HEIC
const SCREEN_TYPES = new Set(['image/png', 'image/gif']);
// Gallery's text recognition finds a box per line of words. On the owner's library (160 images without camera data):
// 115 had none, rooms with a watermark 1 to 6 boxes over 3% of the picture, a snack bag 7 over 12%, a payment card held
// up 10, posters 14, monitors full of text 19, the screenshot that fronted Home Life 73 over half of it
const TEXT_LINES = 10;
const TEXT_SHARE = 0.2;

const boxArea = ({ x1, x2, x3, x4, y1, y2, y3, y4 }: AssetOcrResponseDto) =>
  (Math.max(x1, x2, x3, x4) - Math.min(x1, x2, x3, x4)) * (Math.max(y1, y2, y3, y4) - Math.min(y1, y2, y3, y4));

/** Whether the text recognised in a picture makes it a page of words rather than a photo. */
export const isTextHeavy = (boxes: AssetOcrResponseDto[]) =>
  boxes.length >= TEXT_LINES || boxes.reduce((share, box) => share + boxArea(box), 0) >= TEXT_SHARE;

/**
 * What a picture is as a folder's face, from what Gallery knows of it (no text recognition: see FaceKind.Plain).
 * `camera` says whether it has a camera's data where its EXIF was not asked for (a search that finds only pictures with
 * a camera make: managers/period-faces); left out, its EXIF says.
 */
export const faceKind = (
  picture: FacePicture,
  camera = !!(picture.exifInfo?.make || picture.exifInfo?.model),
): FaceKind => {
  const tags = picture.tags?.map(({ value }) => value) ?? [];
  if (
    tags.some((tag) => SLIPS.has(tag)) ||
    picture.visibility === AssetVisibility.Locked ||
    picture.visibility === AssetVisibility.Hidden
  ) {
    return FaceKind.Never;
  }
  if (picture.visibility !== AssetVisibility.Timeline || tags.some((tag) => PAGES.has(tag))) {
    return FaceKind.Not;
  }
  const width = picture.width ?? picture.exifInfo?.exifImageWidth ?? 0;
  const height = picture.height ?? picture.exifInfo?.exifImageHeight ?? 0;
  const screen = !camera && width > 0 && height >= width * SCREEN_RATIO;
  if (picture.type === AssetTypeEnum.Video) {
    return screen ? FaceKind.Not : FaceKind.Video;
  }
  if (picture.type !== AssetTypeEnum.Image) {
    return FaceKind.Not;
  }
  if (camera) {
    return FaceKind.Photo;
  }
  return screen || SCREEN_TYPES.has(picture.originalMimeType ?? '') ? FaceKind.Not : FaceKind.Plain;
};

/** Which questions a folder's faces depend on: its folder and its newest albums with their covers. */
export const faceKey = (folderId: string, albums: FaceAlbum[]) =>
  `${folderId}:${albums
    .slice(0, COVER_ALBUMS)
    .map(({ id, albumThumbnailAssetId }) => `${id}/${albumThumbnailAssetId}`)
    .join(',')}`;

// how a face ranks: a favourite photo, a photo, a video, the last resort
enum Rank {
  Favourite,
  Photo,
  Video,
  Last,
}

type Found = { id: string; rank: Rank; order: number };

/**
 * The photos a folder can show, best first: one from each album, at most FACES and SPARE more. `albums` are the
 * folder's albums with a cover, newest first (FolderSummary.albums). The favourites of the newest FAVOURITE_ALBUMS come
 * first, then the covers of the newest COVER_ALBUMS that are photos, each kind newest album first; a favourite photo as
 * an album's cover ranks as a favourite. A picture without a camera's data counts only when its text says it is no page
 * of words. Videos show only where there is no photo; the covers that are no photo (documents, screenshots, what is
 * archived) only where there is nothing else, and never a slip or a receipt. Each step asks about AT_ONCE albums at a
 * time and stops once it has FACES and SPARE of its best kind; the covers, once the collage is full, only as many at a
 * time as spares are still wanted.
 */
export const chooseFaces = async (albums: FaceAlbum[], sources: FaceSources): Promise<FaceChoice> => {
  const candidates = albums.filter((album) => album.albumThumbnailAssetId).slice(0, COVER_ALBUMS);
  const found: Found[] = [];
  const used = new Set<string>();
  const faced = new Set<string>();
  let complete = true;

  const take = (album: FaceAlbum, id: string, rank: Rank, order: number) => {
    if (!used.has(id)) {
      used.add(id);
      faced.add(album.id);
      found.push({ id, rank, order });
    }
  };
  const count = (best: Rank) => found.filter(({ rank }) => rank <= best).length;
  const failed = () => {
    complete = false;
    return undefined;
  };
  const clean = (id: string) =>
    sources
      .textHeavy(id)
      .then((heavy) => !heavy)
      .catch(failed);

  // an album's favourite: the first with a camera's data, else the first plain one, that is no page of words (a camera's
  // photo of a document has a camera's data too)
  const favouriteOf = async (album: FaceAlbum) => {
    const favourites = await sources.favourites(album.id).catch(failed);
    const pictures = (favourites ?? []).filter(({ id }) => !used.has(id));
    for (const kind of [FaceKind.Photo, FaceKind.Plain]) {
      for (const picture of pictures) {
        if (faceKind(picture) === kind && (await clean(picture.id))) {
          return picture.id;
        }
      }
    }
  };

  // an album's own cover, ranked
  const coverOf = async (album: FaceAlbum): Promise<Rank | undefined> => {
    const picture = await sources.picture(album.albumThumbnailAssetId as string).catch(failed);
    if (!picture) {
      return;
    }
    const photo = picture.isFavorite ? Rank.Favourite : Rank.Photo;
    switch (faceKind(picture)) {
      case FaceKind.Photo:
      case FaceKind.Plain: {
        const words = await clean(picture.id);
        return words === undefined ? undefined : words ? photo : Rank.Last;
      }
      case FaceKind.Video: {
        return Rank.Video;
      }
      case FaceKind.Not: {
        return Rank.Last;
      }
      case FaceKind.Never: {
        return undefined;
      }
    }
  };

  const wanted = FACES + SPARE;
  const newest = candidates.slice(0, FAVOURITE_ALBUMS);
  for (let start = 0; start < newest.length && count(Rank.Favourite) < wanted; start += AT_ONCE) {
    const chunk = newest.slice(start, start + AT_ONCE);
    const ids = await Promise.all(chunk.map((album) => favouriteOf(album)));
    for (const [index, album] of chunk.entries()) {
      const id = ids[index];
      if (id) {
        take(album, id, Rank.Favourite, start + index);
      }
    }
  }

  for (let start = 0; start < candidates.length && count(Rank.Photo) < wanted;) {
    const photos = count(Rank.Photo);
    const size = photos < FACES ? AT_ONCE : wanted - photos;
    const chunk = candidates
      .slice(start, start + size)
      .map((album, index) => ({ album, order: start + index }))
      .filter(({ album }) => !faced.has(album.id) && !used.has(album.albumThumbnailAssetId as string));
    start += size;
    const ranks = await Promise.all(chunk.map(({ album }) => coverOf(album)));
    for (const [index, { album, order }] of chunk.entries()) {
      const rank = ranks[index];
      if (rank !== undefined) {
        take(album, album.albumThumbnailAssetId as string, rank, order);
      }
    }
  }

  const best = (rank: Rank) =>
    found
      .filter((face) => (rank === Rank.Photo ? face.rank <= Rank.Photo : face.rank === rank))
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .slice(0, wanted)
      .map(({ id }) => id);
  const faces = [Rank.Photo, Rank.Video, Rank.Last].map((rank) => best(rank)).find((ids) => ids.length > 0) ?? [];
  return { faces, complete };
};

/**
 * The photos each folder of a level shows (`chosen`: chooseFaces' for each, in the order the level shows them): its first
 * FACES that no folder before it shows, so one photo (in albums of two folders) does not front both; one already shown
 * fills in only where the folder would otherwise show fewer than it can.
 */
export const spreadFaces = (chosen: string[][]): string[][] => {
  const shown = new Set<string>();
  return chosen.map((ids) => {
    const fresh = ids.filter((id) => !shown.has(id));
    const faces = [...fresh, ...ids.filter((id) => shown.has(id))].slice(0, FACES);
    for (const id of faces) {
      shown.add(id);
    }
    return faces;
  });
};
