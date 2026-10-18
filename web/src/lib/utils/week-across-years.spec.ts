import { thisWeek, weekDaysAcrossYears, weekYearDays, weekYears } from '$lib/utils/week-across-years';

// Sunday 18 October 2026, in the reader's own calendar
const TODAY = new Date(2026, 9, 18, 9, 30);

const months = (...keys: string[]) => keys.map((key) => ({ timeBucket: `${key}-01`, count: 5 }));

describe(thisWeek.name, () => {
  it('runs Monday to Sunday around today', () => {
    const week = thisWeek(TODAY);
    expect(week.map((day) => day.getDate())).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(week[0].getDay()).toBe(1);
  });

  it('crosses a month or a year as the week does', () => {
    expect(thisWeek(new Date(2026, 11, 31)).map((day) => `${day.getMonth() + 1}/${day.getDate()}`)).toEqual([
      '12/28',
      '12/29',
      '12/30',
      '12/31',
      '1/1',
      '1/2',
      '1/3',
    ]);
  });
});

describe(weekDaysAcrossYears.name, () => {
  it("asks for this week's days in the past years whose month holds photos, never this year", () => {
    const days = weekDaysAcrossYears(TODAY, months('2026-10', '2025-10', '2013-10', '2013-03', '2010-07'));

    expect([...new Set(days.map(({ yearsAgo }) => yearsAgo))]).toEqual([1, 13]);
    expect(days.filter(({ yearsAgo }) => yearsAgo === 13).map(({ key }) => key)).toEqual([
      '2013-10-12',
      '2013-10-13',
      '2013-10-14',
      '2013-10-15',
      '2013-10-16',
      '2013-10-17',
      '2013-10-18',
    ]);
  });

  it('asks for nothing in an archive without photos', () => {
    expect(weekDaysAcrossYears(TODAY, [])).toEqual([]);
  });
});

describe(weekYears.name, () => {
  const days = weekDaysAcrossYears(TODAY, months('2025-10', '2013-10'));
  const cover = (timeBucket: string, id: string | null) => ({
    timeBucket,
    representativeAssetId: id,
    representativeThumbhash: null,
  });

  it("gives each year the photo of its day nearest today's, newest year first", () => {
    const years = weekYears(TODAY, days, [
      cover('2013-10-13', 'a'),
      cover('2013-10-16', 'b'),
      cover('2025-10-18', 'c'),
      cover('2025-10-12', 'd'),
      cover('2025-10-14', null),
    ]);

    expect(years).toEqual([
      { year: 2025, assetId: 'c', thumbhash: null, first: '2025-10-12', last: '2025-10-18' },
      { year: 2013, assetId: 'b', thumbhash: null, first: '2013-10-13', last: '2013-10-16' },
    ]);
  });

  it('leaves out a year with no photos that week', () => {
    expect(weekYears(TODAY, days, [cover('2025-10-15', 'x')]).map(({ year }) => year)).toEqual([2025]);
  });
});

describe(weekYearDays.name, () => {
  it("says the year's days in the reader's language", () => {
    expect(weekYearDays({ first: '2013-10-13', last: '2013-10-18' }, 'en').replaceAll('\u{2009}', ' ')).toBe(
      'Oct 13 – 18',
    );
    expect(weekYearDays({ first: '2013-10-17', last: '2013-10-17' }, 'en')).toBe('Oct 17');
  });
});
