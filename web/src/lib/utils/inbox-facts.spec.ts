import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { init, register, t, waitLocale, type MessageFormatter } from 'svelte-i18n';
import { get } from 'svelte/store';
import type { Suggestion } from '$lib/utils/curator';
import {
  cardWords,
  clipLength,
  FACTS_AT_ONCE,
  factsOf,
  InboxFactsLoader,
  namesFile,
  photoSubject,
  type InboxFacts,
} from '$lib/utils/inbox-facts';
import { assetFactory } from '@test-data/factories/asset-factory';

// Local Omarchy layer: an AI inbox card about one photo or clip, by when and where (the owner's "Inbox cards by when
// and where"). Places and names are stand-ins.

let $t: MessageFormatter;

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
  $t = get(t);
});

const card = (fields: Partial<Suggestion>): Pick<Suggestion, 'kind' | 'asset_ids' | 'payload'> => ({
  kind: 'asset.archive',
  asset_ids: ['clip'],
  payload: { asset_id: 'clip', reasons: ['short'] },
  ...fields,
});

const asset = (fields: Partial<AssetResponseDto>): AssetResponseDto =>
  assetFactory.build({
    type: AssetTypeEnum.Video,
    localDateTime: '2019-10-11T15:55:06.000Z',
    exifInfo: { city: 'Riverton', state: 'Hill County', country: 'Testland' },
    duration: 100,
    originalFileName: 'IMG_5398.MOV',
    visibility: AssetVisibility.Timeline,
    isTrashed: false,
    isArchived: false,
    livePhotoVideoId: null,
    stack: null,
    ...fields,
  });

const facts = (fields: Partial<InboxFacts> = {}): InboxFacts => ({
  day: { year: 2019, month: 10, day: 11 },
  place: 'Riverton',
  duration: 100,
  live: null,
  stack: null,
  state: null,
  fileName: 'IMG_5398.MOV',
  ...fields,
});

describe('photoSubject', () => {
  it('is the photo a change to one photo is about', () => {
    expect(photoSubject(card({}))).toBe('clip');
    expect(photoSubject(card({ kind: 'asset.tag', asset_ids: ['a', 'a'], payload: { tag: 'Auto/Receipts' } }))).toBe(
      'a',
    );
    expect(photoSubject(card({ kind: 'qr.file', asset_ids: ['slip'], payload: {} }))).toBe('slip');
  });

  it("is a new version's original, a burst's cover for its animation, never a collage's", () => {
    const restore = { kind: 'restore.publish', asset_ids: ['f1', 'f2', 'f3'] };
    expect(photoSubject(card({ ...restore, payload: { asset_id: 'cover', variant: 'animation' } }))).toBe('cover');
    expect(photoSubject(card({ ...restore, payload: { asset_id: 'print', variant: 'restored' } }))).toBe('print');
    expect(photoSubject(card({ ...restore, payload: { asset_id: 'cover', variant: 'collage' } }))).toBeUndefined();
  });

  it('is none for many photos, people, albums or tags', () => {
    expect(photoSubject(card({ kind: 'asset.location', asset_ids: ['a', 'b'], payload: { items: [] } }))).toBe(
      undefined,
    );
    expect(photoSubject(card({ kind: 'album.create', asset_ids: ['a'], payload: { asset_ids: ['a'] } }))).toBe(
      undefined,
    );
    expect(photoSubject(card({ kind: 'tag.retire', asset_ids: ['a'], payload: { tag_id: 't' } }))).toBeUndefined();
    expect(photoSubject(card({ kind: 'person.hide', asset_ids: ['a'], payload: { person_id: 'p' } }))).toBe(undefined);
  });
});

describe('factsOf', () => {
  it('takes the day on its own clock, the city and a clip’s length', () => {
    expect(factsOf(asset({}))).toEqual(facts());
  });

  it('takes the country where there is no city, and nothing where there is neither', () => {
    expect(factsOf(asset({ exifInfo: { city: null, country: 'Testland' } })).place).toBe('Testland');
    expect(factsOf(asset({ exifInfo: { city: '  ', country: null } })).place).toBeNull();
    expect(factsOf(asset({ exifInfo: undefined })).place).toBeNull();
  });

  it('says a Live Photo, and the video Gallery hides with one (its livePhotoVideoId pairing)', () => {
    expect(factsOf(asset({ type: AssetTypeEnum.Image, duration: null, livePhotoVideoId: 'motion' })).live).toBe(
      'photo',
    );
    expect(factsOf(asset({ visibility: AssetVisibility.Hidden })).live).toBe('video');
    expect(factsOf(asset({})).live).toBeNull();
  });

  it('says the stack it lies in, and the Trash before the Archive', () => {
    expect(factsOf(asset({ stack: { id: 's', assetCount: 3, primaryAssetId: 'p' } })).stack).toBe(3);
    expect(factsOf(asset({ isTrashed: true, visibility: AssetVisibility.Archive })).state).toBe('trashed');
    expect(factsOf(asset({ isArchived: true, visibility: AssetVisibility.Archive })).state).toBe('archived');
  });

  it('gives a photo no length', () => {
    expect(factsOf(asset({ type: AssetTypeEnum.Image, duration: null })).duration).toBeNull();
  });
});

