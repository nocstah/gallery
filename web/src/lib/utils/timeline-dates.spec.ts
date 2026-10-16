import { monthMarkLabel } from '$lib/utils/timeline-dates';

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
