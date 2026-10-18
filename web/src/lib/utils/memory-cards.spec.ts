import { MemoryType, type MemoryResponseDto } from '@immich/sdk';
import type { MessageFormatter } from 'svelte-i18n';
import {
  cardOfMemory,
  memoryCardCount,
  memoryCardLine,
  memoryCards,
  memorySection,
  wallClockAsUtc,
} from '$lib/utils/memory-cards';
import { assetFactory } from '@test-data/factories/asset-factory';

// the reader's Saturday 18 October 2026, mid-morning, as the server reads the wall clock
const NOW = Date.UTC(2026, 9, 18, 10, 0, 0);

type Options = Partial<MemoryResponseDto> & { photos?: string[]; day?: string; until?: string };

/** A memory shown on `day` (until `until`, the end of that day by default), its photos `photos` ("id@YYYY-MM-DD"). */
const memory = (id: string, options: Options = {}): MemoryResponseDto => {
  const { photos = [`${id}-a@2025-10-16`], day = '2026-10-18', until = day, ...rest } = options;
  return {
    id,
    ownerId: 'owner',
    assets: photos.map((photo) => {
      const [assetId, date] = photo.split('@', 2);
      return assetFactory.build({ id: assetId, localDateTime: `${date}T10:00:00.000Z` });
    }),
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    type: MemoryType.OnThisDay,
    data: { year: 2025 },
    isSaved: false,
    memoryAt: '2025-10-16T00:00:00.000Z',
    showAt: `${day}T00:00:00.000Z`,
    hideAt: `${until}T23:59:59.999Z`,
    ...rest,
  } as MemoryResponseDto;
};

const rule = (id: string, ruleId: string, context: Record<string, unknown>, options: Options = {}) =>
  memory(id, { type: MemoryType.Rule, data: { ruleId, context } as never, ...options });

/** svelte-i18n without messages echoes the key; this one shows the values too, to read the line in a test */
const translate = ((key: string, options?: { values?: Record<string, unknown> }) =>
  options?.values ? `${key}(${Object.values(options.values).join(',')})` : key) as MessageFormatter;

const ids = (cards: { members: MemoryResponseDto[] }[]) => cards.map(({ members }) => members.map(({ id }) => id));

describe(memorySection.name, () => {
  it("is today's while its window holds now", () => {
    expect(memorySection(memory('m'), NOW)).toBe('today');
    expect(memorySection(memory('m', { day: '2026-10-14', until: '2026-10-21' }), NOW)).toBe('today');
  });

  it('is earlier once its window has passed, upcoming before it opens', () => {
    expect(memorySection(memory('m', { day: '2026-10-16' }), NOW)).toBe('earlier');
    expect(memorySection(memory('m', { day: '2026-10-19' }), NOW)).toBe('upcoming');
  });

  it("is today's without a window", () => {
    expect(memorySection(memory('m', { showAt: undefined, hideAt: undefined }), NOW)).toBe('today');
  });

  // the server compares the dates with the wall clock read as UTC, so the page does too
  it('reads the wall clock as UTC', () => {
    const early = new Date(2026, 9, 18, 3, 0, 0);
    expect(wallClockAsUtc(early)).toBe(Date.UTC(2026, 9, 18, 3, 0, 0));
    expect(memorySection(memory('m'), wallClockAsUtc(early))).toBe('today');
  });
});

