import { AssetOrder } from '@immich/sdk';
import { FaceKind } from '$lib/utils/folder-faces';
import {
  choosePeriodFaces,
  LIST_MOST,
  listOrder,
  PeriodTier,
  type CoverPick,
  type ListedPicture,
  type PeriodPicture,
  type PeriodSources,
  type PeriodVerdict,
} from '$lib/utils/period-faces';
import { BRIGHT, DIM } from '@test-data/thumbhash';

// Local Omarchy layer: a year's or a month's face by the folder rule (utils/period-faces): favourites first, a camera's
// photos, never a screenshot or a page of words, videos only where there is nothing else, the bright before the dim

type Pick = 'favourite-newest' | 'favourite-oldest' | 'photo-newest' | 'photo-oldest' | 'video-newest';
type Library = {
  covers?: Record<string, Partial<Record<Pick, PeriodPicture>>>;
  verdicts?: Record<string, PeriodVerdict>;
  words?: Record<string, boolean>;
  lists?: Record<string, ListedPicture[]>;
};

const pickOf = ({ tier, order }: CoverPick): Pick =>
  `${['favourite', 'photo', 'video'][tier]}-${order === AssetOrder.Asc ? 'oldest' : 'newest'}` as Pick;

const sourcesOf = (library: Library) => {
  const calls = {
    covers: [] as { pick: Pick; timeBuckets: string[] }[],
    verdicts: [] as string[][],
    textHeavy: [] as string[],
    list: [] as string[],
  };
  const sources: PeriodSources = {
    covers: (timeBuckets, pick) => {
      calls.covers.push({ pick: pickOf(pick), timeBuckets });
      const found = new Map<string, PeriodPicture>();
      for (const timeBucket of timeBuckets) {
        const picture = library.covers?.[timeBucket]?.[pickOf(pick)];
        if (picture) {
          found.set(timeBucket, picture);
        }
      }
      return Promise.resolve(found);
    },
    verdicts: (ids) => {
      calls.verdicts.push(ids);
      const told = new Map<string, PeriodVerdict>();
      for (const id of ids) {
        const verdict = library.verdicts?.[id];
        if (verdict) {
          told.set(id, verdict);
        }
      }
      return Promise.resolve(told);
    },
    textHeavy: (id) => {
      calls.textHeavy.push(id);
      return Promise.resolve(library.words?.[id] ?? false);
    },
    list: (timeBucket, favourites) => {
      calls.list.push(favourites ? `${timeBucket} favourites` : timeBucket);
      return Promise.resolve(library.lists?.[favourites ? `${timeBucket} favourites` : timeBucket] ?? []);
    },
  };
  return { sources, calls };
};

const picture = (id: string, thumbhash: string | null = BRIGHT): PeriodPicture => ({ id, thumbhash, ratio: 1.5 });
const listed = (id: string, more: Partial<ListedPicture> = {}): ListedPicture => ({
  ...picture(id),
  isFavorite: false,
  isImage: true,
  live: false,
  ...more,
});
const photo = { kind: FaceKind.Photo };
const plain = { kind: FaceKind.Plain };
const screenshot = { kind: FaceKind.Not };
const video = { kind: FaceKind.Video };
const month = (timeBucket: string, count = 40) => ({ timeBucket, count });
const faceOf = async (library: Library, count = 40) => {
  const { sources, calls } = sourcesOf(library);
  const faces = await choosePeriodFaces([month('2025-03-01', count)], sources);
  return { face: faces.get('2025-03-01')?.id, calls };
};

