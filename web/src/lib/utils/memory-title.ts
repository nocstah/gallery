import { AssetTypeEnum, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import type { MemoryFacts } from '$lib/utils/curator';

// Local Omarchy layer: a memory's title from facts, place and time (2026-10-16, the owner's choice for "Memories worth
// opening"): "Siem Reap · October 2025", "Anna and Ben · 2021". The places worth naming come first, else the named
// people, then when the photos were taken, so a title is never a guess. Curator's facts (GET /api/memories/facts) say
// it best: the places most of the photos were taken in and the whole trip's span. Without Curator (a family member's
// account, Curator not answering) the memory says it itself: its rule's place, people, month or year, else the dates
// of its own photos. Everything is composed here in the reader's locale through Intl (month names, ranges, "and"),
// never stored as prose.

/** Places and people a title names at most: two places read as a trip, three names as a group. */
const MOST_PLACES = 2;
const MOST_PEOPLE = 3;

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** What a title is built from: the places and people to name, and the first and last day ('YYYY-MM-DD'). */
export type MemoryTitleFacts = {
  places: string[];
  people: string[];
  start: string;
  end: string;
};

export type MemoryTitle = {
  /** the places worth naming, else the people; undefined when there are neither */
  name?: string;
  /** when, in the locale: "October 2025", "March – May 2021", "2019–2021" */
  time: string;
  /** the card's title: "name · time", or the time alone */
  title: string;
};

type Day = { year: number; month: number };

const parseDay = (value: unknown): Day | undefined => {
  const match = typeof value === 'string' ? DAY.exec(value) : null;
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : undefined;
};

const monthStart = ({ year, month }: Day) => new Date(Date.UTC(year, month - 1, 1));

const formatter = (locale: string | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });

/** A locale's own range ("März–Mai 2021", "2019–2021"), or both ends with a dash where formatRange is missing. */
const formatRange = (format: Intl.DateTimeFormat, from: Date, to: Date) =>
  typeof format.formatRange === 'function'
    ? format.formatRange(from, to)
    : `${format.format(from)} – ${format.format(to)}`;

/**
 * When a memory's photos were taken, as precise as a title wants it: one month ("October 2025"), a range of months
 * within a year ("March – May 2021"; a whole year reads as the year), months over a New Year when they are close
 * ("December 2024 – January 2025"), else the years ("2019–2021"). Days are left to the photos themselves.
 */
export const formatMemoryTime = (start: string, end: string, locale?: string): string => {
  let first = parseDay(start);
  let last = parseDay(end);
  if (!first || !last) {
    return '';
  }
  if (first.year * 12 + first.month > last.year * 12 + last.month) {
    [first, last] = [last, first];
  }
  const months = formatter(locale, { month: 'long', year: 'numeric' });
  const years = formatter(locale, { year: 'numeric' });
  if (first.year === last.year && first.month === last.month) {
    return months.format(monthStart(first));
  }
  if (first.year === last.year) {
    return first.month === 1 && last.month === 12
      ? years.format(monthStart(first))
      : formatRange(months, monthStart(first), monthStart(last));
  }
  const apart = (last.year - first.year) * 12 + (last.month - first.month);
  return apart <= 2
    ? formatRange(months, monthStart(first), monthStart(last))
    : formatRange(years, monthStart(first), monthStart(last));
};

/** "Anna and Ben", "Anna, Ben and Mia", in the locale's own words. */
export const joinNames = (names: string[], locale?: string): string => {
  if (typeof Intl.ListFormat !== 'function') {
    return names.join(', ');
  }
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
};

/** Names as Curator or a rule gives them: strings with something in them, each once, at most `most`. */
const cleanNames = (values: unknown, most: number): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const names: string[] = [];
  for (const value of values) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names.slice(0, most);
};

/** The places joined, else the people, then " · " and the time; neither, the time alone. */
export const composeMemoryTitle = (facts: MemoryTitleFacts, locale?: string): MemoryTitle => {
  const time = formatMemoryTime(facts.start, facts.end, locale);
  const places = cleanNames(facts.places, MOST_PLACES);
  const people = cleanNames(facts.people, MOST_PEOPLE);
  const named = places.length > 0 ? places : people;
  const name = named.length > 0 ? joinNames(named, locale) : undefined;
  return { name, time, title: [name, time].filter(Boolean).join(' · ') };
};

type RuleContext = Record<string, unknown>;

