import type { Translations } from 'svelte-i18n';
import { dayLabel, tileDateLabel } from '$lib/utils/timeline-dates';

// Local Omarchy layer: the days of a series as Coming up says them (gallery/series): "Tomorrow" for tomorrow, else the
// weekday and the date as a photo's tile says them, in the reader's language, with the year when it is not this year's.
// A day is Curator's 'YYYY-MM-DD', a day on the calendar: it is read as one, never as midnight somewhere. The family
// page (web/memory-player, series) says its days the same way, from the reader's calendar.

/** 'YYYY-MM-DD' of a day on this computer's calendar */
export const isoDay = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-');

const parts = (day: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : undefined;
};

/** The weekday and the date ("Sun, Nov 1"), with the year when it is not this year's; a day it cannot read, as it is. */
export const seriesDate = (day: string, locale?: string, now = new Date()): string => {
  const date = parts(day);
  return (date && tileDateLabel(date, locale, now.getFullYear())) || day;
};

/** Whether `day` is tomorrow on this computer's calendar. */
export const isTomorrow = (day: string, now = new Date()): boolean =>
  day === isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

/** How many days `day` is from today on this computer's calendar: 0 today, 1 tomorrow, -1 yesterday; NaN for a day it
 * cannot read. */
export const daysFromToday = (day: string, now = new Date()): number => {
  const date = parts(day);
  if (!date) {
    return NaN;
  }
  const then = Date.UTC(date.year, date.month - 1, date.day);
  return Math.round((then - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
};

const NEAR = new Map<number, Translations>([
  [-1, 'memory_series_yesterday'],
  [0, 'memory_series_today'],
  [1, 'memory_series_tomorrow'],
]);

/** The i18n key of a day's own word while it is yesterday, today or tomorrow on this computer's calendar. */
export const nearDayKey = (day: string, now = new Date()): Translations | undefined =>
  NEAR.get(daysFromToday(day, now));

/** The date alone ("Nov 30, 2026"), with its year whatever the year: a day further off, said in a sentence. */
export const seriesPlainDate = (day: string, locale?: string): string => {
  const date = parts(day);
  return (date && dayLabel(date, locale)) || day;
};

/** A locale Intl can read, else the browser's own. */
const readable = (locale?: string) => {
  try {
    return locale && Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0 ? locale : undefined;
  } catch {
    return undefined;
  }
};

/** The weekday and the date in full ("Sunday, November 1"), with the year when it is not this year's: a day said in a
 * sentence of its own. */
export const seriesLongDate = (day: string, locale?: string, now = new Date()): string => {
  const date = parts(day);
  if (!date) {
    return day;
  }
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  if (date.year !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return new Intl.DateTimeFormat(readable(locale), options).format(new Date(date.year, date.month - 1, date.day));
};
