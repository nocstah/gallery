import type { TimelineYearMonth } from '$lib/utils/timeline-util';

// Local Omarchy layer: the dates the timeline writes on its tiles (the month marks), in the reader's locale, each style
// from one Intl.DateTimeFormat kept per locale. Building a formatter costs about 26µs in Chromium against under 1µs to
// format with one.

type Style = 'month' | 'month-year';

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  month: { month: 'short' },
  'month-year': { month: 'short', year: 'numeric' },
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
