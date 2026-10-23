import { AssetTypeEnum, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import type { MemoryFacts } from '$lib/utils/curator';
import {
  composeMemoryTitle,
  filmPhotoCount,
  formatMemoryTime,
  joinNames,
  memoryCount,
  memoryCover,
  memoryFilmWords,
  memoryOwnFacts,
  memoryTitle,
} from '$lib/utils/memory-title';
import { assetFactory } from '@test-data/factories/asset-factory';

const memory = (overrides: Partial<MemoryResponseDto> & { days?: string[] } = {}): MemoryResponseDto => {
  const { days = ['2025-10-16'], ...rest } = overrides;
  return {
    id: 'memory-1',
    ownerId: 'owner',
    assets: days.map((day, index) =>
      assetFactory.build({ id: `asset-${index}`, localDateTime: `${day}T10:00:00.000Z` }),
    ),
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    type: MemoryType.OnThisDay,
    data: { year: 2025 },
    isSaved: false,
    memoryAt: '2026-10-16T00:00:00.000Z',
    ...rest,
  } as MemoryResponseDto;
};

/** ICU sets thin spaces around a range's dash; the tests read them as plain spaces */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll('\u{2009}', ' ')) as T;

const rule = (ruleId: string, context: Record<string, unknown>, days?: string[]) =>
  memory({ type: MemoryType.Rule, data: { ruleId, context } as never, days });

const facts = (overrides: Partial<MemoryFacts> = {}): MemoryFacts => ({
  places: [],
  people: [],
  start: '2025-10-15',
  end: '2025-10-19',
  count: 192,
  cover: null,
  ...overrides,
});

describe(formatMemoryTime.name, () => {
  it('names one month', () => {
    expect(formatMemoryTime('2025-10-15', '2025-10-19', 'en')).toBe('October 2025');
  });

  it('gives months within a year as a range', () => {
    expect(plain(formatMemoryTime('2021-03-02', '2021-05-30', 'en'))).toBe('March – May 2021');
  });

  it('reads a whole year as the year', () => {
    expect(formatMemoryTime('2021-01-04', '2021-12-28', 'en')).toBe('2021');
  });

  it('keeps the months over a New Year when they are close', () => {
    expect(plain(formatMemoryTime('2024-12-28', '2025-01-03', 'en'))).toBe('December 2024 – January 2025');
  });

  it('gives years apart as the years', () => {
    expect(formatMemoryTime('2019-06-01', '2021-08-01', 'en').replaceAll(/\s/g, '')).toBe('2019–2021');
  });

  it('puts the ends in order', () => {
    expect(plain(formatMemoryTime('2021-05-30', '2021-03-02', 'en'))).toBe('March – May 2021');
  });

  it("speaks the reader's language", () => {
    expect(formatMemoryTime('2025-10-01', '2025-10-31', 'de')).toBe('Oktober 2025');
    expect(formatMemoryTime('2021-03-02', '2021-05-30', 'de')).toBe('März–Mai 2021');
    expect(formatMemoryTime('2025-10-01', '2025-10-31', 'zh-Hans')).toBe('2025年10月');
  });

  it('gives nothing for days it cannot read', () => {
    expect(formatMemoryTime('soon', '2025-10-31', 'en')).toBe('');
  });
});

describe(joinNames.name, () => {
  it('joins with the locale’s own "and"', () => {
    expect(joinNames(['Anna', 'Ben'], 'en')).toBe('Anna and Ben');
    expect(joinNames(['Anna', 'Ben'], 'de')).toBe('Anna und Ben');
    expect(joinNames(['Anna', 'Ben', 'Mia'], 'fr')).toBe('Anna, Ben et Mia');
  });
});

