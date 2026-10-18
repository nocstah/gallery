import { getTimeBuckets, TimeBucketSize } from '@immich/sdk';
import { SvelteMap } from 'svelte/reactivity';
import { createFilterState } from '$lib/components/filter-panel/filter-panel';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { buildPhotosTimelineOptions } from '$lib/utils/photos-filter-options';
import { placeKey, placeStatsOf, type PlaceKey, type PlaceStats } from '$lib/utils/place-stats';

// Local Omarchy layer: how many photos each place holds and the years they span, for the place tiles on Places and
// Explore (DESIGN.md, Places). Gallery lists one photo per city (GET /search/cities) and counts nothing, so each place's
// timeline is asked for by year, exactly as the Photos page filtered to that place asks for it (its city and country,
// partners and Spaces on the timeline, stacks as one), so a tile's count is what it opens. A few at a time, each place
// once per page load: 254 places took half a second. Forgotten on sign-out.

/** places asked for at once */
const AT_ONCE = 6;

class PlaceStatsManager {
  // null: the place's timeline could not be read
  #stats = new SvelteMap<string, PlaceStats | null>();
  #asked = new Set<string>();
  #queue: PlaceKey[] = [];
  #running = 0;
  #listening = false;
  // who waits for answers (settle): woken as each place comes in, and on sign-out
  #waiters = new Set<() => void>();

  /** A place's count and years once they are in; undefined before, null when its timeline could not be read. */
  get(place: PlaceKey): PlaceStats | null | undefined {
    return this.#stats.get(placeKey(place));
  }

  /** Whether every one of these places is in, either way. */
  settledAll(places: Iterable<PlaceKey>): boolean {
    for (const place of places) {
      if (!this.#stats.has(placeKey(place))) {
        return false;
      }
    }
    return true;
  }

  /** Ask for these places' counts and years: once each, a few at a time, in the order given. */
  request(places: Iterable<PlaceKey>) {
    if (!authManager.authenticated) {
      return;
    }
    if (!this.#listening) {
      this.#listening = true;
      eventManager.on({ AuthLogout: () => this.#clear() });
    }
    for (const place of places) {
      const key = placeKey(place);
      if (this.#asked.has(key)) {
        continue;
      }
      this.#asked.add(key);
      this.#queue.push(place);
    }
    this.#pump();
  }

  /** Ask for these places and wait until they are all in, or `patience` milliseconds are up. */
  async settle(places: PlaceKey[], patience: number): Promise<void> {
    this.request(places);
    const deadline = Date.now() + patience;
    while (!this.settledAll(places) && Date.now() < deadline && authManager.authenticated) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
        this.#waiters.add(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  #pump() {
    while (this.#running < AT_ONCE && this.#queue.length > 0) {
      const place = this.#queue.shift()!;
      this.#running++;
      void this.#load(place).finally(() => {
        this.#running--;
        this.#wake();
        this.#pump();
      });
    }
  }

  async #load(place: PlaceKey) {
    const key = placeKey(place);
    const userId = authManager.authenticated ? authManager.user.id : undefined;
    if (!userId) {
      return;
    }
    try {
      const options = buildPhotosTimelineOptions(
        { ...createFilterState(), city: place.city, country: place.country ?? undefined },
        userId,
      );
      const buckets = await getTimeBuckets({ ...authManager.params, ...options, bucketSize: TimeBucketSize.Year });
      this.#stats.set(key, placeStatsOf(buckets));
    } catch {
      this.#stats.set(key, null);
    }
  }

  #wake() {
    const waiters = [...this.#waiters];
    this.#waiters.clear();
    for (const wake of waiters) {
      wake();
    }
  }

  #clear() {
    this.#stats.clear();
    this.#asked.clear();
    this.#queue = [];
    this.#wake();
  }
}

export const placeStats = new PlaceStatsManager();
