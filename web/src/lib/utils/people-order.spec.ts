import { PeopleSortBy } from '$lib/stores/preferences.store';
import {
  comparePeopleMatches,
  inPeopleOrder,
  nameMatch,
  peoplePositions,
  peopleSortBy,
  sortInPeopleOrder,
} from '$lib/utils/people-order';

const person = (id: string, name: string, numberOfAssets = 0, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  numberOfAssets,
  ...extra,
});

describe('people order', () => {
  it("reads the People page's sort, Most photos for anything it does not know", () => {
    expect(peopleSortBy(PeopleSortBy.Name)).toBe(PeopleSortBy.Name);
    expect(peopleSortBy('whatever')).toBe(PeopleSortBy.PhotoCount);
    expect(peopleSortBy()).toBe(PeopleSortBy.PhotoCount);
  });

  it('ranks favourites first, then the most photos, the unnamed after the named and the hidden last', () => {
    const people = [
      person('hidden', 'Hal', 5000, { isHidden: true }),
      person('unnamed', '', 900),
      person('few', 'Anna', 2),
      person('favourite', 'Zelda', 1, { isFavorite: true }),
      person('many', 'Ben', 300),
    ];

    expect(sortInPeopleOrder(people).map(({ id }) => id)).toEqual(['favourite', 'many', 'few', 'unnamed', 'hidden']);
    expect(sortInPeopleOrder(people, PeopleSortBy.Name).map(({ id }) => id)).toEqual([
      'favourite',
      'few',
      'many',
      'unnamed',
      'hidden',
    ]);
  });

  it('tells how well a name answers what was typed, case and accents aside', () => {
    expect(nameMatch('Ann', 'ann')).toBe(0);
    expect(nameMatch('Anna', 'ann')).toBe(1);
    expect(nameMatch('Lee Ann', 'ann')).toBe(2);
    expect(nameMatch("O'Ann", 'ann')).toBe(2);
    expect(nameMatch('Marianne', 'ann')).toBe(3);
    expect(nameMatch('Amy', 'ann')).toBe(4);
    expect(nameMatch('Zoë', 'zoe')).toBe(0);
  });

  it('ranks matches by how well they match, then in the People page order', () => {
    const people = [
      person('inside', 'Marianne', 900),
      person('start-few', 'Annika', 2),
      person('start-many', 'Anna', 40),
    ];
    expect([...people].sort(comparePeopleMatches('ann')).map(({ id }) => id)).toEqual([
      'start-many',
      'start-few',
      'inside',
    ]);
  });

  it('orders a list of ids alone by where each stands, under any id the person goes by', () => {
    const positions = peoplePositions([
      person('p1', 'Anna', 2, { filterId: 'person:p1' }),
      person('p2', 'Ben', 300, { primaryProfile: { type: 'space-person', id: 'sp2' } }),
      person('p3', 'Cleo', 50, { primaryProfile: { type: 'user-person', id: 'g3' } }),
    ]);
    const options = [
      { id: 'person:p1', name: 'Anna' },
      { id: 'unknown-a', name: 'Dana' },
      { id: 'person:g3', name: 'Cleo' },
      { id: 'space-person:sp2', name: 'Ben' },
      { id: 'unknown-b', name: 'Eve' },
    ];

    expect(inPeopleOrder(options, positions).map(({ id }) => id)).toEqual([
      'space-person:sp2',
      'person:g3',
      'person:p1',
      'unknown-a',
      'unknown-b',
    ]);
  });
});
