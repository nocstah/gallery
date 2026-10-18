import { thisWeek, weekDaysAcrossYears, weekSpread, weekYearDays, weekYears } from '$lib/utils/week-across-years';

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

describe(weekSpread.name, () => {
  // this week in every year from 2025 back to 2001: one to twenty-five years ago
  const span = (from: number, to: number) =>
    Array.from({ length: from - to + 1 }, (_, index) => ({ year: from - index }));
  const years = (list: { year: number }[]) => list.map(({ year }) => year);

  it('keeps every year when they all fit', () => {
    expect(years(weekSpread(span(2025, 2021), 11, 2026))).toEqual([2025, 2024, 2023, 2022, 2021]);
  });

  it('spans a phone row of five: the newest, five, ten and twenty years ago, and the oldest', () => {
    expect(years(weekSpread(span(2025, 2001), 5, 2026))).toEqual([2025, 2021, 2016, 2006, 2001]);
  });

  it('takes the nearest year where one is missing at a mark, the older when two are as near', () => {
    const list = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2013, 2001, 1996, 1977].map((year) => ({ year }));
    // ten years ago (2016) has no photos: 2013 and 2019 are as near, and the older wins
    expect(years(weekSpread(list, 5, 2026))).toEqual([2025, 2021, 2013, 2001, 1977]);
  });

  it('fills a wider row with the anniversaries between, then the middles of the widest gaps', () => {
    const row = years(weekSpread(span(2025, 2001), 11, 2026));
    expect(row).toHaveLength(11);
    expect(row).toEqual([2025, 2023, 2021, 2018, 2016, 2013, 2011, 2008, 2006, 2003, 2001]);
  });

  it('never drops the oldest year for a newer one', () => {
    for (const slots of [2, 3, 4, 6, 8]) {
      const row = years(weekSpread(span(2025, 1990), slots, 2026));
      expect(row).toHaveLength(slots);
      expect(row.at(-1)).toBe(1990);
      expect(row[0]).toBe(2025);
    }
  });
});