describe(composeMemoryTitle.name, () => {
  it('names the places, then when', () => {
    expect(
      composeMemoryTitle({ places: ['Siem Reap'], people: ['Anna'], start: '2025-10-15', end: '2025-10-19' }, 'en'),
    ).toEqual({ name: 'Siem Reap', time: 'October 2025', title: 'Siem Reap · October 2025' });
  });

  it('names two places at most', () => {
    const { name } = composeMemoryTitle(
      { places: ['Siem Reap', 'Phnom Penh', 'Kampot'], people: [], start: '2025-10-15', end: '2025-10-19' },
      'en',
    );
    expect(name).toBe('Siem Reap and Phnom Penh');
  });

  it('names the people when no place is worth naming, three at most', () => {
    expect(
      composeMemoryTitle({ places: [], people: ['Anna', 'Ben'], start: '2021-01-02', end: '2021-12-30' }, 'en').title,
    ).toBe('Anna and Ben · 2021');
    expect(
      composeMemoryTitle({ places: [], people: ['A', 'B', 'C', 'D'], start: '2021-03-02', end: '2021-03-30' }, 'en')
        .name,
    ).toBe('A, B, and C');
  });

  it('is the time alone with neither', () => {
    expect(composeMemoryTitle({ places: [], people: [' '], start: '2025-10-16', end: '2025-10-16' }, 'en')).toEqual({
      name: undefined,
      time: 'October 2025',
      title: 'October 2025',
    });
  });
});

describe(memoryOwnFacts.name, () => {
  it("takes a trip's city and its photos' days", () => {
    expect(
      memoryOwnFacts(
        rule('trip_anniversary', { city: 'Siem Reap', placeLabel: 'Siem Reap, Cambodia', year: 2025 }, [
          '2025-10-15',
          '2025-10-19',
        ]),
      ),
    ).toEqual({ places: ['Siem Reap'], people: [], start: '2025-10-15', end: '2025-10-19' });
  });

  it('falls back to the place label (a country) without a city', () => {
    expect(memoryOwnFacts(rule('recent_trip', { placeLabel: 'Cambodia' }))?.places).toEqual(['Cambodia']);
  });

  it("takes a month rule's own month", () => {
    expect(memoryOwnFacts(rule('favorites_throwback', { year: 2019, month: 3, count: 26 }, ['2025-01-01']))).toEqual({
      places: [],
      people: [],
      start: '2019-03-01',
      end: '2019-03-01',
    });
  });

  it('names the two people of a people-together memory', () => {
    expect(
      memoryOwnFacts(rule('people_together', { personAName: 'Anna', personBName: 'Ben', year: 2021, month: 4 }))
        ?.people,
    ).toEqual(['Anna', 'Ben']);
  });

  it('dates an on-this-day memory by its photos', () => {
    expect(memoryOwnFacts(memory({ days: ['2025-10-16', '2025-10-16'] }))).toEqual({
      places: [],
      people: [],
      start: '2025-10-16',
      end: '2025-10-16',
    });
  });

  it("has a year to go on when the photos' dates are missing", () => {
    expect(memoryOwnFacts(memory({ days: [] }))).toEqual({
      places: [],
      people: [],
      start: '2025-01-01',
      end: '2025-12-31',
    });
  });
});

describe(memoryTitle.name, () => {
  it("prefers Curator's facts: its places and its span", () => {
    const trip = rule('trip_anniversary', { city: 'Riverton' }, ['2025-10-16']);
    expect(
      plain(memoryTitle(trip, facts({ places: ['Siem Reap'], start: '2025-10-15', end: '2025-11-02' }), 'en')),
    ).toEqual({ name: 'Siem Reap', time: 'October – November 2025', title: 'Siem Reap · October – November 2025' });
  });

  it("fills in from the memory when Curator names no place or person, and keeps Curator's span", () => {
    const trip = rule('trip_anniversary', { city: 'Siem Reap' }, ['2025-10-16']);
    expect(plain(memoryTitle(trip, facts({ start: '2024-12-30', end: '2025-01-02' }), 'en')?.title)).toBe(
      'Siem Reap · December 2024 – January 2025',
    );
  });

  it("uses the memory's own span when Curator's days cannot be read", () => {
    expect(memoryTitle(memory(), facts({ start: '', end: 'later' }), 'en')?.title).toBe('October 2025');
  });

  it('titles a memory without Curator from itself', () => {
    expect(
      plain(
        memoryTitle(
          rule('on_this_day_place', { city: 'Berlin', years: [2021, 2025] }, ['2021-08-26', '2025-08-26']),
          undefined,
          'en',
        )?.title,
      ),
    ).toBe('Berlin · 2021 – 2025');
  });

  it('leaves a birthday its own title, whose birthday it is', () => {
    expect(
      memoryTitle(
        memory({ type: MemoryType.Birthday, data: { year: 1990, personName: 'Alex' } as never }),
        facts(),
        'en',
      ),
    ).toBeUndefined();
    expect(memoryTitle(rule('birthday', { personName: 'Alex' }), undefined, 'en')).toBeUndefined();
  });

  it('leaves a memory with nothing to go on to the old title', () => {
    expect(memoryTitle(memory({ days: [], data: {} as never }), undefined, 'en')).toBeUndefined();
  });
});

