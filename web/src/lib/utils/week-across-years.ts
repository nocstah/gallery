import type { TimeBucketCoverResponseDto, TimeBucketsResponseDto } from '@immich/sdk';

// Local Omarchy layer: "This week, across the years" (DESIGN.md, Explore): for every past year with photos in this
// calendar week (Monday to Sunday), one photo of it, the day nearest today's, so Explore shows time: the same week in
// 2025, 2024 … 2001. Worked out from the timeline's months (which years have photos in the week's months) and the
// covers of those days, two requests in all; plain functions here, the requests in the Explore page's load.

/** One past year of this week: its year, the photo that stands for it and the first and last day it has photos. */
export type WeekYear = { year: number; assetId: string; thumbhash: string | null; first: string; last: string };

const pad = (value: number) => String(value).padStart(2, '0');
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The seven days of the week that holds `today`, Monday first, in the reader's calendar. */
export const thisWeek = (today: Date): Date[] => {
  const sinceMonday = (today.getDay() + 6) % 7;
  return Array.from(
    { length: 7 },
    (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday + index),
  );
};

/** The week `yearsAgo` years back: each day moved by whole years (a 29 February becomes the 1st of March). */
const weekYearsAgo = (week: Date[], yearsAgo: number) =>
  week.map((day) => new Date(day.getFullYear() - yearsAgo, day.getMonth(), day.getDate()));

/**
 * The days to ask covers for: this week in every past year whose months the week falls in hold photos (`months`, the
 * timeline's month buckets), as 'YYYY-MM-DD' keys, with how many years ago each is.
 */
export const weekDaysAcrossYears = (
  today: Date,
  months: Pick<TimeBucketsResponseDto, 'timeBucket' | 'count'>[],
): { key: string; yearsAgo: number }[] => {
  const week = thisWeek(today);
  const withPhotos = new Set(months.filter(({ count }) => count > 0).map(({ timeBucket }) => timeBucket.slice(0, 7)));
  const oldest = Math.min(...[...withPhotos].map((month) => Number(month.slice(0, 4))));
  const days: { key: string; yearsAgo: number }[] = [];
  for (let yearsAgo = 1; today.getFullYear() - yearsAgo >= oldest; yearsAgo++) {
    const back = weekYearsAgo(week, yearsAgo);
    if (back.every((day) => !withPhotos.has(dayKey(day).slice(0, 7)))) {
      continue;
    }
    for (const day of back) {
      days.push({ key: dayKey(day), yearsAgo });
    }
  }
  return days;
};

/**
 * The years of this week, newest first, from the covers Gallery found for those days: each year's photo is the one of
 * its day nearest today's (today's own when it has photos, a later day before an earlier one at the same distance).
 */
export const weekYears = (
  today: Date,
  days: { key: string; yearsAgo: number }[],
  covers: Pick<TimeBucketCoverResponseDto, 'timeBucket' | 'representativeAssetId' | 'representativeThumbhash'>[],
): WeekYear[] => {
  const byDay = new Map(
    covers.filter((cover) => cover.representativeAssetId).map((cover) => [cover.timeBucket, cover]),
  );
  const todayIndex = (today.getDay() + 6) % 7;
  const years = new Map<number, { key: string; index: number }[]>();
  for (const [index, { key, yearsAgo }] of days.entries()) {
    if (!byDay.has(key)) {
      continue;
    }
    const list = years.get(yearsAgo) ?? [];
    list.push({ key, index: index % 7 });
    years.set(yearsAgo, list);
  }
  return [...years]
    .sort(([a], [b]) => a - b)
    .map(([yearsAgo, found]) => {
      const nearest = [...found].sort(
        (a, b) => Math.abs(a.index - todayIndex) - Math.abs(b.index - todayIndex) || b.index - a.index,
      )[0];
      const cover = byDay.get(nearest.key)!;
      const keys = found.map(({ key }) => key).sort();
      return {
        year: today.getFullYear() - yearsAgo,
        assetId: cover.representativeAssetId!,
        thumbhash: cover.representativeThumbhash ?? null,
        first: keys[0],
        last: keys.at(-1)!,
      };
    });
};

/** "Oct 13 – 18", or one day, in the reader's language. */
export const weekYearDays = ({ first, last }: Pick<WeekYear, 'first' | 'last'>, locale?: string) => {
  const parse = (key: string) => new Date(`${key}T12:00:00.000Z`);
  const format = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (first === last) {
    return format.format(parse(first));
  }
  return typeof format.formatRange === 'function'
    ? format.formatRange(parse(first), parse(last))
    : `${format.format(parse(first))} – ${format.format(parse(last))}`;
};

/** Where a row too short for every year reaches first, in years ago (the newest and the oldest always come). */
const MILESTONES = [5, 10, 20, 15, 30, 25, 40, 50];

/**
 * A spread of `years` (newest first) for a row of `slots`: the newest and the oldest, five, ten and twenty years ago,
 * the anniversaries between, then the middles of the widest gaps left, so a row too short for every year still spans
 * all of them rather than dropping the oldest first. A year missing at a mark gives way to the nearest one, the older
 * when two are as near. All of them when they fit.
 */
export const weekSpread = <T extends Pick<WeekYear, 'year'>>(years: T[], slots: number, thisYear: number): T[] => {
  if (years.length <= slots) {
    return years;
  }
  const ago = (item: T) => thisYear - item.year;
  const sorted = [...years].sort((a, b) => ago(a) - ago(b));
  const oldest = ago(sorted.at(-1)!);
  const chosen = new Set<T>();
  const take = (item: T | undefined) => {
    if (item && chosen.size < slots) {
      chosen.add(item);
    }
    return !!item;
  };
  // the year not yet in the row nearest `target` years ago, strictly between `within`'s ends when given
  const nearest = (target: number, within?: [number, number]) => {
    let best: T | undefined;
    for (const item of sorted) {
      const years = ago(item);
      if (chosen.has(item) || (within && (years <= within[0] || years >= within[1]))) {
        continue;
      }
      const distance = Math.abs(years - target);
      const bestDistance = best ? Math.abs(ago(best) - target) : Infinity;
      if (distance < bestDistance || (distance === bestDistance && best && years > ago(best))) {
        best = item;
      }
    }
    return best;
  };

  take(sorted[0]);
  take(sorted.at(-1));
  for (const milestone of MILESTONES) {
    // a mark as old as the oldest year or older: the oldest stands for it
    if (milestone < oldest) {
      take(nearest(milestone));
    }
  }
  while (chosen.size < slots) {
    const marks = [...chosen].map((item) => ago(item)).sort((a, b) => a - b);
    const gaps = marks
      .slice(1)
      .map((to, index): [number, number] => [marks[index], to])
      .sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    // the widest gap with a year left in it takes one; none left, the row stays shorter
    if (gaps.every((gap) => !take(nearest((gap[0] + gap[1]) / 2, gap)))) {
      break;
    }
  }
  return sorted.filter((item) => chosen.has(item));
};
