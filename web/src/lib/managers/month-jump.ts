// Local Omarchy layer: typing a month in Ctrl+K ("July 2014", "jul 2014", "2014-07", "07/2014", "2014年7月") offers
// Photos scrolled to that month, and a bare year ("2014") that year. Month names are read in the palette's language
// and in English, without accents or case. Photos takes the target as `?jump=2014-07` and lands on the nearest month
// that has photos.

export interface MonthJump {
  year: number;
  /** 1-12; absent for a whole year */
  month?: number;
}

export interface YearMonth {
  year: number;
  month: number;
}

const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;

const fold = (text: string) => text.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().replace(/\.$/, '');

const namesByLocale = new Map<string, Map<string, number>>();

/** Every long and short month name of a locale, folded, to its number (1-12). */
export function monthNames(locale: string): Map<string, number> {
  const known = namesByLocale.get(locale);
  if (known) {
    return known;
  }
  const names = new Map<string, number>();
  for (const style of ['long', 'short'] as const) {
    let format: Intl.DateTimeFormat;
    try {
      format = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
    } catch {
      continue; // not a locale Intl knows
    }
    for (let month = 1; month <= 12; month++) {
      names.set(fold(format.format(Date.UTC(2001, month - 1, 15))), month);
    }
  }
  namesByLocale.set(locale, names);
  return names;
}

/** A month name, or the start of one (at least three letters, matching one month only), to its number. */
function monthOf(word: string, locales: readonly string[]): number | undefined {
  const folded = fold(word.trim());
  if (!folded) {
    return undefined;
  }
  for (const locale of locales) {
    const exact = monthNames(locale).get(folded);
    if (exact) {
      return exact;
    }
  }
  if (folded.length < 3) {
    return undefined;
  }
  const starts = new Set<number>();
  for (const locale of locales) {
    for (const [name, month] of monthNames(locale)) {
      if (name.startsWith(folded)) {
        starts.add(month);
      }
    }
  }
  return starts.size === 1 ? [...starts][0] : undefined;
}

const valid = (year: number, month?: number): MonthJump | null => {
  if (!Number.isSafeInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) {
    return null;
  }
  if (month === undefined) {
    return { year };
  }
  return Number.isSafeInteger(month) && month >= 1 && month <= 12 ? { year, month } : null;
};

/** The month or year a palette query names, or null when it names neither. */
export function parseMonthJump(query: string, locales: readonly string[] = ['en']): MonthJump | null {
  const text = query.trim().replaceAll(/\s+/g, ' ');
  if (!text) {
    return null;
  }
  let found: RegExpExecArray | null;
  if ((found = /^(\d{4})$/.exec(text))) {
    return valid(Number(found[1]));
  }
  if ((found = /^(\d{4}) ?年(?: ?(\d{1,2}) ?月)?$/.exec(text))) {
    return valid(Number(found[1]), found[2] ? Number(found[2]) : undefined);
  }
  if ((found = /^(\d{4})[-/.](\d{1,2})$/.exec(text))) {
    return valid(Number(found[1]), Number(found[2]));
  }
  if ((found = /^(\d{1,2})[-/.](\d{4})$/.exec(text))) {
    return valid(Number(found[2]), Number(found[1]));
  }
  if ((found = /^([^\d,]+?),? (\d{4})$/u.exec(text)) || (found = /^([^\d,]+?)(\d{4})$/u.exec(text))) {
    const month = monthOf(found[1], locales);
    return month ? valid(Number(found[2]), month) : null;
  }
  if ((found = /^(\d{4}),? ([^\d,]+)$/u.exec(text))) {
    const month = monthOf(found[2], locales);
    return month ? valid(Number(found[1]), month) : null;
  }
  return null;
}

/** `?jump=` for Photos: 2014-07, or 2014 for a whole year. */
export const monthJumpParam = ({ year, month }: MonthJump) =>
  month === undefined ? String(year) : `${year}-${String(month).padStart(2, '0')}`;

export const parseMonthJumpParam = (value: string | null): MonthJump | null => {
  const found = value ? /^(\d{4})(?:-(\d{2}))?$/.exec(value) : null;
  return found ? valid(Number(found[1]), found[2] ? Number(found[2]) : undefined) : null;
};

/** The month or year as a person reads it: "July 2014", "juli 2014", "2014". */
export const formatMonthJump = ({ year, month }: MonthJump, locale = 'en') => {
  if (month === undefined) {
    return String(year);
  }
  const date = Date.UTC(year, month - 1, 15);
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  }
};

/**
 * The month of the timeline to land on: the month itself when it has photos, else the nearest one (the newer of two
 * as near). A whole year lands on its newest month, as the year strip does; a year without photos on the month
 * nearest its middle.
 */
export function nearestMonth(months: readonly YearMonth[], jump: MonthJump): YearMonth | undefined {
  const index = ({ year, month }: YearMonth) => year * 12 + month - 1;
  if (jump.month === undefined) {
    let newest: YearMonth | undefined;
    for (const month of months) {
      if (month.year === jump.year && (!newest || month.month > newest.month)) {
        newest = month;
      }
    }
    if (newest) {
      return newest;
    }
  }
  const target = index({ year: jump.year, month: jump.month ?? 6 });
  let best: YearMonth | undefined;
  for (const month of months) {
    const distance = Math.abs(index(month) - target);
    const bestDistance = best ? Math.abs(index(best) - target) : Infinity;
    const nearer = distance < bestDistance || (distance === bestDistance && best && index(month) > index(best));
    if (!nearer) {
      continue;
    }
    best = month;
  }
  return best;
}