const text = (context: RuleContext, key: string) => {
  const value = context[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const number = (context: RuleContext, key: string) => {
  const value = context[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** The first and last day of the memory's own photos. */
const photoSpan = (memory: MemoryResponseDto) => {
  const days = (memory.assets ?? [])
    .map((asset) => asset.localDateTime?.slice(0, 10))
    .filter((day): day is string => !!day && DAY.test(day))
    .sort();
  return days.length > 0 ? { start: days[0], end: days.at(-1)! } : undefined;
};

/** A birthday is titled by whose it is ("Alex's birthday"), the fact it stands for; its `year` is the birth year. */
const isBirthday = (memory: MemoryResponseDto) =>
  memory.type === MemoryType.Birthday ||
  (memory.type === MemoryType.Rule && (memory.data as Record<string, unknown> | undefined)?.ruleId === 'birthday');

/**
 * What the memory says of itself: its rule's place (the city, else the place label: a country) and people, its
 * month or year, else the dates of its photos. Undefined for a memory with nothing to go on.
 */
export const memoryOwnFacts = (memory: MemoryResponseDto): MemoryTitleFacts | undefined => {
  const data = (memory.data ?? {}) as Record<string, unknown>;
  const context: RuleContext =
    memory.type === MemoryType.Rule && data.context && typeof data.context === 'object'
      ? (data.context as RuleContext)
      : {};
  const ruleId = typeof data.ruleId === 'string' ? data.ruleId : undefined;

  const place = text(context, 'city') ?? text(context, 'placeLabel');
  const people =
    ruleId === 'people_together'
      ? [text(context, 'personAName'), text(context, 'personBName')]
      : [text(context, 'personName')];

  // an on-this-day memory's `year` is its photos' year
  const year =
    number(context, 'year') ??
    number(context, 'seasonYear') ??
    (memory.type === MemoryType.OnThisDay ? number(data, 'year') : undefined);
  const month = number(context, 'month');
  const photos = photoSpan(memory);
  let span: { start: string; end: string } | undefined;
  if (year !== undefined && month !== undefined && month >= 1 && month <= 12) {
    span = { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-01` };
  } else if (photos) {
    span = photos;
  } else if (year !== undefined) {
    span = { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  if (!span) {
    return undefined;
  }
  return {
    places: place ? [place] : [],
    people: people.filter((name): name is string => !!name),
    ...span,
  };
};

/**
 * A memory's title: Curator's facts where it has them (its places, else people, and its span), filled in from what
 * the memory says of itself. Undefined for a birthday, which keeps its own title, and for a memory with neither facts
 * nor dates; the caller titles those as before.
 */
export const memoryTitle = (
  memory: MemoryResponseDto,
  facts: MemoryFacts | null | undefined,
  locale?: string,
): MemoryTitle | undefined => {
  if (isBirthday(memory)) {
    return undefined;
  }
  const own = memoryOwnFacts(memory);
  const curatorSpan = facts && parseDay(facts.start) && parseDay(facts.end) ? facts : undefined;
  const places = cleanNames(facts?.places, MOST_PLACES);
  const people = cleanNames(facts?.people, MOST_PEOPLE);
  const span = curatorSpan ?? own;
  if (!span) {
    return undefined;
  }
  return composeMemoryTitle(
    {
      places: places.length > 0 ? places : (own?.places ?? []),
      people: people.length > 0 ? people : (own?.people ?? []),
      start: span.start,
      end: span.end,
    },
    locale,
  );
};

/**
 * The photo a memory's card and title card show: Curator's pick of its best (`cover`) when there is one, else its
 * first photo. `asset` is the memory's own photo when the cover is one of them (for its alt text and cache key).
 */
export const memoryCover = (memory: MemoryResponseDto, facts: MemoryFacts | null | undefined) => {
  const cover = typeof facts?.cover === 'string' && facts.cover ? facts.cover : undefined;
  const asset = (cover && memory.assets.find(({ id }) => id === cover)) || (cover ? undefined : memory.assets[0]);
  return { id: cover ?? memory.assets[0]?.id, asset };
};

/**
 * How many photos a memory stands for, for its title card: Curator's count (a trip's whole count), else the count its
 * rule kept (a trip's photos, a month's favourites), else the photos it holds.
 */
export const memoryCount = (memory: MemoryResponseDto, facts: MemoryFacts | null | undefined) => {
  if (facts && Number.isFinite(facts.count) && facts.count > 0) {
    return facts.count;
  }
  const data = (memory.data ?? {}) as Record<string, unknown>;
  const context = memory.type === MemoryType.Rule && data.context ? (data.context as RuleContext) : {};
  const kept = number(context, 'assetCount') ?? number(context, 'count');
  return kept && kept >= memory.assets.length ? kept : memory.assets.length;
};

/** What a memory's film says (the memory's page and Room alike): the card's title for its top bar, the title card's
 * name (the places or people, else the time) and the line under it ("October 2025 · 192 photos": the time when the
 * name is not it, then the count the memory stands for). `count` words the count; `fallbackTitle` titles a memory
 * with nothing to go on, as its card does. */
export type MemoryFilmWords = { title: string; name: string; line: string; count: string };

export const memoryFilmWords = (
  memory: MemoryResponseDto,
  facts: MemoryFacts | null | undefined,
  locale: string | undefined,
  words: { fallbackTitle: (memory: MemoryResponseDto) => string; count: (count: number, videos: boolean) => string },
): MemoryFilmWords => {
  const parts = memoryTitle(memory, facts, locale);
  const title = parts?.title ?? words.fallbackTitle(memory);
  const videos = memory.assets.every((asset) => asset.type === AssetTypeEnum.Video);
  const count = words.count(memoryCount(memory, facts), videos);
  return {
    title,
    name: parts?.name ?? (parts?.time || title),
    line: [parts?.name ? parts.time : '', count].filter(Boolean).join(' · '),
    count,
  };
};
