// Local Omarchy layer: how long ago, by the calendar (DESIGN.md, Shared; the owner's "calendar-day relative times",
// 2026-10-23). A time under a day's heading had counted elapsed time, so a Wednesday evening read "1d ago" under
// "Wednesday" on a Friday morning. Now today's times count the minutes and hours ("now", "5m ago", "2h ago"), and
// anything earlier counts calendar days in the reader's own time zone, as the headings do: "yesterday" for anything
// yesterday, however late, then "2d ago" (the language's own words where it has them: "vorgestern", "avant-hier"),
// whole weeks within a month, whole calendar months within a year, then years. One helper for every time in the app
// that says how long ago: the Shared feed, a Space's activity and members, the album's comments, the notifications,
// the undo history, the AI inbox's backups and the maintenance page's backups.

type Formats = { auto: Intl.RelativeTimeFormat; always: Intl.RelativeTimeFormat };
const relativeFormats = new Map<string, Formats>();

const relativeFormat = (locale?: string): Formats => {
  const cached = relativeFormats.get(locale ?? '');
  if (cached) {
    return cached;
  }
  const make = (style: Intl.RelativeTimeFormatStyle, numeric: Intl.RelativeTimeFormatNumeric) => {
    try {
      return new Intl.RelativeTimeFormat(locale, { style, numeric });
    } catch {
      return new Intl.RelativeTimeFormat(undefined, { style, numeric });
    }
  };
  // the narrow style is the data type's ("2h ago"), but some locales write its past as a signed number ("-2 h"),
  // which reads as arithmetic: those take the short one ("il y a 2 h")
  const style = /^[-+−]/.test(make('narrow', 'always').format(-2, 'hour')) ? 'short' : 'narrow';
  const formats = { auto: make(style, 'auto'), always: make(style, 'always') };
  relativeFormats.set(locale ?? '', formats);
  return formats;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (time: number) => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** Calendar days from the day `then` falls on to the day `now` falls on, in the reader's time zone (0: the same day). */
export const calendarDaysBetween = (then: number, now: number) => Math.round((dayOf(now) - dayOf(then)) / DAY_MS);

/** Whole calendar months from `then` to `now`: the 20th of September to the 23rd of October is one, the 30th none. */
const calendarMonthsBetween = (then: Date, now: Date) =>
  (now.getFullYear() - then.getFullYear()) * 12 +
  now.getMonth() -
  then.getMonth() -
  (now.getDate() < then.getDate() ? 1 : 0);

/**
 * How long ago `when` was, from `now`, in the reader's language and the data type's few characters: "now", "5m ago",
 * "2h ago" today; "yesterday", "2d ago" … "6d ago" by the calendar; then "1w ago", "4mo ago", "2y ago". A time a
 * moment ahead of the clock reads "now". So a time never disagrees with the day it is listed under.
 */
export const relativeTime = (when: string | number | Date, now: number, locale?: string): string => {
  const then = when instanceof Date ? when.getTime() : typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(then)) {
    return '';
  }
  const { auto, always } = relativeFormat(locale);
  const days = calendarDaysBetween(then, now);
  if (days <= 0) {
    const seconds = Math.max(0, (now - then) / 1000);
    if (seconds < 60) {
      return auto.format(0, 'second');
    }
    if (seconds < 60 * 60) {
      return always.format(-Math.floor(seconds / 60), 'minute');
    }
    return always.format(-Math.floor(seconds / 3600), 'hour');
  }
  if (days < 7) {
    return auto.format(-days, 'day');
  }
  const months = calendarMonthsBetween(new Date(then), new Date(now));
  if (months < 1) {
    return always.format(-Math.floor(days / 7), 'week');
  }
  if (months < 12) {
    return always.format(-months, 'month');
  }
  return always.format(-Math.floor(months / 12), 'year');
};
