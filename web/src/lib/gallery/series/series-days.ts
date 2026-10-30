import { tileDateLabel } from '$lib/utils/timeline-dates';

// Local Omarchy layer: the days of a series as Coming up says them (gallery/series): "Tomorrow" for tomorrow, else the
// weekday and the date as a photo's tile says them, in the reader's language, with the year when it is not this year's.
// A day is Curator's 'YYYY-MM-DD', a day on the calendar: it is read as one, never as midnight somewhere.

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
