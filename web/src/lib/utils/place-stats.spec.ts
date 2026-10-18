import { placeKey, placeLine, placeStatsOf, placeYears, rankPlaces, type PlaceStats } from '$lib/utils/place-stats';

describe(placeStatsOf.name, () => {
  it("adds up a place's photos and reads the years they span", () => {
    expect(
      placeStatsOf([
        { timeBucket: '2026-01-01', count: 40 },
        { timeBucket: '2013-01-01', count: 2 },
        { timeBucket: '2010-01-01', count: 1333 },
      ]),
    ).toEqual({ count: 1375, first: 2010, last: 2026 });
  });

  it('is empty for a timeline without photos', () => {
    expect(placeStatsOf([])).toEqual({ count: 0, first: 0, last: 0 });
    expect(placeStatsOf([{ timeBucket: '2020-01-01', count: 0 }]).count).toBe(0);
  });
});

describe(placeYears.name, () => {
  it('gives a span, or the year alone, never grouped as a number', () => {
    expect(placeYears({ first: 2010, last: 2026 })).toBe('2010–2026');
    expect(placeYears({ first: 2023, last: 2023 })).toBe('2023');
  });

  it('puts the count in the reader’s digits before the years', () => {
    expect(placeLine({ count: 1375, first: 2010, last: 2026 }, 'en')).toBe('1,375 · 2010–2026');
    expect(placeLine({ count: 1375, first: 2010, last: 2026 }, 'de')).toBe('1.375 · 2010–2026');
  });
});

describe(placeKey.name, () => {
  it('tells a city from one of the same name in another country', () => {
    expect(placeKey({ city: 'Paris', country: 'France' })).not.toBe(
      placeKey({ city: 'Paris', country: 'United States' }),
    );
    expect(placeKey({ city: 'Paris', country: null })).toBe(placeKey({ city: 'Paris' }));
  });
});

describe(rankPlaces.name, () => {
  const places = [{ city: 'Aneby' }, { city: 'Oslo' }, { city: 'Riverton' }, { city: 'Bodø' }, { city: 'Amsterdam' }];
  const stats: Record<string, PlaceStats | null> = {
    Aneby: { count: 12, first: 2010, last: 2016 },
    Oslo: { count: 1295, first: 2008, last: 2025 },
    Riverton: { count: 1375, first: 2010, last: 2026 },
    Amsterdam: { count: 12, first: 2022, last: 2024 },
  };

  it('puts the places with most photos first, then by name, and the ones not counted yet last', () => {
    expect(
      rankPlaces(
        places,
        (place) => place,
        ({ city }) => stats[city],
        'en',
      ).map(({ city }) => city),
    ).toEqual(['Riverton', 'Oslo', 'Amsterdam', 'Aneby', 'Bodø']);
  });

  it('keeps the places it could not count in the order they came', () => {
    expect(
      rankPlaces(
        places,
        (place) => place,
        () => undefined,
      ).map(({ city }) => city),
    ).toEqual(places.map(({ city }) => city));
  });
});
