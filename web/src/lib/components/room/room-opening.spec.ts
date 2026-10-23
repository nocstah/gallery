import { AssetTypeEnum } from '@immich/sdk';
import { BRIGHT, DIM, flatThumbhash } from '@test-data/thumbhash';
import { mayOpen, passesGate, roomOpening, SHARP_SIDE, wantsCamera, type OpeningPicture } from './room-opening';

// Local Omarchy layer: the picture each of Room's films opens on, by the gate before the TV (room-opening.ts)
const picture = (id: string, more: Partial<OpeningPicture> = {}): OpeningPicture => ({
  id,
  type: AssetTypeEnum.Image,
  isFavorite: false,
  thumbhash: BRIGHT,
  width: 4032,
  height: 3024,
  originalMimeType: 'image/heic',
  livePhotoVideoId: null,
  ...more,
});
const none = new Set<string>();
const tv = { camera: none, aspect: 16 / 9 };

describe('the gate before the TV', () => {
  it('lets an image open a film when a person kept it or a camera took it, and it is bright and sharp', () => {
    expect(passesGate(picture('kept', { isFavorite: true }), none)).toBe(true);
    expect(passesGate(picture('live', { livePhotoVideoId: 'clip' }), none)).toBe(true);
    expect(passesGate(picture('camera'), new Set(['camera']))).toBe(true);
    // a picture sent through a chat app, with no camera's data
    expect(passesGate(picture('sent'), none)).toBe(false);
  });

  it('keeps out a dim picture, one with too few pixels for the screen, a video and a screenshot', () => {
    const kept = { isFavorite: true };
    expect(passesGate(picture('night', { ...kept, thumbhash: DIM }), none)).toBe(false);
    expect(passesGate(picture('unknown', { ...kept, thumbhash: null }), none)).toBe(false);
    expect(passesGate(picture('small', { ...kept, width: 1600, height: SHARP_SIDE - 1 }), none)).toBe(false);
    expect(passesGate(picture('clip', { ...kept, type: AssetTypeEnum.Video }), none)).toBe(false);
    expect(mayOpen(picture('png', { ...kept, originalMimeType: 'image/png' }), none)).toBe(false);
    expect(mayOpen(picture('tall', { ...kept, width: 1179, height: 2556 }), none)).toBe(false);
  });

  it("asks for a camera's data only where it would decide", () => {
    expect(wantsCamera(picture('maybe'))).toBe(true);
    expect(wantsCamera(picture('kept', { isFavorite: true }))).toBe(false);
    expect(wantsCamera(picture('live', { livePhotoVideoId: 'clip' }))).toBe(false);
    expect(wantsCamera(picture('night', { thumbhash: DIM }))).toBe(false);
  });
});

describe('roomOpening', () => {
  it("opens on Curator's cover when it passes the gate", () => {
    const film = [picture('first', { isFavorite: true }), picture('cover', { isFavorite: true })];

    expect(roomOpening(film, { ...tv, cover: 'cover' })).toBe('cover');
  });

  it('opens a film whose cover is dim on a favourite that passes, one filling the screen before one shown whole', () => {
    const film = [
      picture('cover', { isFavorite: true, thumbhash: DIM }),
      picture('upright', { isFavorite: true, width: 3024, height: 4032 }),
      picture('camera', { width: 4032, height: 2268 }),
      picture('wide', { isFavorite: true, width: 4032, height: 2268 }),
    ];

    expect(roomOpening(film, { ...tv, cover: 'cover', camera: new Set(['camera']) })).toBe('wide');
  });

  it("then on a camera's photo that passes, in the film's order", () => {
    const film = [picture('sent'), picture('night', { thumbhash: DIM }), picture('first'), picture('second')];

    expect(roomOpening(film, { ...tv, camera: new Set(['first', 'second', 'night']) })).toBe('first');
  });

  it('opens where nothing passes on the brightest kept or camera photo, else as before', () => {
    // two dim camera photos, the second a little less so
    const dusk = [picture('a', { thumbhash: DIM }), picture('b', { thumbhash: flatThumbhash(60) })];
    expect(roomOpening(dusk, { ...tv, camera: new Set(['a', 'b']) })).toBe('b');
    expect(roomOpening([picture('sent'), picture('sent too')], { ...tv, cover: 'sent too' })).toBe('sent too');
    expect(roomOpening([picture('sent')], tv)).toBe('sent');
    expect(roomOpening([], tv)).toBeUndefined();
  });
});
