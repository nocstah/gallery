import { MemoryType, type AlbumResponseDto, type AssetResponseDto, type MemoryResponseDto } from '@immich/sdk';
import { assetFactory } from '@test-data/factories/asset-factory';
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
  it("chains today's memories, a birthday first, then the living albums", () => {
    const reels = todayReels(
      [memory('a'), memory('empty', MemoryType.OnThisDay, 0), memory('birthday', MemoryType.Birthday), memory('b')],
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
});