describe(memoryCover.name, () => {
  it("takes Curator's cover, with the memory's own photo when it is one", () => {
    const item = memory({ days: ['2025-10-16', '2025-10-16'] });
    expect(memoryCover(item, facts({ cover: 'asset-1' }))).toEqual({ id: 'asset-1', asset: item.assets[1] });
    expect(memoryCover(item, facts({ cover: 'elsewhere' }))).toEqual({ id: 'elsewhere', asset: undefined });
  });

  it('is the first photo without a cover', () => {
    const item = memory();
    expect(memoryCover(item, undefined)).toEqual({ id: 'asset-0', asset: item.assets[0] });
  });
});

describe(memoryCount.name, () => {
  it("is Curator's count, the trip's whole", () => {
    expect(memoryCount(memory(), facts({ count: 192 }))).toBe(192);
  });

  it("is the rule's own count without Curator, never fewer than the photos it holds", () => {
    expect(memoryCount(rule('recent_trip', { assetCount: 104 }), undefined)).toBe(104);
    expect(memoryCount(rule('favorites_throwback', { count: 0 }, ['2025-10-16', '2025-10-17']), undefined)).toBe(2);
    expect(memoryCount(memory({ days: ['2025-10-16', '2025-10-16', '2025-10-16'] }), undefined)).toBe(3);
  });
});

describe(filmPhotoCount.name, () => {
  it('counts exact copies once, as the film and Curator play them', () => {
    expect(
      filmPhotoCount([
        { id: 'a', checksum: 'x' },
        { id: 'b', checksum: 'y' },
        { id: 'c', checksum: 'x' },
      ]),
    ).toBe(2);
  });
});

describe(memoryFilmWords.name, () => {
  const words = {
    fallbackTitle: () => 'Old title',
    count: (count: number, videos: boolean) => `${count} ${videos ? 'videos' : 'photos'}`,
  };
  /** the factory picks an asset's type at random: these are photos */
  const photos = () => {
    const made = memory();
    made.assets = made.assets.map((asset) => ({ ...asset, type: AssetTypeEnum.Image }));
    return made;
  };

  it('names the place on the title card and says when and how many under it', () => {
    expect(plain(memoryFilmWords(photos(), facts({ places: ['Siem Reap'] }), 'en', words))).toEqual({
      title: 'Siem Reap · October 2025',
      name: 'Siem Reap',
      line: 'October 2025 · 1 photos',
      count: '1 photos',
    });
  });

  // the owner's "counts that match what's shown": the trip's 192 photos are not the film's
  it('counts the photos the film plays, not what the memory stands for', () => {
    const film = photos();
    film.assets = [0, 1, 2].map((index) =>
      assetFactory.build({
        id: `asset-${index}`,
        checksum: index === 2 ? 'copy' : `file-${index}`,
        type: AssetTypeEnum.Image,
        localDateTime: '2025-10-16T10:00:00.000Z',
      }),
    );
    film.assets.push({ ...film.assets[2], id: 'asset-3' });
    expect(memoryFilmWords(film, facts({ count: 192 }), 'en', words)).toMatchObject({
      line: '3 photos',
      count: '3 photos',
    });
  });

  it('puts the time on the title card when there is nothing to name, and does not say it twice', () => {
    expect(memoryFilmWords(photos(), undefined, 'en', words)).toMatchObject({
      title: 'October 2025',
      name: 'October 2025',
      line: '1 photos',
    });
  });

  it('counts videos as videos, and titles a memory with nothing to go on as its card does', () => {
    const empty = { ...memory(), data: {} } as MemoryResponseDto;
    empty.assets = empty.assets.map((asset) => ({ ...asset, type: AssetTypeEnum.Video, localDateTime: '' }));
    expect(memoryFilmWords(empty, undefined, 'en', words)).toEqual({
      title: 'Old title',
      name: 'Old title',
      line: '1 videos',
      count: '1 videos',
    });
  });
});
