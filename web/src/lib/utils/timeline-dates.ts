import type { TimelineDate, TimelineYearMonth } from '$lib/utils/timeline-util';

// Local Omarchy layer: the dates the timeline writes on its tiles (the month marks, the date in the hover caption), and
// the same day where a photo is named by it (the AI inbox's cards), in the reader's locale, each style from one
// Intl.DateTimeFormat kept per locale. Building a formatter costs about 26µs
// in Chromium against under 1µs to format with one, and Date.toLocaleDateString(locale, options) builds one on every
// call: a fast scrub makes a hundred tiles a frame.

type Style = 'month' | 'month-year' | 'day' | 'day-year' | 'date';

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  month: { month: 'short' },
  'month-year': { month: 'short', year: 'numeric' },
  day: { weekday: 'short', day: 'numeric', month: 'short' },
  'day-year': { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The app's date locale ('default' and anything Intl refuses mean the browser's own). */
const localeOf = (locale: string | undefined) => {
  if (!locale || locale === 'default') {
    return undefined;
  }
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0 ? locale : undefined;
  } catch {
    return undefined;
  }
};

const formatterFor = (locale: string | undefined, style: Style) => {
  const key = `${locale ?? ''}|${style}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(localeOf(locale), OPTIONS[style]);
    formatters.set(key, formatter);
  }
  return formatter;
};

/**
 * A month mark: the locale's short month in capitals ("SEP"), and with `withYear` the year in the locale's order
 * ("DEC 2025", "2025年12月"). Only the month is set in capitals, so a locale's own year marker keeps its case.
 */
export const monthMarkLabel = ({ year, month }: TimelineYearMonth, withYear: boolean, locale?: string): string => {
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const upper = localeOf(locale);
  return formatterFor(locale, withYear ? 'month-year' : 'month')
    .formatToParts(date)
    .map((part) => (part.type === 'month' ? part.value.toLocaleUpperCase(upper) : part.value))
    .join('');
};

/** A photo's day as its tile's caption says it: "Sun, Oct 11", with the year when it is not this year's. */
export const tileDateLabel = (
  { year, month, day }: TimelineDate,
  locale?: string,
  thisYear = new Date().getFullYear(),
): string => {
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? '' : formatterFor(locale, year === thisYear ? 'day' : 'day-year').format(date);
};

/**
 * A photo's day with its year whatever the year, where nothing around it says which: "Oct 11, 2019" (an AI inbox
 * card's heading, utils/inbox-facts).
 */
export const dayLabel = ({ year, month, day }: TimelineDate, locale?: string): string => {
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? '' : formatterFor(locale, 'date').format(date);
};
