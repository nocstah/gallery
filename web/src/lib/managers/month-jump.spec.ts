import {
  formatMonthJump,
  monthJumpParam,
  nearestMonth,
  parseMonthJump,
  parseMonthJumpParam,
} from '$lib/managers/month-jump';

describe('parseMonthJump', () => {
  it.each([
    ['July 2014', { year: 2014, month: 7 }],
    ['july 2014', { year: 2014, month: 7 }],
    ['Jul 2014', { year: 2014, month: 7 }],
    ['Jul. 2014', { year: 2014, month: 7 }],
    ['sept 2014', { year: 2014, month: 9 }],
    ['July, 2014', { year: 2014, month: 7 }],
    ['2014 July', { year: 2014, month: 7 }],
    ['2014-07', { year: 2014, month: 7 }],
    ['2014/7', { year: 2014, month: 7 }],
    ['07/2014', { year: 2014, month: 7 }],
    ['7.2014', { year: 2014, month: 7 }],
    ['2014年7月', { year: 2014, month: 7 }],
    ['2014', { year: 2014 }],
    ['  2014  ', { year: 2014 }],
  ])('reads %j', (query, expected) => {
    expect(parseMonthJump(query)).toEqual(expected);
  });

  it('reads month names in the palette language and in English', () => {
    expect(parseMonthJump('Juli 2014', ['de', 'en'])).toEqual({ year: 2014, month: 7 });
    expect(parseMonthJump('février 2014', ['fr', 'en'])).toEqual({ year: 2014, month: 2 });
    expect(parseMonthJump('fevrier 2014', ['fr', 'en'])).toEqual({ year: 2014, month: 2 }); // without the accent
    expect(parseMonthJump('July 2014', ['de', 'en'])).toEqual({ year: 2014, month: 7 });
  });

  it.each([
    '',
    'beach',
    'Paris 2014',
    'tags:nature beach',
    '2014-13',
    '13/2014',
    '1850',
    'ju 2014',
    '20145',
    'from:2025',
  ])('leaves %j alone', (query) => {
    expect(parseMonthJump(query)).toBeNull();
  });
});

describe('the ?jump= value', () => {
  it('round-trips a month and a year', () => {
    expect(monthJumpParam({ year: 2014, month: 7 })).toBe('2014-07');
    expect(monthJumpParam({ year: 2014 })).toBe('2014');
    expect(parseMonthJumpParam('2014-07')).toEqual({ year: 2014, month: 7 });
    expect(parseMonthJumpParam('2014')).toEqual({ year: 2014 });
    expect(parseMonthJumpParam('2014-7')).toBeNull();
    expect(parseMonthJumpParam(null)).toBeNull();
  });

  it('reads as a person writes it', () => {
    expect(formatMonthJump({ year: 2014, month: 7 })).toBe('July 2014');
    expect(formatMonthJump({ year: 2014, month: 7 }, 'de')).toBe('Juli 2014');
    expect(formatMonthJump({ year: 2014 })).toBe('2014');
  });
});

describe('nearestMonth', () => {
  // the timeline lists its months newest first
  const months = [
    { year: 2015, month: 1 },
    { year: 2014, month: 9 },
    { year: 2014, month: 5 },
    { year: 2012, month: 3 },
  ];

  it('lands on the month itself when it has photos', () => {
    expect(nearestMonth(months, { year: 2014, month: 5 })).toEqual({ year: 2014, month: 5 });
  });

  it('lands on the nearest month, the newer of two as near', () => {
    expect(nearestMonth(months, { year: 2014, month: 8 })).toEqual({ year: 2014, month: 9 });
    expect(nearestMonth(months, { year: 2014, month: 7 })).toEqual({ year: 2014, month: 9 });
    expect(nearestMonth(months, { year: 2001, month: 1 })).toEqual({ year: 2012, month: 3 });
  });

  it("lands on a year's newest month, or near its middle when it has none", () => {
    expect(nearestMonth(months, { year: 2014 })).toEqual({ year: 2014, month: 9 });
    expect(nearestMonth(months, { year: 2013 })).toEqual({ year: 2014, month: 5 }); // 11 months from mid-2013, 2012 is 15
    expect(nearestMonth([], { year: 2013 })).toBeUndefined();
  });
});
