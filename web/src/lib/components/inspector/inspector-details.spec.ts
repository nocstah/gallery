import {
  AssetVisibility,
  type AlbumResponseDto,
  type AssetResponseDto,
  type TimeBucketAssetResponseDto,
} from '@immich/sdk';
import {
  albumYearsOf,
  cameraOf,
  dayKeyOf,
  dayPhotosOf,
  descriptionOf,
  exposureOf,
  fileFactsOf,
  InspectorDayLoader,
  InspectorDetailsLoader,
  InspectorStories,
  peopleOf,
  placeOf,
  takenOf,
} from '$lib/components/inspector/inspector-details';
import { albumFactory } from '@test-data/factories/album-factory';
import { assetFactory } from '@test-data/factories/asset-factory';
import { personFactory } from '@test-data/factories/person-factory';

// Local Omarchy layer: what the inspector window asks about a photo, and how it says it.

/** an asset request that answers after `ms`, or fails as fetch does when its signal is aborted */
const slowAsset = (ms: number, signals: AbortSignal[] = []) => {
  return (id: string, signal: AbortSignal) =>
    new Promise<AssetResponseDto>((resolve, reject) => {
      signals.push(signal);
      const timer = setTimeout(() => resolve(assetFactory.build({ id })), ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
};

describe('InspectorDetailsLoader', () => {
  it('cancels the photo before when a newer one is asked for', async () => {
    const signals: AbortSignal[] = [];
    const loader = new InspectorDetailsLoader({ asset: slowAsset(20, signals), albums: () => Promise.resolve([]) });

    const first = loader.load('one');
    const second = loader.load('two');

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toMatchObject({ asset: { id: 'two' }, albums: [] });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('keeps the photos shown last, so going back over them asks nothing', async () => {
    const asset = vi.fn(slowAsset(1));
    const albums = vi.fn(() => Promise.resolve([albumFactory.build()]));
    const loader = new InspectorDetailsLoader({ asset, albums }, 2);

    await loader.load('one');
    await loader.load('two');
    await loader.load('one');
    expect(asset).toHaveBeenCalledTimes(2);

    // past its size the one used longest ago goes ('two', since 'one' was used again)
    await loader.load('three');
    await loader.load('one');
    expect(asset).toHaveBeenCalledTimes(3);
    await loader.load('two');
    expect(asset).toHaveBeenCalledTimes(4);
  });

  it('shows a photo whose albums could not be read, without albums', async () => {
    const loader = new InspectorDetailsLoader({
      asset: slowAsset(1),
      albums: () => Promise.reject(new Error('albums failed')),
    });
    await expect(loader.load('one')).resolves.toMatchObject({ asset: { id: 'one' }, albums: [] });
  });

  it('passes on a failure of the photo itself', async () => {
    const loader = new InspectorDetailsLoader({
      asset: () => Promise.reject(new Error('gone')),
      albums: () => Promise.resolve([]),
    });
    await expect(loader.load('one')).rejects.toThrow('gone');
  });
});

/** a day as the timeline sends it: newest first, in columns */
const dayBucket = (ids: string[], times: string[]): TimeBucketAssetResponseDto =>
  ({
    id: ids,
    ownerId: ids.map(() => 'me'),
    ratio: ids.map(() => 1.5),
    thumbhash: ids.map((id) => `hash-${id}`),
    fileCreatedAt: times,
    localOffsetHours: ids.map(() => 7),
    createdAt: times,
    visibility: ids.map(() => AssetVisibility.Timeline),
    isFavorite: ids.map(() => false),
    isTrashed: ids.map(() => false),
    isImage: ids.map((id) => id !== 'clip'),
    duration: ids.map((id) => (id === 'clip' ? 12_000 : null)),
    projectionType: ids.map(() => null),
    livePhotoVideoId: ids.map(() => null),
    city: ids.map(() => 'Riverton'),
    country: ids.map(() => 'Thailand'),
    stack: ids.map((id) => (id === 'burst' ? ['stack-1', '3'] : id === 'lone' ? ['stack-2', '1'] : null)),
  }) as TimeBucketAssetResponseDto;

describe('the day around the photo', () => {
  it("names a photo's day on its own clock", () => {
    expect(dayKeyOf({ localDateTime: '2026-10-11T09:23:13.681Z' })).toBe('2026-10-11');
    expect(dayKeyOf({ localDateTime: '' })).toBeUndefined();
    expect(dayKeyOf(undefined)).toBeUndefined();
  });

  it('lays the day out from the first photo taken to the last, a stack as its cover', () => {
    const photos = dayPhotosOf(
      dayBucket(
        ['clip', 'burst', 'lone'],
        ['2026-10-11T12:00:00.000Z', '2026-10-11T03:10:00.000Z', '2026-10-11T02:00:00.000Z'],
      ),
    );
    expect(photos.map(({ id }) => id)).toEqual(['lone', 'burst', 'clip']);
    expect(photos[0].stack).toBeNull();
    expect(photos[1].stack).toEqual({ id: 'stack-1', primaryAssetId: 'burst', assetCount: 3 });
    expect(photos[2]).toMatchObject({ isVideo: true, duration: 12_000 });
    // on the camera's clock, seven hours ahead
    expect(photos[0].localDateTime).toMatchObject({ day: 11, hour: 9 });
  });

  it('asks for a day once, cancels it for the next one, and keeps the days seen last', async () => {
    const signals: AbortSignal[] = [];
    const fetchDay = vi.fn(
      (day: string, signal: AbortSignal) =>
        new Promise<TimeBucketAssetResponseDto>((resolve, reject) => {
          signals.push(signal);
          const timer = setTimeout(() => resolve(dayBucket([`${day}-a`], [`${day}T05:00:00.000Z`])), 5);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const loader = new InspectorDayLoader(fetchDay, 2);

    // two photos of one day share the request; a photo of another day cancels it
    const first = loader.load('2026-10-10');
    const again = loader.load('2026-10-10');
    expect(fetchDay).toHaveBeenCalledTimes(1);
    const second = loader.load('2026-10-11');
    await expect(first).resolves.toBeUndefined();
    await expect(again).resolves.toBeUndefined();
    expect(signals[0].aborted).toBe(true);
    await expect(second).resolves.toMatchObject({ key: '2026-10-11', photos: [{ id: '2026-10-11-a' }] });

    // back to a day seen lately: nothing asked
    await loader.load('2026-10-12');
    await loader.load('2026-10-11');
    expect(fetchDay).toHaveBeenCalledTimes(3);
    // past its size the day used longest ago goes
    await loader.load('2026-10-13');
    await loader.load('2026-10-12');
    expect(fetchDay).toHaveBeenCalledTimes(5);
  });
});

describe('InspectorStories', () => {
  it('tells the first album that has a story, asking each album once', async () => {
    const [plain, trip, other] = albumFactory.buildList(3);
    const ask = vi.fn((albumId: string) =>
      Promise.resolve(albumId === plain.id ? null : { text: `story of ${albumId}`, model: 'text', written_at: '' }),
    );
    const stories = new InspectorStories(ask);

    await expect(stories.first([plain, trip, other])).resolves.toMatchObject({
      album: { id: trip.id },
      story: { text: `story of ${trip.id}` },
    });
    await stories.first([trip, plain]);
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it('asks only the first few albums, and says none when none has a story', async () => {
    const albums = albumFactory.buildList(7);
    const ask = vi.fn(() => Promise.resolve(null));
    await expect(new InspectorStories(ask).first(albums as AlbumResponseDto[])).resolves.toBeNull();
    expect(ask).toHaveBeenCalledTimes(4);
  });
});

describe('what the inspector says of a photo', () => {
  it('says when it was taken on the camera’s own clock, with its time zone', () => {
    const asset = assetFactory.build({
      localDateTime: '2009-03-14T14:32:05.000Z',
      exifInfo: { dateTimeOriginal: '2009-03-14T07:32:05.000Z', timeZone: 'Asia/Bangkok' },
    });
    const taken = takenOf(asset, 'en-GB')!;
    expect(taken.day.map((part) => part.value).join('')).toBe('14 March 2009');
    expect(taken.day.find((part) => part.type === 'year')?.value).toBe('2009');
    expect(taken.time).toContain('14:32:05');
    expect(taken.time).toContain('GMT+07:00');
  });

  it('falls back on the local time the server worked out, without a zone', () => {
    const asset = assetFactory.build({ localDateTime: '1977-07-02T09:05:00.000Z', exifInfo: {} });
    const taken = takenOf(asset, 'de')!;
    expect(taken.day.map((part) => part.value).join('')).toBe('2. Juli 1977');
    expect(taken.time).not.toContain('GMT');
  });

  it('names the place once and the camera’s maker once', () => {
    expect(placeOf({ city: 'Bangkok', state: 'Bangkok', country: 'Thailand' })).toBe('Bangkok, Thailand');
    expect(placeOf({ city: 'Riverton', state: 'Phuket', country: 'Thailand' })).toBe('Riverton, Phuket, Thailand');
    expect(placeOf(undefined)).toBe('');
    expect(cameraOf({ make: 'Canon', model: 'Canon EOS 5D Mark II' })).toBe('Canon EOS 5D Mark II');
    expect(cameraOf({ make: 'NIKON CORPORATION', model: 'NIKON D750' })).toBe('NIKON D750');
    expect(cameraOf({ make: 'Apple', model: 'iPhone 16 Pro' })).toBe('Apple iPhone 16 Pro');
    expect(cameraOf({ make: 'Apple' })).toBe('Apple');
  });

  it('writes the exposure and the file as the Info panel does', () => {
    expect(exposureOf({ fNumber: 2.8, exposureTime: '1/200', iso: 400, focalLength: 50 }, 'en')).toEqual([
      'ƒ/2.8',
      '1/200 s',
      'ISO 400',
      '50 mm',
    ]);
    expect(exposureOf({ fNumber: 1.8 }, 'de')).toEqual(['ƒ/1,8']);
    const asset = assetFactory.build({ width: 4032, height: 3024, exifInfo: { fileSizeInByte: 2_621_440 } });
    expect(fileFactsOf(asset, 'en')).toEqual(['12 MP', '4032 × 3024', '2.5 MiB']);
  });

  it('lists the named people and counts the rest, leaving out the hidden', () => {
    const asset = assetFactory.build({
      people: [
        personFactory.build({ name: 'A', isHidden: false }),
        personFactory.build({ name: '', isHidden: false }),
        personFactory.build({ name: ' ', isHidden: false }),
        personFactory.build({ name: 'Hidden', isHidden: true }),
      ],
    });
    const people = peopleOf(asset);
    expect(people.named.map((person) => person.name)).toEqual(['A']);
    expect(people.unnamed).toBe(2);
  });

  it('tells a description Curator wrote by its mark', () => {
    expect(descriptionOf(assetFactory.build({ exifInfo: { description: 'Two boats on a beach. (AI)' } }))).toEqual({
      text: 'Two boats on a beach.',
      byCurator: true,
    });
    expect(descriptionOf(assetFactory.build({ exifInfo: { description: ' Our first house ' } }))).toEqual({
      text: 'Our first house',
      byCurator: false,
    });
    expect(descriptionOf(assetFactory.build({ exifInfo: undefined }))).toEqual({ text: '', byCurator: false });
  });

  it('gives an album the years its photos span', () => {
    expect(albumYearsOf({ startDate: '2019-03-01T00:00:00.000Z', endDate: '2019-04-01T00:00:00.000Z' })).toBe('2019');
    expect(albumYearsOf({ startDate: '2019-03-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' })).toBe(
      '2019–2021',
    );
    expect(albumYearsOf({})).toBe('');
  });
});
