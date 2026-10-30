import {
  daysFromToday,
  isoDay,
  isTomorrow,
  nearDayKey,
  seriesDate,
  seriesLongDate,
  seriesPlainDate,
} from './series-days';

// Local Omarchy layer: the days of a series as Coming up says them (gallery/series): Curator's 'YYYY-MM-DD' is a day on
// the calendar, tomorrow by this computer's, and a later day the weekday and the date as a photo's tile says them.

const friday = new Date(2026, 9, 30, 21, 45);

describe('isTomorrow', () => {
  it('is the next day on this computer’s calendar, late in the evening too', () => {
    expect(isTomorrow('2026-10-31', friday)).toBe(true);
    expect(isTomorrow('2026-10-30', friday)).toBe(false);
    expect(isTomorrow('2026-11-01', friday)).toBe(false);
    expect(isTomorrow('2027-01-01', new Date(2026, 11, 31, 23, 59))).toBe(true);
  });
});

describe('isoDay', () => {
  it('writes a day as Curator does', () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('seriesDate', () => {
  it('says the weekday and the date, with the year only when it is not this year’s', () => {
    expect(seriesDate('2026-11-01', 'en-US', friday)).toBe('Sun, Nov 1');
    expect(seriesDate('2027-01-03', 'en-US', friday)).toBe('Sun, Jan 3, 2027');
  });

  it('follows the reader’s language', () => {
    expect(seriesDate('2026-11-01', 'de-DE', friday)).toBe('So., 1. Nov.');
  });

  it('leaves a day it cannot read as it is', () => {
    expect(seriesDate('soon', 'en-US', friday)).toBe('soon');
  });
});

describe('daysFromToday', () => {
  it('counts calendar days from today, early in the morning too', () => {
    const early = new Date(2026, 9, 31, 0, 5);
    expect(daysFromToday('2026-10-31', early)).toBe(0);
    expect(daysFromToday('2026-11-01', early)).toBe(1);
    expect(daysFromToday('2026-10-30', early)).toBe(-1);
    expect(daysFromToday('2027-01-01', new Date(2026, 11, 31, 23, 59))).toBe(1);
    expect(daysFromToday('soon', early)).toBeNaN();
  });
});

describe('nearDayKey', () => {
  it('names yesterday, today and tomorrow, and no other day', () => {
    expect(nearDayKey('2026-10-29', friday)).toBe('memory_series_yesterday');
    expect(nearDayKey('2026-10-30', friday)).toBe('memory_series_today');
    expect(nearDayKey('2026-10-31', friday)).toBe('memory_series_tomorrow');
    expect(nearDayKey('2026-11-01', friday)).toBeUndefined();
  });
});

describe('seriesPlainDate and seriesLongDate', () => {
  it('say a day in a sentence: the date with its year, or the weekday and the date in full', () => {
    expect(seriesPlainDate('2026-11-30', 'en-US')).toBe('Nov 30, 2026');
    expect(seriesLongDate('2026-11-01', 'en-US', friday)).toBe('Sunday, November 1');
    expect(seriesLongDate('2027-01-03', 'en-US', friday)).toBe('Sunday, January 3, 2027');
    expect(seriesLongDate('2026-11-01', 'de-DE', friday)).toBe('Sonntag, 1. November');
  });

  it('leave a day they cannot read as it is, in a language Intl does not know too', () => {
    expect(seriesPlainDate('soon', 'en-US')).toBe('soon');
    expect(seriesLongDate('soon', 'en-US', friday)).toBe('soon');
    expect(seriesLongDate('2026-11-01', 'not a language', friday)).toMatch(/1/);
  });
});
