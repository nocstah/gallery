import { dayLabel, monthMarkLabel, tileDateLabel } from '$lib/utils/timeline-dates';

describe('monthMarkLabel', () => {
  it('sets the short month in capitals', () => {
    expect(monthMarkLabel({ year: 2026, month: 9 }, false, 'en-US')).toBe('SEP');
  });

  it('adds the year in the locale order when asked', () => {
    expect(monthMarkLabel({ year: 2025, month: 12 }, true, 'en-US')).toBe('DEC 2025');
    expect(monthMarkLabel({ year: 2025, month: 12 }, true, 'zh-Hans')).toBe('2025年12月');
  });

  it('keeps a locale year marker as the locale writes it', () => {
    const label = monthMarkLabel({ year: 2025, month: 12 }, true, 'ru');
    expect(label.startsWith('ДЕК')).toBe(true);
    expect(label).toContain('2025');
    expect(label).not.toContain('Г.');
  });

  it('falls back to the browser locale for the default and for tags Intl refuses', () => {
    expect(monthMarkLabel({ year: 2026, month: 3 }, false, 'default')).toBe(
      monthMarkLabel({ year: 2026, month: 3 }, false),
    );
    expect(() => monthMarkLabel({ year: 2026, month: 3 }, false, 'en_US')).not.toThrow();
  });
});

describe('tileDateLabel', () => {
  it('leaves the year out for this year', () => {
    expect(tileDateLabel({ year: 2026, month: 10, day: 11 }, 'en-US', 2026)).toBe('Sun, Oct 11');
  });

  it('writes the year for any other year', () => {
    expect(tileDateLabel({ year: 2019, month: 3, day: 2 }, 'en-US', 2026)).toBe('Sat, Mar 2, 2019');
  });

  it('says nothing for a date it cannot read', () => {
    expect(tileDateLabel({} as never, 'en-US')).toBe('');
  });
});

describe('dayLabel', () => {
  it('writes the day with its year, whatever the year', () => {
    expect(dayLabel({ year: 2019, month: 10, day: 11 }, 'en-US')).toBe('Oct 11, 2019');
    expect(dayLabel({ year: new Date().getFullYear(), month: 4, day: 2 }, 'en-US')).toContain(
      String(new Date().getFullYear()),
    );
  });

  it('follows the locale', () => {
    expect(dayLabel({ year: 2019, month: 10, day: 11 }, 'de')).toBe('11. Okt. 2019');
    expect(dayLabel({ year: 2019, month: 10, day: 11 }, 'zh-Hans')).toBe('2019年10月11日');
  });

  it('says nothing for a date it cannot read', () => {
    expect(dayLabel({} as never, 'en-US')).toBe('');
  });
});
