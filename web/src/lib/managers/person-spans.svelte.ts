import { AssetVisibility, getTimeBuckets, TimeBucketSize } from '@immich/sdk';
import { SvelteMap } from 'svelte/reactivity';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { placeStatsOf, type PlaceStats } from '$lib/utils/place-stats';

// Local Omarchy layer: how many photos a person is in and the years they span, for the people whose name repeats on
// People (DESIGN.md, People; utils/person-names). Each person's timeline is asked for by year exactly as their page asks
// for it (`people/[personId]`: their scoped id, the timeline's photos, partners' and the Spaces' too), so the line says
// what the tile opens; a few at a time, each person once per page load, as `managers/place-stats` does for places.
// Read-only. Forgotten on sign-out.

/** A person as People lists them: the id, and the scoped filter token a Space's person carries. */
export type PersonSpanKey = { id: string; filterId?: string };

/** people asked for at once */
const AT_ONCE = 4;

class PersonSpanManager {
  // null: the person's timeline could not be read
  #spans = new SvelteMap<string, PlaceStats | null>();
  #asked = new Set<string>();
  #queue: PersonSpanKey[] = [];
  #running = 0;
  #listening = false;
  // a sign-out starts a new epoch: an answer still on its way for the account before is dropped
  #epoch = 0;

  /** A person's count and years once they are in; undefined before, null when their timeline could not be read. */
  get(id: string): PlaceStats | null | undefined {
    return this.#spans.get(id);
  }

  /** Ask for these people's counts and years: once each, a few at a time, in the order given. */
  request(people: Iterable<PersonSpanKey>) {
    if (!authManager.authenticated) {
      return;
    }
    if (!this.#listening) {
      this.#listening = true;
      eventManager.on({ AuthLogout: () => this.#clear() });
    }
    for (const person of people) {
      if (this.#asked.has(person.id)) {
        continue;
      }
      this.#asked.add(person.id);
      this.#queue.push(person);
    }
    this.#pump();
  }

  #pump() {
    while (this.#running < AT_ONCE && this.#queue.length > 0) {
      const person = this.#queue.shift()!;
      this.#running++;
      void this.#load(person).finally(() => {
        this.#running--;
        this.#pump();
      });
    }
  }

  async #load({ id, filterId }: PersonSpanKey) {
    const epoch = this.#epoch;
    try {
      const buckets = await getTimeBuckets({
        ...authManager.params,
        visibility: AssetVisibility.Timeline,
        personIds: [filterId ?? id],
        withPartners: true,
        withSharedSpaces: true,
        bucketSize: TimeBucketSize.Year,
      });
      if (epoch === this.#epoch) {
        this.#spans.set(id, placeStatsOf(buckets));
      }
    } catch {
      if (epoch === this.#epoch) {
        this.#spans.set(id, null);
      }
    }
  }

  #clear() {
    this.#epoch++;
    this.#spans.clear();
    this.#asked.clear();
    this.#queue = [];
  }
}

export const personSpans = new PersonSpanManager();
