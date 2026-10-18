import { MemoryType, type AssetResponseDto, type MemoryResponseDto } from '@immich/sdk';
import type { MessageFormatter } from 'svelte-i18n';
import { getMemoryCardSubtitle } from '$lib/utils/memory-card';

// Local Omarchy layer: the cards the memories are shown as (DESIGN.md, Memories). The server makes a memory per rule
// and per day, so one trip a year ago came back as four cards that read "Siem Reap · October 2025": the day before
// yesterday's on-this-day, yesterday's, the trip's anniversary and the month's favourites. Memories whose titles read
// the same (one place and month, utils/memory-title) are one card here, and the card plays all their photos as one
// film, each photo once, in the order they were taken. Today's come first, then the earlier days' the server still
// keeps, then the upcoming ones (generated a few days ahead) when the reader shows them. Each card's line says what kind
// of memory it is: "On this day · 1 year ago", "Trip · 1 year ago · 4 days".

/** Where a card stands: shown today, shown on an earlier day and still kept, or not due yet. */
export type MemorySection = 'today' | 'earlier' | 'upcoming';

export const MEMORY_SECTIONS: MemorySection[] = ['today', 'earlier', 'upcoming'];

export type MemoryCard = {
  /** the memory the card opens, by whose address, story and songs it plays: the one that stands for the most (a trip
   * before one of its days) */
  lead: MemoryResponseDto;
  /** every memory the card holds, the lead first, then in the order they came */
  members: MemoryResponseDto[];
  section: MemorySection;
  /** all their photos, each once, in the order they were taken */
  assets: AssetResponseDto[];
  /** whether any of them is kept (the heart) */
  isSaved: boolean;
};

/**
 * The wall clock read as UTC, in milliseconds. A memory's `showAt` and `hideAt` hold calendar dates as UTC midnight
 * (immich-32166), and the server compares them with the wall clock read so, so the page does too: at 3 in the morning
 * east of Greenwich today's memories are already today's.
 */
export const wallClockAsUtc = (date = new Date()) =>
  Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );

/** Today's while its window holds `now`, earlier once the window has passed, upcoming before it opens. */
export const memorySection = (memory: Pick<MemoryResponseDto, 'showAt' | 'hideAt'>, now: number): MemorySection => {
  if (memory.showAt && Date.parse(memory.showAt) > now) {
    return 'upcoming';
  }
  return memory.hideAt && Date.parse(memory.hideAt) < now ? 'earlier' : 'today';
};

/** What a memory is: its rule's id, or on_this_day / birthday for the server's own kinds. */
export const memoryKind = (memory: Pick<MemoryResponseDto, 'type' | 'data'>): string => {
  if (memory.type === MemoryType.OnThisDay) {
    return 'on_this_day';
  }
  if (memory.type === MemoryType.Birthday) {
    return 'birthday';
  }
  const ruleId = (memory.data as Record<string, unknown> | undefined)?.ruleId;
  return typeof ruleId === 'string' ? ruleId : 'rule';
};

/** Which memory leads a card: a birthday, then a trip (it holds its days), then a day, then the wider looks back. */
const KIND_RANK = [
  'birthday',
  'trip_anniversary',
  'recent_trip',
  'on_this_day_place',
  'on_this_day',
  'favorites_throwback',
  'month_recap',
  'season_recap',
  'people_together',
  'person_throwback',
  'themed',
  'video_moments',
];
const rankOf = (memory: MemoryResponseDto) => {
  const rank = KIND_RANK.indexOf(memoryKind(memory));
  return rank === -1 ? KIND_RANK.length : rank;
};

