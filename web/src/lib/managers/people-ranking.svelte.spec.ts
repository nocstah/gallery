import type { PeopleResponseDto, PersonResponseDto } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { peopleRanking } from '$lib/managers/people-ranking.svelte';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: the People page's order for the lists that carry ids and names only (the filter rail's People,
// an album's faces). The manager is one per page load, so the tests run in order and sign out between them.
const person = (id: string, name: string, numberOfAssets: number, extra: Partial<PersonResponseDto> = {}) =>
  ({ id, name, numberOfAssets, isHidden: false, filterId: `person:${id}`, ...extra }) as PersonResponseDto;

const people = (list: PersonResponseDto[]) =>
  ({ people: list, total: list.length, hidden: 0, hasNextPage: false }) as PeopleResponseDto;

describe('peopleRanking', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authManager.setUser(userAdminFactory.build({ id: 'me' }));
    authManager.setPreferences(preferencesFactory.build());
  });
  afterEach(() => eventManager.emit('AuthLogout'));

  it("orders the rail's options in the People page order, by their filter ids, once everyone is in", async () => {
    sdkMock.getAllPeople.mockResolvedValue(
      people([person('anna', 'Anna', 2), person('ben', 'Ben', 300), person('cleo', 'Cleo', 40, { isFavorite: true })]),
    );
    const options = [
      { id: 'person:anna', name: 'Anna' },
      { id: 'person:ben', name: 'Ben' },
      { id: 'person:cleo', name: 'Cleo' },
      { id: 'person:unknown', name: 'Dana' },
    ];
    expect(peopleRanking.order(options)).toBe(options);

    await peopleRanking.load();

    expect(sdkMock.getAllPeople).toHaveBeenCalledWith({ withHidden: false, withSharedSpaces: true, size: 1000 });
    expect(peopleRanking.settled).toBe(true);
    expect(peopleRanking.order(options).map(({ id }) => id)).toEqual([
      'person:cleo',
      'person:ben',
      'person:anna',
      'person:unknown',
    ]);
  });

  it('asks once while it is fresh, and moves a person changed meanwhile', async () => {
    sdkMock.getAllPeople.mockResolvedValue(people([person('anna', 'Anna', 2), person('ben', 'Ben', 300)]));
    await peopleRanking.load();
    await peopleRanking.load();
    expect(sdkMock.getAllPeople).toHaveBeenCalledTimes(1);

    eventManager.emit('PersonUpdate', person('anna', 'Anna', 2, { isFavorite: true }));

    expect(peopleRanking.order([{ id: 'person:ben' }, { id: 'person:anna' }]).map(({ id }) => id)).toEqual([
      'person:anna',
      'person:ben',
    ]);
  });

  it('leaves a list as it came when the people cannot be had', async () => {
    sdkMock.getAllPeople.mockReturnValue(undefined as never);
    const options = [{ id: 'person:b' }, { id: 'person:a' }];

    await peopleRanking.load();

    expect(peopleRanking.settled).toBe(true);
    expect(peopleRanking.order(options)).toBe(options);
  });
});