describe('choosePeriodFaces', () => {
  it("fronts a period with its newest favourite photo with a camera's data, not the screenshot taken after it", async () => {
    const { face, calls } = await faceOf({
      covers: { '2025-03-01': { 'favourite-newest': picture('kept'), 'photo-newest': picture('screen') } },
      verdicts: { kept: photo, screen: screenshot },
    });

    expect(face).toBe('kept');
    // the favourite settled it: its other end is not asked for, and the screenshot is not looked at
    expect(calls.covers.map(({ pick }) => pick)).toEqual(['favourite-newest', 'photo-newest']);
    expect(calls.verdicts).toEqual([['kept']]);
  });

  it('gives a dim favourite up for a bright one at the other end of the period, never for a bright photo no one kept', async () => {
    const both = await faceOf({
      covers: {
        '2025-03-01': {
          'favourite-newest': picture('dim', DIM),
          'favourite-oldest': picture('bright'),
          'photo-newest': picture('other'),
        },
      },
      verdicts: { dim: photo, bright: photo, other: photo },
    });
    expect(both.face).toBe('bright');

    const onlyDim = await faceOf({
      covers: {
        '2025-03-01': {
          'favourite-newest': picture('dim', DIM),
          'favourite-oldest': picture('dim too', DIM),
          'photo-newest': picture('other'),
        },
      },
      verdicts: { dim: photo, 'dim too': photo, other: photo },
    });
    expect(onlyDim.face).toBe('dim');
  });

  it("without favourites, the newest photo with a camera's data; a screenshot there gives way to the oldest", async () => {
    const { face, calls } = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('screen'), 'photo-oldest': picture('camera') } },
      verdicts: { screen: screenshot, camera: photo },
    });

    expect(face).toBe('camera');
    // a period without favourites is not asked for its oldest favourite
    expect(calls.covers.map(({ pick }) => pick)).not.toContain('favourite-oldest');
  });

  it("counts a picture without a camera's data only when its text is no page of words, after a camera's photo", async () => {
    const words = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('letter'), 'photo-oldest': picture('scan') } },
      verdicts: { letter: plain, scan: plain },
      words: { letter: true, scan: false },
    });
    expect(words.face).toBe('scan');
    expect(words.calls.textHeavy).toEqual(['letter', 'scan']);

    const camera = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('scan'), 'photo-oldest': picture('camera') } },
      verdicts: { scan: plain, camera: photo },
    });
    expect(camera.face).toBe('camera');
    // the camera's photo led, so its words were asked for; the plain picture never led, so its were not
    expect(camera.calls.textHeavy).toEqual(['camera']);
  });

  it("gives a camera's photo of a page of words up too (a document photographed has a camera's data)", async () => {
    const { face, calls } = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('passport'), 'photo-oldest': picture('beach') } },
      verdicts: { passport: photo, beach: photo },
      words: { passport: true, beach: false },
    });

    expect(face).toBe('beach');
    expect(calls.textHeavy).toEqual(['passport', 'beach']);
  });

  it("lists a period whose ends do not qualify and asks about its likeliest pictures: favourites, a camera's Live Photos", async () => {
    const { face, calls } = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('screen'), 'photo-oldest': picture('screen too') } },
      verdicts: { screen: screenshot, 'screen too': screenshot, live: photo, other: photo },
      lists: {
        '2025-03-01': [
          listed('screen'),
          listed('other'),
          listed('clip', { isImage: false }),
          listed('live', { live: true }),
        ],
      },
    });

    expect(face).toBe('live');
    expect(calls.list).toEqual(['2025-03-01']);
    expect(calls.verdicts.at(-1)).toEqual(['live', 'other']);
  });

  it("looks through a period's favourites where neither end of them is a bright camera photo", async () => {
    const { face, calls } = await faceOf({
      covers: {
        '2025-03-01': {
          'favourite-newest': picture('sent'),
          'favourite-oldest': picture('night', DIM),
          'photo-newest': picture('other'),
        },
      },
      verdicts: { sent: plain, night: photo, kept: photo, other: photo },
      lists: {
        '2025-03-01 favourites': [
          listed('sent', { isFavorite: true }),
          listed('kept', { isFavorite: true, live: true }),
          listed('night', { isFavorite: true, thumbhash: DIM }),
        ],
      },
    });

    expect(face).toBe('kept');
    expect(calls.list).toEqual(['2025-03-01 favourites']);
    // only a picture that led was asked about its words; the plain favourite was overtaken before it led
    expect(calls.textHeavy).toEqual(['night', 'kept']);
  });

  it('does not list a period too large to, and shows a video only where there is nothing else', async () => {
    const large = await faceOf(
      {
        covers: { '2025-03-01': { 'photo-newest': picture('screen'), 'video-newest': picture('clip') } },
        verdicts: { screen: screenshot, clip: video },
      },
      LIST_MOST + 1,
    );
    expect(large.calls.list).toEqual([]);
    expect(large.face).toBe('clip');

    const withPhoto = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('camera'), 'video-newest': picture('clip') } },
      verdicts: { camera: photo, clip: video },
    });
    expect(withPhoto.face).toBe('camera');
    expect(withPhoto.calls.covers.map(({ pick }) => pick)).not.toContain('video-newest');
  });

  it("leaves a period without a face where nothing qualifies (the server's cover shows)", async () => {
    const { face } = await faceOf({
      covers: { '2025-03-01': { 'photo-newest': picture('screen') } },
      verdicts: { screen: screenshot },
    });

    expect(face).toBeUndefined();
  });

  it('asks each round in one request for all the periods it could still improve', async () => {
    const { sources, calls } = sourcesOf({
      covers: {
        '2025-03-01': { 'favourite-newest': picture('kept') },
        '2025-02-01': { 'favourite-newest': picture('dim', DIM), 'favourite-oldest': picture('bright') },
      },
      verdicts: { kept: photo, dim: photo, bright: photo },
    });

    const faces = await choosePeriodFaces([month('2025-03-01'), month('2025-02-01')], sources);

    expect([...faces.values()].map(({ id }) => id)).toEqual(['kept', 'bright']);
    expect(calls.covers).toEqual([
      { pick: 'favourite-newest', timeBuckets: ['2025-03-01', '2025-02-01'] },
      { pick: 'photo-newest', timeBuckets: ['2025-03-01', '2025-02-01'] },
      { pick: 'favourite-oldest', timeBuckets: ['2025-02-01'] },
    ]);
  });

  it('asks a timeline of favourites for favourites and videos only', async () => {
    const { sources, calls } = sourcesOf({});

    await choosePeriodFaces([month('2025-03-01')], sources, new Set([PeriodTier.Favourite, PeriodTier.Video]));

    expect(new Set(calls.covers.map(({ pick }) => pick))).toEqual(new Set(['favourite-newest', 'video-newest']));
  });

  it('leaves out what a failed question would have said', async () => {
    const { sources } = sourcesOf({
      covers: { '2025-03-01': { 'favourite-newest': picture('kept'), 'photo-newest': picture('camera') } },
      verdicts: { camera: photo },
    });
    sources.covers = (timeBuckets, pick) =>
      pick.tier === PeriodTier.Favourite
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(new Map([[timeBuckets[0], picture('camera')]]));

    const faces = await choosePeriodFaces([month('2025-03-01')], sources);

    expect(faces.get('2025-03-01')?.id).toBe('camera');
  });
});

describe('listOrder', () => {
  it("puts favourites first, then a camera's Live Photos, then a photo's shape, then the bright, else as listed", () => {
    const pictures = [
      listed('tall', { ratio: 9 / 19.5 }),
      listed('dim', { thumbhash: DIM }),
      listed('plain'),
      listed('live', { live: true }),
      listed('kept', { isFavorite: true }),
      listed('clip', { isImage: false }),
    ];

    expect(listOrder(pictures).map(({ id }) => id)).toEqual(['kept', 'live', 'plain', 'dim', 'tall']);
  });
});