describe('namesFile', () => {
  it('knows a title that is its file’s name or stem', () => {
    expect(namesFile('IMG_5398.MOV', 'IMG_5398.MOV')).toBe(true);
    expect(namesFile('IMG_1253, restored', 'IMG_1253.JPG')).toBe(true);
    expect(namesFile('img_0861, animated', 'IMG_0861.HEIC')).toBe(true);
    expect(namesFile('2024-03-02 10.15.00.jpg → 2 Mar 2024 10:15', '2024-03-02 10.15.00.jpg')).toBe(true);
  });

  it('never takes a title that only starts like the name', () => {
    expect(namesFile('IMG_0861_edited, animated', 'IMG_0861.HEIC')).toBe(false);
    expect(namesFile('03 photos from the trip', '0.jpg')).toBe(false);
    expect(namesFile('Burst of 4, 2 Mar 2019', '1234567.JPG')).toBe(false);
    expect(namesFile('A dog on the beach', 'IMG_1.JPG')).toBe(false);
  });
});

describe('clipLength', () => {
  it('says a clip under two seconds in tenths, as Curator does', () => {
    expect(clipLength(100, $t, 'en-US')).toBe('0.1 s');
    expect(clipLength(67, $t, 'en-US')).toBe('0.1 s');
    expect(clipLength(1940, $t, 'en-US')).toBe('1.9 s');
    expect(clipLength(498, $t, 'de')).toBe('0,5 s');
  });

  it('says any other as every duration reads', () => {
    expect(clipLength(18_400, $t, 'en-US')).toBe('0:18');
    expect(clipLength(3_723_000, $t, 'en-US')).toBe('1:02:03');
  });

  it('says nothing for a photo', () => {
    expect(clipLength(null, $t)).toBe('');
    expect(clipLength(0, $t)).toBe('');
  });
});

describe('cardWords', () => {
  it('heads a card titled by its file by when and where, the file’s name on the line under it', () => {
    expect(cardWords('IMG_5398.MOV', facts({ stack: 3 }), $t, 'en-US')).toEqual({
      heading: 'Oct 11, 2019 · Riverton · 0.1 s',
      line: 'IMG_5398.MOV · In a stack of 3 photos',
      byFacts: true,
    });
  });

  it('says a Live Photo, the video of one, and the Trash or the Archive', () => {
    expect(cardWords('IMG_5398.MOV', facts({ live: 'video', state: 'trashed' }), $t, 'en-US').line).toBe(
      'IMG_5398.MOV · Part of a Live Photo · In the Trash',
    );
    expect(
      cardWords(
        'IMG_0861, animated',
        facts({ fileName: 'IMG_0861.HEIC', duration: null, live: 'photo', stack: 9, state: 'archived' }),
        $t,
        'en-US',
      ),
    ).toEqual({
      heading: 'Oct 11, 2019 · Riverton',
      line: 'IMG_0861.HEIC · Live Photo · In a stack of 9 photos · In the Archive',
      byFacts: true,
    });
  });

  it('leaves out the place where Gallery has none', () => {
    expect(
      cardWords('IMG_1253, restored', facts({ fileName: 'IMG_1253.JPG', place: null, duration: null }), $t, 'en-US'),
    ).toEqual({ heading: 'Oct 11, 2019', line: 'IMG_1253.JPG', byFacts: true });
  });

  it('keeps a title of its own, with when and where on the line', () => {
    expect(cardWords('A dog on the beach', facts({ fileName: 'IMG_1.JPG', duration: null }), $t, 'en-US')).toEqual({
      heading: 'A dog on the beach',
      line: 'Oct 11, 2019 · Riverton',
      byFacts: false,
    });
  });

  it('keeps the title, and an empty line, until the facts are in or where none came', () => {
    expect(cardWords('IMG_5398.MOV', undefined, $t)).toEqual({ heading: 'IMG_5398.MOV', line: '', byFacts: false });
    expect(cardWords('IMG_5398.MOV', null, $t)).toEqual({ heading: 'IMG_5398.MOV', line: '', byFacts: false });
  });
});

describe('InboxFactsLoader', () => {
  const deferred = () => {
    let resolve!: (asset: AssetResponseDto) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<AssetResponseDto>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  };

  it('asks a few at a time, each photo once, and keeps what came', async () => {
    const asked: string[] = [];
    const answers = new Map<string, ReturnType<typeof deferred>>();
    const loader = new InboxFactsLoader((id) => {
      asked.push(id);
      const answer = deferred();
      answers.set(id, answer);
      return answer.promise;
    });
    const ids = Array.from({ length: FACTS_AT_ONCE + 2 }, (_, n) => `a${n}`);

    loader.request(...ids, 'a0', undefined);
    expect(asked).toEqual(ids.slice(0, FACTS_AT_ONCE));

    answers.get('a0')!.resolve(asset({ originalFileName: 'a0.MOV' }));
    await vi.waitFor(() => expect(asked).toHaveLength(FACTS_AT_ONCE + 1));
    expect(loader.get('a0')?.fileName).toBe('a0.MOV');

    answers.get('a1')!.reject(new Error('400'));
    await vi.waitFor(() => expect(loader.get('a1')).toBeNull());
    expect(asked).toHaveLength(FACTS_AT_ONCE + 2);

    loader.request('a0', 'a1');
    expect(asked).toHaveLength(FACTS_AT_ONCE + 2);
    expect(loader.get('a2')).toBeUndefined();
  });

  it('asks nothing more once the page has gone, and cancels what is on its way', async () => {
    const signals: AbortSignal[] = [];
    const loader = new InboxFactsLoader((_id, signal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    loader.request('a', 'b');
    loader.close();
    loader.request('c');
    expect(signals).toHaveLength(2);
    expect(signals.every(({ aborted }) => aborted)).toBe(true);
    await Promise.resolve();
    expect(loader.get('a')).toBeUndefined();
  });
});
