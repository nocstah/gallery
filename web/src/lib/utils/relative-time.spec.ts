import { calendarDaysBetween, relativeTime } from '$lib/utils/relative-time';

// every date here is in the test's own time zone, as the reader's would be
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

describe('relativeTime', () => {
  // a Friday morning
  const now = at(2026, 10, 23, 9, 0);

  it('counts the minutes and hours of today', () => {
    expect(relativeTime(now - 20_000, now, 'en')).toBe('now');
    expect(relativeTime(now - 5 * 60_000, now, 'en')).toBe('5m ago');
    expect(relativeTime(at(2026, 10, 23, 0, 30), now, 'en')).toBe('8h ago');
  });

  it('says yesterday for anything yesterday, however late or early', () => {
    expect(relativeTime(at(2026, 10, 22, 23, 50), now, 'en')).toBe('yesterday');
    expect(relativeTime(at(2026, 10, 22, 0, 5), now, 'en')).toBe('yesterday');
  });

  // the critique's case: a Wednesday evening, under "Wednesday", had read "1d ago" on a Friday morning
  it('counts calendar days, so a time agrees with the day it is listed under', () => {
    expect(relativeTime(at(2026, 10, 21, 21, 11), now, 'en')).toBe('2d ago');
    expect(relativeTime(at(2026, 10, 17, 9, 0), now, 'en')).toBe('6d ago');
  });

  it('counts a few minutes after midnight as today and a few before it as yesterday', () => {
    const justAfter = at(2026, 10, 23, 0, 10);
    expect(relativeTime(at(2026, 10, 23, 0, 2), justAfter, 'en')).toBe('8m ago');
    expect(relativeTime(at(2026, 10, 22, 23, 58), justAfter, 'en')).toBe('yesterday');
  });

  it('then whole weeks within a month, calendar months within a year, then years', () => {
    expect(relativeTime(at(2026, 10, 16, 9, 0), now, 'en')).toBe('1w ago');
    expect(relativeTime(at(2026, 9, 30), now, 'en')).toBe('3w ago');
    expect(relativeTime(at(2026, 9, 20), now, 'en')).toBe('1mo ago');
    expect(relativeTime(at(2026, 6, 1), now, 'en')).toBe('4mo ago');
    expect(relativeTime(at(2025, 10, 24), now, 'en')).toBe('11mo ago');
    expect(relativeTime(at(2025, 10, 23), now, 'en')).toBe('1y ago');
    expect(relativeTime(at(2024, 3, 1), now, 'en')).toBe('2y ago');
  });

  it("speaks the reader's language, with its own words for the days", () => {
    expect(relativeTime(at(2026, 10, 22), now, 'de')).toBe('gestern');
    expect(relativeTime(at(2026, 10, 21), now, 'de')).toBe('vorgestern');
    expect(relativeTime(at(2026, 10, 21), now, 'fr')).toBe('avant-hier');
  });

  it('takes the short style where the narrow one is a signed number', () => {
    expect(relativeTime(now - 2 * 3_600_000, now, 'fr')).not.toMatch(/^[-−]/);
    expect(relativeTime(at(2026, 10, 13), now, 'ru')).not.toMatch(/^[-−]/);
  });

  it('reads a time a moment ahead of the clock as now, and nothing it cannot read as nothing', () => {
    expect(relativeTime(now + 30_000, now, 'en')).toBe('now');
    expect(relativeTime('not a date', now, 'en')).toBe('');
  });

  it('takes an ISO string, a Date or a number of milliseconds', () => {
    const then = at(2026, 10, 22, 18, 0);
    expect(relativeTime(new Date(then).toISOString(), now, 'en')).toBe('yesterday');
    expect(relativeTime(new Date(then), now, 'en')).toBe('yesterday');
    expect(relativeTime(then, now, 'en')).toBe('yesterday');
  });
});

describe('calendarDaysBetween', () => {
  it('counts the days between the two dates, not the hours', () => {
    expect(calendarDaysBetween(at(2026, 10, 22, 23, 59), at(2026, 10, 23, 0, 1))).toBe(1);
    expect(calendarDaysBetween(at(2026, 10, 23, 0, 1), at(2026, 10, 23, 23, 59))).toBe(0);
    expect(calendarDaysBetween(at(2026, 10, 1), at(2026, 11, 1))).toBe(31);
  });
});
