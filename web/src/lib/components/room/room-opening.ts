import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
import { FILL_KEEPS, keptShare } from '$lib/components/memories/film/film-plan';
import { thumbhashLight, DIM_BELOW } from '$lib/utils/thumbhash-light';

// Local Omarchy layer: the picture each of Room's films opens on, the one under its title card (DESIGN.md, Room). A
// film opened on Curator's cover, else on its first photo, whatever they were: the evening of the critique opened on a
// dim interior (critique 2026-10-23). The owner's decision, "Best photo, by the folder rule", with a gate before the
// TV: the opening is an image (no video), a favourite or a photo with a camera's data (no screenshot, no picture sent
// through a chat app), not dim (its thumbhash, utils/thumbhash-light: no image is downloaded to know it), and at least
// SHARP_SIDE pixels on its short side, since what reads as blurred across a room is a picture with too few pixels for
// the screen. Curator's cover opens the film when it passes; else the film's favourites that pass, then its camera
// photos, those that fill Room's frame first (a crop keeping FILL_KEEPS of them, as the film fills its frame), then
// in the film's order. Where nothing passes, the brightest favourite or camera photo that is not a screenshot, else the
// cover or the first photo as before. The rest of the film keeps its order: the film's plan moves the opening to the
// front and plays every other photo where it was.

/** The short side, in pixels, a picture needs to open a film across the room: a 1080p screen's height. */
export const SHARP_SIDE = 1080;
// a phone's screen is taller than 1.9:1 (utils/folder-faces); a camera's photos are JPEG or HEIC
const SCREEN_RATIO = 1.9;
const SCREEN_TYPES = new Set(['image/png', 'image/gif']);

export type OpeningPicture = Pick<
  AssetResponseDto,
  'id' | 'type' | 'isFavorite' | 'thumbhash' | 'width' | 'height' | 'originalMimeType' | 'livePhotoVideoId'
>;

/** What the opening is chosen with: Curator's cover, the pictures known to have a camera's data, the frame's shape. */
export type OpeningContext = { cover?: string | null; camera: ReadonlySet<string>; aspect: number };

/** A screenshot's file, or a screen's shape either way up (a phone's is longer than 1.9:1, a camera's photo is not). */
const isScreen = (picture: OpeningPicture) => {
  const [width, height] = [picture.width ?? 0, picture.height ?? 0];
  return (
    SCREEN_TYPES.has(picture.originalMimeType ?? '') ||
    (width > 0 && Math.max(width, height) >= Math.min(width, height) * SCREEN_RATIO)
  );
};

/** Bright enough (not dim) and sharp enough (pixels for the screen) to open a film. */
const passesLight = (picture: OpeningPicture) => {
  const light = thumbhashLight(picture.thumbhash);
  const shortSide = Math.min(picture.width ?? 0, picture.height ?? 0);
  return light !== undefined && light >= DIM_BELOW && shortSide >= SHARP_SIDE;
};

/** Whether a picture may open a film at all: an image a camera took or the person kept, not a screenshot. A Live Photo
 * is a camera's. */
export const mayOpen = (picture: OpeningPicture, camera: ReadonlySet<string>) =>
  picture.type === AssetTypeEnum.Image &&
  !isScreen(picture) &&
  (picture.isFavorite || !!picture.livePhotoVideoId || camera.has(picture.id));

/** Whether the camera's data would decide that a picture opens the film: one that passes every other gate. */
export const wantsCamera = (picture: OpeningPicture) =>
  picture.type === AssetTypeEnum.Image &&
  !picture.isFavorite &&
  !picture.livePhotoVideoId &&
  !isScreen(picture) &&
  passesLight(picture);

/** Whether a picture passes the gate before the TV. */
export const passesGate = (picture: OpeningPicture, camera: ReadonlySet<string>) =>
  mayOpen(picture, camera) && passesLight(picture);

const fills = (picture: OpeningPicture, aspect: number) =>
  !!picture.width && !!picture.height && keptShare(picture.width / picture.height, aspect) >= FILL_KEEPS;

/** The film's opening picture (see above); undefined for a film without pictures. */
export const roomOpening = (pictures: OpeningPicture[], { cover, camera, aspect }: OpeningContext) => {
  const curators = cover ? pictures.find(({ id }) => id === cover) : undefined;
  if (curators && passesGate(curators, camera)) {
    return curators.id;
  }
  const passing = pictures
    .map((picture, index) => ({ picture, index }))
    .filter(({ picture }) => passesGate(picture, camera))
    .sort(
      (a, b) =>
        Number(!a.picture.isFavorite) - Number(!b.picture.isFavorite) ||
        Number(!fills(a.picture, aspect)) - Number(!fills(b.picture, aspect)) ||
        a.index - b.index,
    );
  if (passing.length > 0) {
    return passing[0].picture.id;
  }
  let brightest: { id: string; light: number } | undefined;
  for (const picture of pictures) {
    const light = thumbhashLight(picture.thumbhash);
    if (mayOpen(picture, camera) && light !== undefined && (!brightest || light > brightest.light)) {
      brightest = { id: picture.id, light };
    }
  }
  return brightest?.id ?? curators?.id ?? pictures[0]?.id;
};
