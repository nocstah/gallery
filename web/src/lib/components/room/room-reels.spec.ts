import {
  AssetTypeEnum,
  MemoryType,
  type AlbumResponseDto,
  type AssetResponseDto,
  type MemoryResponseDto,
} from '@immich/sdk';
import { memoryCards } from '$lib/utils/memory-cards';
import { assetFactory } from '@test-data/factories/asset-factory';
import { BRIGHT } from '@test-data/thumbhash';
import {
  inTimeOrder,
  livingAlbums,
  LIVING_ALBUM,
  roomCaption,
  roomRequest,
  shareOut,
  spreadByMonth,
  todayReels,
} from './room-reels';

const album = (albumName: string, assetCount = 10) =>
  ({ id: `album-${albumName}`, albumName, assetCount }) as AlbumResponseDto;

const memory = (id: string, type = MemoryType.OnThisDay, count = 3) =>
  ({
    id,
    type,
    assets: Array.from({ length: count }, (_, index) => assetFactory.build({ id: `${id}-${index}` })),
  }) as MemoryResponseDto;

const asset = (id: string, localDateTime: string) => ({ id, localDateTime }) as AssetResponseDto;

describe(roomRequest.name, () => {
  it('plays today without anything asked for', () => {
    expect(roomRequest(new URLSearchParams())).toEqual({ kind: 'today' });
  });

  it('plays an album or a year', () => {
    const id = '0b5a3c39-0a4f-4c3e-9e0e-6c1f2b3d4e5f';
    expect(roomRequest(new URLSearchParams({ album: id }))).toEqual({ kind: 'album', albumId: id });
    expect(roomRequest(new URLSearchParams({ year: '2019' }))).toEqual({ kind: 'year', year: 2019 });
  });

  it('plays today for what it cannot read', () => {
    expect(roomRequest(new URLSearchParams({ album: 'not-an-id' }))).toEqual({ kind: 'today' });
    expect(roomRequest(new URLSearchParams({ year: 'soon' }))).toEqual({ kind: 'today' });
    expect(roomRequest(new URLSearchParams({ year: '' }))).toEqual({ kind: 'today' });
  });
});

describe('the living albums', () => {
  it("finds the names Curator's Kiosk job looks for", () => {
    for (const name of ['Best of 2019', 'October across the years', 'Growing up · Anna', 'On the TV']) {
      expect(LIVING_ALBUM.test(name), name).toBe(true);
    }
    for (const name of ['Best of', 'Best of 2019 (1)', 'Bali', 'on the tv', 'Growing up']) {
      expect(LIVING_ALBUM.test(name), name).toBe(false);
    }
  });

  it('plays On the TV first, then this month across the years, the years newest first, growing up, other months', () => {
    const albums = [
      album('Growing up · Ben'),
      album('Best of 2019'),
      album('March across the years'),
      album('Bali'),
      album('October across the years'),
      album('Best of 2023'),
      album('On the TV'),
      album('November across the years'),
      album('Growing up · Anna'),
    ];

    expect(livingAlbums(albums, 10).map(({ albumName }) => albumName)).toEqual([
      'On the TV',
      'October across the years',
      'Best of 2023',
      'Best of 2019',
      'Growing up · Anna',
      'Growing up · Ben',
      'November across the years',
      'March across the years',
    ]);
  });

  it('leaves an empty one out', () => {
    expect(livingAlbums([album('Best of 2019', 0), album('Best of 2020')], 1)).toHaveLength(1);
  });
});