describe(memoryCards.name, () => {
  const keyOf = (memory: MemoryResponseDto) => (memory.data as { key?: string }).key;
  const keyed = (key: string, base: MemoryResponseDto) => ({ ...base, data: { ...base.data, key } }) as never;

  it('makes one card of memories that read the same, led by the one that stands for most', () => {
    const today = keyed('siem-reap', memory('day-16', { day: '2026-10-16', photos: ['b@2025-10-16', 'c@2025-10-16'] }));
    const trip = keyed(
      'siem-reap',
      rule(
        'trip',
        'trip_anniversary',
        { yearsAgo: 1, dayCount: 4 },
        {
          day: '2026-10-14',
          until: '2026-10-18',
          photos: ['a@2025-10-15', 'c@2025-10-16', 'd@2025-10-18'],
        },
      ),
    );
    const other = memory('oslo', { photos: ['o@2019-10-18'] });

    const cards = memoryCards([other, today, trip], keyOf, NOW);

    expect(ids(cards)).toEqual([['oslo'], ['trip', 'day-16']]);
    const [, merged] = cards;
    expect(merged.lead.id).toBe('trip');
    // their photos once each, in the order they were taken
    expect(merged.assets.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
    // the trip still shows today, so the card is today's though one of its days has passed
    expect(merged.section).toBe('today');
  });

  it('puts today first, then the earlier days, then the upcoming ones soonest first', () => {
    const cards = memoryCards(
      [
        memory('up-20', { day: '2026-10-20' }),
        memory('up-19', { day: '2026-10-19' }),
        memory('today'),
        memory('yesterday', { day: '2026-10-17' }),
      ],
      () => undefined,
      NOW,
    );

    expect(cards.map(({ section, lead }) => `${section}:${lead.id}`)).toEqual([
      'today:today',
      'earlier:yesterday',
      'upcoming:up-19',
      'upcoming:up-20',
    ]);
  });

  it('keeps a day still to come out of a card of today', () => {
    const cards = memoryCards(
      [keyed('oslo', memory('up', { day: '2026-10-20' })), keyed('oslo', memory('now'))],
      keyOf,
      NOW,
    );

    expect(ids(cards)).toEqual([['now'], ['up']]);
  });

  it('puts the upcoming ones that read the same together', () => {
    const cards = memoryCards(
      [
        keyed('siem-reap', memory('up-20', { day: '2026-10-20' })),
        keyed('siem-reap', memory('up-19', { day: '2026-10-19' })),
      ],
      keyOf,
      NOW,
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].section).toBe('upcoming');
  });

  it("shows a birthday first among today's", () => {
    const cards = memoryCards(
      [memory('day'), memory('birthday', { type: MemoryType.Birthday, data: { year: 1990, personName: 'Alex' } })],
      () => undefined,
      NOW,
    );

    expect(cards.map(({ lead }) => lead.id)).toEqual(['birthday', 'day']);
  });

  it('leaves out an empty memory and never merges memories without a key', () => {
    const cards = memoryCards([memory('empty', { photos: [] }), memory('a'), memory('b')], () => undefined, NOW);

    expect(ids(cards)).toEqual([['a'], ['b']]);
  });

  it('is kept when any of its memories is', () => {
    const cards = memoryCards(
      [keyed('k', memory('a', { isSaved: false })), keyed('k', memory('b', { isSaved: true }))],
      keyOf,
      NOW,
    );

    expect(cards[0].isSaved).toBe(true);
  });

  it('lets the heavier of one kind lead', () => {
    const cards = memoryCards(
      [
        keyed('k', memory('small', { photos: ['a@2013-10-14'] })),
        keyed('k', memory('big', { photos: ['b@2013-10-13', 'c@2013-10-13'] })),
      ],
      keyOf,
      NOW,
    );

    expect(cards[0].lead.id).toBe('big');
  });

  it('finds the card of any of its memories', () => {
    const cards = memoryCards([keyed('k', memory('a')), keyed('k', memory('b'))], keyOf, NOW);

    expect(cardOfMemory(cards, 'b')).toBe(cards[0]);
    expect(cardOfMemory(cards, 'nope')).toBeUndefined();
  });
});

describe(memoryCardCount.name, () => {
  it('counts the most any of its memories stands for, or the photos it plays', () => {
    const cards = memoryCards(
      [
        { ...memory('a', { photos: ['a@2013-10-14', 'b@2013-10-14'] }), data: { key: 'k' } } as never,
        { ...memory('b', { photos: ['c@2013-10-13'] }), data: { key: 'k' } } as never,
      ],
      (memory) => (memory.data as { key?: string }).key,
      NOW,
    );

    expect(memoryCardCount(cards[0], (memory) => memory.assets.length)).toBe(3);
    expect(memoryCardCount(cards[0], (memory) => (memory.id === 'a' ? 192 : 1))).toBe(192);
  });
});

describe(memoryCardLine.name, () => {
  const now = new Date(2026, 9, 18);
  const line = (lead: MemoryResponseDto) => memoryCardLine({ lead, assets: lead.assets }, translate, 'en', now);

  it('says an on-this-day memory is one, and how long ago', () => {
    expect(line(memory('m', { data: { year: 2013 } }))).toBe('memory_kind_on_this_day · years_ago(13)');
  });

  it('says a trip is one, how long ago and how many days', () => {
    expect(line(rule('t', 'trip_anniversary', { yearsAgo: 1, dayCount: 4, year: 2025 }))).toBe(
      'memory_kind_trip · years_ago(1) · memory_kind_days(4)',
    );
  });

  it('says no "ago" for a trip of this year', () => {
    expect(line(rule('t', 'recent_trip', { dayCount: 11 }, { photos: ['a@2026-09-17'] }))).toBe(
      'memory_kind_trip · memory_kind_days(11)',
    );
  });

  it("names a season's and a theme's kind by their own words", () => {
    expect(line(rule('s', 'season_recap', { season: 'summer', seasonYear: 2025 }))).toBe(
      'memory_season_summer · years_ago(1)',
    );
    expect(line(rule('t', 'themed', { theme: 'sunset', year: 2019 }))).toBe('memory_theme_sunset · years_ago(7)');
  });

  it('gives the years of a place on this day the rule keeps', () => {
    expect(line(rule('p', 'on_this_day_place', { city: 'Oslo', count: 12, years: [2013, 2015] }))).toBe(
      'memory_kind_on_this_day · memory_on_this_day_place_subtitle_two_years(12,2013,2015)',
    );
  });

  it("keeps a birthday's own line, its title saying what it is", () => {
    expect(line(rule('b', 'birthday', { personName: 'Alex', variant: 'recent' }))).toBe(
      'memory_birthday_subtitle_recent(Alex)',
    );
  });
});
