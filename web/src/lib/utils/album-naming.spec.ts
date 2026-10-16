import { datesOf, placeOf, suggestAlbumName, type NamedAsset } from '$lib/utils/album-naming';

// the locale's ranges put thin spaces around the dash
const plain = (text: string) => text.replaceAll(/\s/g, ' ');

const at = (date: string, city: string | null = null, country: string | null = null): NamedAsset => {
  const [year, month, day] = date.split('-').map(Number);
  return {
    localDateTime: { year, month, day, hour: 12, minute: 0, second: 0, millisecond: 0 },
    city,
    country,
  };
};

describe('suggestAlbumName', () => {
  it('names photos by their city and the days they span', () => {
    const name = suggestAlbumName(
      [at('2023-03-12', 'Phuket', 'Thailand'), at('2023-03-15', 'Phuket', 'Thailand')],
      'en',
    );
    expect(plain(name)).toBe('Phuket · Mar 12 – 15, 2023');
  });

  it('gives the dates alone when no photo has a place', () => {
    expect(plain(suggestAlbumName([at('2023-03-12'), at('2023-04-20')], 'en'))).toBe('Mar – Apr 2023');
  });

  it('gives an empty name for no photos', () => {
    expect(suggestAlbumName([], 'en')).toBe('');
  });
});

describe('placeOf', () => {
  it('names two cities, the more frequent first', () => {
    expect(placeOf([at('2023-03-12', 'Phuket'), at('2023-03-13', 'Bangkok'), at('2023-03-14', 'Bangkok')])).toBe(
      'Bangkok, Phuket',
    );
  });

  it('falls back to the country past two cities', () => {
    const assets = [
      at('2023-03-12', 'Phuket', 'Thailand'),
      at('2023-03-13', 'Bangkok', 'Thailand'),
      at('2023-03-14', 'Krabi', 'Thailand'),
    ];
    expect(placeOf(assets)).toBe('Thailand');
  });

  it('takes the most frequent country past two countries', () => {
    const assets = [
      at('2023-03-12', 'Oslo', 'Norway'),
      at('2023-03-13', 'Bergen', 'Norway'),
      at('2023-03-14', 'Stockholm', 'Sweden'),
      at('2023-03-15', 'Copenhagen', 'Denmark'),
    ];
    expect(placeOf(assets)).toBe('Norway');
  });

  it('has no place when no photo has one', () => {
    expect(placeOf([at('2023-03-12')])).toBeUndefined();
  });
});

describe('datesOf', () => {
  it('gives one day as that day', () => {
    expect(plain(datesOf([at('2023-03-12'), at('2023-03-12')], 'en'))).toBe('Mar 12, 2023');
  });

  it('gives a span across years in years', () => {
    expect(plain(datesOf([at('2019-06-01'), at('2020-08-01')], 'en'))).toBe('2019 – 2020');
  });

  it('follows the locale', () => {
    expect(datesOf([at('2023-03-12'), at('2023-04-20')], 'de')).toBe('März–Apr. 2023');
  });
});