describe(todayReels.name, () => {
  const now = Date.UTC(2026, 9, 18, 9);
  // each memory its own card unless the test keys them alike, as the facts' titles do
  const cardsOf = (
    memories: MemoryResponseDto[],
    keyOf: (memory: MemoryResponseDto) => string | undefined = () => undefined,
  ) => memoryCards(memories, keyOf, now);

  it("chains today's memories, a birthday first, then the living albums", () => {
    const reels = todayReels(
      cardsOf([
        memory('a'),
        memory('empty', MemoryType.OnThisDay, 0),
        memory('birthday', MemoryType.Birthday),
        memory('b'),
      ]),
      [album('Bali'), album('Best of 2020')],
      10,
    );

    expect(reels.map(({ key }) => key)).toEqual([
      'memory:birthday',
      'memory:a',
      'memory:b',
      'album:album-Best of 2020',
    ]);
  });

  it('plays memories that read the same as one film: their photos once each, in the order taken, under the lead', () => {
    const day = (id: string, assets: AssetResponseDto[]) =>
      ({ id, type: MemoryType.OnThisDay, assets }) as MemoryResponseDto;
    const reels = todayReels(
      cardsOf(
        [
          day('d1', [asset('p2', '2025-10-17T10:00:00.000Z'), asset('p1', '2025-10-16T10:00:00.000Z')]),
          day('d2', [asset('p3', '2025-10-18T09:00:00.000Z'), asset('p2', '2025-10-17T10:00:00.000Z')]),
        ],
        () => 'Siem Reap · October 2025',
      ),
      [],
      10,
    );

    expect(reels).toHaveLength(1);
    const [reel] = reels;
    if (reel.kind !== 'memory') {
      throw new Error('a memory film');
    }
    expect(reel.key).toBe('memory:d1');
    expect(reel.memory.id).toBe('d1');
    expect(reel.memory.assets.map(({ id }) => id)).toEqual(['p1', 'p2', 'p3']);
    expect(reel.card?.members.map(({ id }) => id)).toEqual(['d1', 'd2']);
  });

  it("chains today's memories in the cards' one order: a trip before a day that holds more photos", () => {
    // photos that open a film in the light (room-opening), each on its own day
    const lit = (id: string, count: number) =>
      Array.from({ length: count }, (_, index) =>
        assetFactory.build({
          id: `${id}-${index}`,
          type: AssetTypeEnum.Image,
          width: 4032,
          height: 3024,
          originalMimeType: 'image/heic',
          thumbhash: BRIGHT,
          localDateTime: `2023-10-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
        }),
      );
    const day = {
      id: 'day',
      type: MemoryType.OnThisDay,
      assets: lit('day', 8).map((photo) => ({ ...photo, localDateTime: '2001-10-18T10:00:00.000Z' })),
    } as MemoryResponseDto;
    const trip = {
      id: 'trip',
      type: MemoryType.Rule,
      data: { ruleId: 'trip_anniversary' },
      assets: lit('trip', 4),
    } as MemoryResponseDto;

    expect(todayReels(cardsOf([day, trip]), [], 10).map(({ key }) => key)).toEqual(['memory:trip', 'memory:day']);
  });

  it('keeps a memory not due yet out of the chain', () => {
    const later = { ...memory('later'), showAt: '2026-10-20T00:00:00.000Z' } as MemoryResponseDto;

    expect(todayReels(cardsOf([memory('a'), later]), [], 10).map(({ key }) => key)).toEqual(['memory:a']);
  });

  it('is nothing with nothing to play', () => {
    expect(todayReels([], [album('Bali')], 10)).toEqual([]);
  });
});

describe(shareOut.name, () => {
  it('gives every month its turn, the busiest first, none more than it holds', () => {
    const quotas = shareOut(
      new Map([
        ['2019-01', 2],
        ['2019-07', 400],
        ['2019-12', 30],
      ]),
      10,
    );

    expect(Object.fromEntries(quotas)).toEqual({ '2019-01': 2, '2019-07': 4, '2019-12': 4 });
  });

  it('gives what there is when there is less than asked for', () => {
    expect(Object.fromEntries(shareOut(new Map([['2019-03', 3]]), 10))).toEqual({ '2019-03': 3 });
    expect(Object.fromEntries(shareOut(new Map([['2019-03', 3]]), 0))).toEqual({ '2019-03': 0 });
  });
});

describe(spreadByMonth.name, () => {
  it('keeps them all when they fit', () => {
    const items = [asset('a', '2019-01-02T10:00:00'), asset('b', '2019-05-02T10:00:00')];
    expect(spreadByMonth(items, 10, (item) => item.localDateTime.slice(0, 7))).toEqual(items);
  });

  it('takes from every month, evenly through each, in time order', () => {
    const january = Array.from({ length: 20 }, (_, index) =>
      asset(`jan-${index}`, `2019-01-${String(index + 1).padStart(2, '0')}T10:00:00`),
    );
    const june = [asset('jun-0', '2019-06-01T10:00:00'), asset('jun-1', '2019-06-20T10:00:00')];

    const spread = spreadByMonth([...january, ...june], 6, (item) => item.localDateTime.slice(0, 7));

    expect(spread.map(({ id }) => id)).toEqual(['jan-2', 'jan-7', 'jan-12', 'jan-17', 'jun-0', 'jun-1']);
  });
});

describe(inTimeOrder.name, () => {
  it('orders photos by when they were taken, each once', () => {
    const later = asset('later', '2020-05-01T10:00:00');
    const sooner = asset('sooner', '2019-05-01T10:00:00');

    expect(inTimeOrder([later, sooner, later]).map(({ id }) => id)).toEqual(['sooner', 'later']);
  });
});

describe(roomCaption.name, () => {
  const more = (count: number) => `${count} others`;
  const person = (name: string, isHidden = false) => ({ id: name, name, isHidden }) as never;

  it('says who, where and when', () => {
    expect(
      roomCaption(
        {
          people: [person('Anna'), person('Ben')],
          exifInfo: { city: 'Siem Reap', country: 'Cambodia' },
          localDateTime: '2025-10-16T10:00:00.000Z',
        },
        'en',
        more,
      ),
    ).toBe('Anna and Ben · Siem Reap, Cambodia · October 16, 2025');
  });

  it('names three people at most and counts the rest, never the hidden or the unnamed', () => {
    expect(
      roomCaption(
        {
          people: [
            person('Anna'),
            person(''),
            person('Ben'),
            person('Mia'),
            person('Tom'),
            person('Lia'),
            person('X', true),
          ],
          localDateTime: '2025-10-16T10:00:00.000Z',
        },
        'en',
        more,
      ),
    ).toBe('Anna, Ben, Mia, and 2 others · October 16, 2025');
  });

  it('says what it knows', () => {
    expect(roomCaption({ localDateTime: '2025-10-16T10:00:00.000Z' }, 'en', more)).toBe('October 16, 2025');
    expect(roomCaption({ exifInfo: { country: 'Norway' }, localDateTime: '' }, 'en', more)).toBe('Norway');
  });

  describe('under a line of the story', () => {
    const photo = {
      people: [person('Anna'), person('Ben')],
      exifInfo: { city: 'Siem Reap', country: 'Cambodia' },
      localDateTime: '2025-10-16T10:00:00.000Z',
    };
    const caption = (line: string, locale = 'en') => roomCaption(photo, locale, more, line);

    it('says nothing a line already says whole, in its own date format', () => {
      expect(caption('Anna and Ben were in Siem Reap, Cambodia on 16 October 2025.')).toBe('');
      expect(caption('On October 16th, 2025, Anna and Ben walked around Siem Reap.')).toBe('');
      expect(caption('Anna and Ben reached Siem Reap on the 16th of October 2025.')).toBe('');
    });

    it('leaves out each part the line names, and keeps what it adds', () => {
      expect(caption('Anna and Ben spent the morning by the river.')).toBe('Siem Reap, Cambodia · October 16, 2025');
      expect(caption('The temples of Siem Reap rose out of the trees.')).toBe('Anna and Ben · October 16, 2025');
      expect(caption('The trip through Cambodia went on in the rain.')).toBe(
        'Anna and Ben · Siem Reap · October 16, 2025',
      );
      expect(caption('Ben swam on 16 October 2025.')).toBe('Anna and Ben · Siem Reap, Cambodia');
    });

    it('keeps the day when the line names only its month, a span without it, or the day without its year', () => {
      const all = 'Anna and Ben · Siem Reap, Cambodia · October 16, 2025';
      expect(caption('In October 2025 the rains came.')).toBe(all);
      expect(caption('From 1 to 9 October 2025 the rains came.')).toBe(all);
      expect(caption('From 12 to 19 October the rains came.')).toBe(all);
      expect(caption('On 15 and 17 October 2025 the rains came.')).toBe(all);
      expect(caption('On 16 October the rains came.')).toBe(all);
      expect(caption('16 people came in 2025, in October.')).toBe(all);
      expect(caption('Some 12–19 people came in October 2025.')).toBe(all);
    });

    it("takes a span of days that holds the photo's day for naming it, in Curator's English", () => {
      const rest = 'Anna and Ben · Siem Reap, Cambodia';
      expect(caption('The family stayed by the river from 16 to 18 October 2025.')).toBe(rest);
      expect(caption('From 12 to 19 October 2025 the rains came.')).toBe(rest);
      expect(caption('The rains came 15–17 October 2025.')).toBe(rest);
      expect(caption('The rains came October 14–18, 2025.')).toBe(rest);
      expect(caption('The rains came between 15 and 17 October 2025.')).toBe(rest);
      expect(caption('The rains came from the 15th to the 17th of October 2025.')).toBe(rest);
      expect(caption('The trip ran from 30 September to 2 November 2025.')).toBe(rest);
    });

    it('reads a span over a New Year', () => {
      const newYear = { ...photo, localDateTime: '2025-01-01T10:00:00.000Z' };
      expect(roomCaption(newYear, 'en', more, 'They stayed from 30 December 2024 to 2 January 2025.')).toBe(
        'Anna and Ben · Siem Reap, Cambodia',
      );
      expect(roomCaption(newYear, 'en', more, 'They stayed from 2 to 5 January 2025.')).toBe(
        'Anna and Ben · Siem Reap, Cambodia · January 1, 2025',
      );
    });

    it("reads a span in the reader's language", () => {
      expect(caption('Anna und Ben waren vom 15. bis 17. Oktober 2025 dort.', 'de')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna und Ben waren 15.–17. Oktober 2025 dort.', 'de')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna et Ben étaient là du 15 au 17 octobre 2025.', 'fr')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna y Ben estuvieron del 15 al 17 de octubre de 2025.', 'es')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna en Ben waren er van 15 t/m 17 oktober 2025.', 'nl')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna i Ben byli tam od 15 do 17 października 2025.', 'pl')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna и Ben были там с 15 по 17 октября 2025 года.', 'ru')).toBe('Siem Reap, Cambodia');
      expect(caption('Anna 和 Ben 于2025年10月15日至17日在那里。', 'zh-Hans')).toBe('Siem Reap, Cambodia');
    });

    it('finds a name only as a whole word', () => {
      expect(roomCaption({ people: [person('Ra')], localDateTime: '' }, 'en', more, 'The rain stopped.')).toBe('Ra');
      expect(roomCaption({ people: [person('Ra')], localDateTime: '' }, 'en', more, 'Ra laughed.')).toBe('');
    });

    it('keeps the people while the line leaves one of them out', () => {
      const many = { ...photo, people: ['Anna', 'Ben', 'Mia', 'Tom'].map((name) => person(name)) };
      expect(roomCaption(many, 'en', more, 'Anna, Ben and Mia ate in Siem Reap.')).toBe(
        'Anna, Ben, Mia, and 1 others · October 16, 2025',
      );
      expect(roomCaption(many, 'en', more, 'Anna, Ben, Mia and Tom ate in Siem Reap.')).toBe('October 16, 2025');
    });

    it("reads the day in the reader's language as well as Curator's English", () => {
      expect(caption('Anna and Ben were in Siem Reap on 16 October 2025.', 'de')).toBe('');
      expect(caption('Anna und Ben waren am 16. Oktober 2025 dort.', 'de')).toBe('Siem Reap, Cambodia');
      expect(roomCaption(photo, 'de', more, 'Ein Tag am Fluss.')).toBe(
        'Anna und Ben · Siem Reap, Cambodia · 16. Oktober 2025',
      );
    });
  });
});