/** Photos in the order they were taken, each once. */
const unionInTimeOrder = (members: MemoryResponseDto[]): AssetResponseDto[] => {
  const byId = new Map<string, AssetResponseDto>();
  for (const member of members) {
    for (const asset of member.assets) {
      if (!byId.has(asset.id)) {
        byId.set(asset.id, asset);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.localDateTime.localeCompare(b.localDateTime) || a.id.localeCompare(b.id));
};

/**
 * The cards, in the order the page shows them: today's (a birthday first, then as the server sent them: the newest
 * days first), the earlier ones, then the upcoming ones (the soonest first). `keyOf` is what a card is known by, the
 * title of facts; memories with the same key in today's and the earlier ones are one card, which stands with today's
 * when any of them is today's, and the upcoming ones are put together only with each other, so a film of today never
 * holds a day still to come. Memories without a key (a birthday, one with nothing to title it by) stand alone, and an
 * empty memory is not shown, as upstream never shows one. `weight` is how much a memory stands for (its photos, or
 * Curator's count of them); between memories of one kind the heavier leads.
 */
export const memoryCards = (
  memories: MemoryResponseDto[],
  keyOf: (memory: MemoryResponseDto) => string | undefined,
  now: number,
  weight: (memory: MemoryResponseDto) => number = (memory) => memory.assets.length,
): MemoryCard[] => {
  type Group = { members: { memory: MemoryResponseDto; index: number; section: MemorySection }[] };
  const groups = new Map<string, Group>();
  for (const [index, memory] of memories.entries()) {
    if (memory.assets.length === 0) {
      continue;
    }
    const section = memorySection(memory, now);
    const key = keyOf(memory);
    const groupKey = key ? `${section === 'upcoming' ? 'upcoming' : 'shown'}\u{0}${key}` : `memory\u{0}${memory.id}`;
    const group = groups.get(groupKey);
    const member = { memory, index, section };
    if (group) {
      group.members.push(member);
    } else {
      groups.set(groupKey, { members: [member] });
    }
  }

  const cards = [...groups.values()].map(({ members }) => {
    const lead = [...members].sort(
      (a, b) => rankOf(a.memory) - rankOf(b.memory) || weight(b.memory) - weight(a.memory) || a.index - b.index,
    )[0];
    const sections = new Set(members.map(({ section }) => section));
    const section: MemorySection = sections.has('today') ? 'today' : sections.has('earlier') ? 'earlier' : 'upcoming';
    const ordered = [lead.memory, ...members.filter((member) => member !== lead).map(({ memory }) => memory)];
    const card: MemoryCard = {
      lead: lead.memory,
      members: ordered,
      section,
      assets: members.length === 1 ? lead.memory.assets : unionInTimeOrder(ordered),
      isSaved: ordered.some(({ isSaved }) => isSaved),
    };
    const first = Math.min(...members.map(({ index }) => index));
    const soonest = Math.min(...members.map(({ memory }) => (memory.showAt ? Date.parse(memory.showAt) : Infinity)));
    return { card, first, soonest };
  });

  const sectionRank = (section: MemorySection) => MEMORY_SECTIONS.indexOf(section);
  const birthday = (card: MemoryCard) => (memoryKind(card.lead) === 'birthday' ? 0 : 1);
  return cards
    .sort((a, b) => {
      const bySection = sectionRank(a.card.section) - sectionRank(b.card.section);
      if (bySection !== 0) {
        return bySection;
      }
      if (a.card.section === 'upcoming') {
        return a.soonest - b.soonest || a.first - b.first;
      }
      return birthday(a.card) - birthday(b.card) || a.first - b.first;
    })
    .map(({ card }) => card);
};

/** The card a memory belongs to, by any of its memories' ids. */
export const cardOfMemory = (cards: MemoryCard[], memoryId: string): MemoryCard | undefined =>
  cards.find(({ members }) => members.some(({ id }) => id === memoryId));

/**
 * How many photos a card stands for: the most any of its memories stands for (a trip's whole count), or the photos it
 * plays when those are more (two days of one place).
 */
export const memoryCardCount = (card: MemoryCard, countOf: (memory: MemoryResponseDto) => number) =>
  Math.max(card.assets.length, ...card.members.map((memory) => countOf(memory)));

// ---- the line: what kind of memory it is, how long ago, how long ----

type RuleContext = Record<string, unknown>;

const contextOf = (memory: MemoryResponseDto): RuleContext => {
  const data = (memory.data ?? {}) as Record<string, unknown>;
  return memory.type === MemoryType.Rule && data.context && typeof data.context === 'object'
    ? (data.context as RuleContext)
    : {};
};

const numberIn = (context: RuleContext, key: string) => {
  const value = context[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

type MessageKey = Parameters<MessageFormatter>[0];

const SEASON_KEYS: Record<string, MessageKey> = {
  spring: 'memory_season_spring',
  summer: 'memory_season_summer',
  autumn: 'memory_season_autumn',
  winter: 'memory_season_winter',
};

const THEME_KEYS: Record<string, MessageKey> = {
  sunset: 'memory_theme_sunset',
  beach: 'memory_theme_beach',
  food: 'memory_theme_food',
  mountains: 'memory_theme_mountains',
  snow: 'memory_theme_snow',
  city_night: 'memory_theme_city_night',
};

/** The word for each kind (a season and a theme are named by their own words). */
const KIND_WORDS = new Map<string, MessageKey>([
  ['on_this_day', 'memory_kind_on_this_day'],
  ['on_this_day_place', 'memory_kind_on_this_day'],
  ['trip_anniversary', 'memory_kind_trip'],
  ['recent_trip', 'memory_kind_trip'],
  ['favorites_throwback', 'memory_kind_favorites'],
  ['month_recap', 'memory_kind_month'],
  ['people_together', 'memory_kind_together'],
  ['person_throwback', 'memory_kind_throwback'],
  ['video_moments', 'memory_kind_videos'],
]);

/**
 * A card's line in data type: its kind, how long ago and, for a trip, how many days ("On this day · 13 years ago",
 * "Trip · 1 year ago · 4 days", "Trip · 11 days", "Sunsets · 7 years ago"). A birthday's title already says what it is,
 * so its line is the rule's own ("Photos from different years"), as is the line of a kind this does not know. A
 * memory of this year says no "ago"; one across several years (on this day in a place) says the rule's own years.
 */
export const memoryCardLine = (
  card: Pick<MemoryCard, 'lead' | 'assets'>,
  translate: MessageFormatter,
  locale?: string,
  now = new Date(),
): string => {
  const { lead } = card;
  const kind = memoryKind(lead);
  const context = contextOf(lead);
  const data = (lead.data ?? {}) as Record<string, unknown>;

  let word: string | undefined;
  const kindWord = KIND_WORDS.get(kind);
  if (kindWord) {
    word = translate(kindWord);
  } else if (kind === 'season_recap') {
    const key = SEASON_KEYS[String(context.season)];
    word = key ? translate(key) : undefined;
  } else if (kind === 'themed') {
    const key = THEME_KEYS[String(context.theme)];
    word = key ? translate(key) : undefined;
  }
  if (!word) {
    return getMemoryCardSubtitle(lead, translate, locale, now);
  }

  if (kind === 'on_this_day_place') {
    // its photos are from several years: the rule says which ("12 photos from 2013 and 2015")
    const years = getMemoryCardSubtitle(lead, translate, locale, now);
    return [word, years].filter(Boolean).join(' · ');
  }

  const firstYear = Number(card.assets[0]?.localDateTime?.slice(0, 4));
  const year =
    (kind === 'on_this_day' ? numberIn(data, 'year') : undefined) ??
    numberIn(context, 'year') ??
    numberIn(context, 'seasonYear') ??
    (Number.isFinite(firstYear) ? firstYear : undefined);
  const yearsAgo = numberIn(context, 'yearsAgo') ?? (year === undefined ? undefined : now.getFullYear() - year);
  const ago = yearsAgo !== undefined && yearsAgo > 0 ? translate('years_ago', { values: { years: yearsAgo } }) : '';

  const dayCount = numberIn(context, 'dayCount');
  const days =
    (kind === 'trip_anniversary' || kind === 'recent_trip') && dayCount !== undefined && dayCount > 0
      ? translate('memory_kind_days', { values: { count: dayCount } })
      : '';

  return [word, ago, days].filter(Boolean).join(' · ');
};
