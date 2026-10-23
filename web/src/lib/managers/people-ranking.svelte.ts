import { getAllPeople, type PersonResponseDto } from '@immich/sdk';
import { fromStore } from 'svelte/store';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { peopleViewSettings } from '$lib/stores/preferences.store';
import { inPeopleOrder, peoplePositions, peopleSortBy } from '$lib/utils/people-order';

// Local Omarchy layer: the People page's order for the lists that carry only people's ids and names, which Gallery
// sends A to Z with no favourite or count to rank them by: the filter rail's People and an album's faces (DESIGN.md,
// People; utils/people-order). Everyone the reader can see, as the People page lists them (their own and the Spaces'
// on their timeline, with their counts), in one request of up to 1,000 named people first; kept for ten minutes, and a
// person changed meanwhile (a favourite, a name, hidden) takes their new place at once. Forgotten on sign-out.

/** how long the list is trusted */
const KEPT_MS = 10 * 60 * 1000;
/** the most the server sends at once: named people come first, so this holds every named person of a large library */
const PAGE = 1000;
/** how long a list waits for the order before it shows as it came */
const WAIT_MS = 2000;

class PeopleRanking {
  #people = $state<PersonResponseDto[]>();
  #loading: Promise<void> | undefined;
  #at = 0;
  #listening = false;
  #settings = fromStore(peopleViewSettings);

  /** where each person stands in the People page's order, by every id they go by; undefined until known */
  positions = $derived(
    this.#people ? peoplePositions(this.#people, peopleSortBy(this.#settings.current.sortBy)) : undefined,
  );

  #settled = $state(false);

  /** Whether a list may show: the order is known, could not be had or took too long (then lists keep the order they
   * came in), or there is no one signed in to rank for. */
  get settled() {
    return this.#settled || !authManager.authenticated;
  }

  /** Asks for the order unless it is fresh; resolves once it is known or has failed. */
  load(): Promise<void> {
    if (!authManager.authenticated) {
      return Promise.resolve();
    }
    if (!this.#listening) {
      this.#listening = true;
      eventManager.on({
        AuthLogout: () => this.#clear(),
        PersonUpdate: (person) => this.#update(person),
      });
    }
    if (this.#people && Date.now() - this.#at < KEPT_MS) {
      return Promise.resolve();
    }
    if (this.#loading) {
      return this.#loading;
    }
    // a list waits for the order this long at most, then shows in the order it came in
    const waited = setTimeout(() => (this.#settled = true), WAIT_MS);
    this.#loading = (async () => {
      try {
        const { people } = await getAllPeople({ withHidden: false, withSharedSpaces: true, size: PAGE });
        this.#people = people;
        this.#at = Date.now();
      } catch {
        // the lists keep the order they came in
      } finally {
        clearTimeout(waited);
        this.#loading = undefined;
        this.#settled = true;
      }
    })();
    return this.#loading;
  }

  /**
   * `items` in the People page's order once it is known, anyone it does not know after the rest; as they came until
   * then, or when it knows fewer than half of them: a Space's own people (its photos' rail) go by ids of the Space's,
   * which the People page's list does not hold, and one of them leading the rest A to Z would read as no order at all.
   */
  order<T extends { id: string }>(items: T[]): T[] {
    const positions = this.positions;
    if (!positions) {
      return items;
    }
    const known = items.filter(({ id }) => positions.has(id)).length;
    return known * 2 < items.length ? items : inPeopleOrder(items, positions);
  }

  #update(person: PersonResponseDto) {
    if (!this.#people) {
      return;
    }
    this.#people = person.isHidden
      ? this.#people.filter(({ id }) => id !== person.id)
      : this.#people.map((known) => (known.id === person.id ? { ...known, ...person } : known));
  }

  #clear() {
    this.#people = undefined;
    this.#at = 0;
    this.#settled = false;
  }
}

export const peopleRanking = new PeopleRanking();
