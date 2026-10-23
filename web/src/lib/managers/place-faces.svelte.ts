import { searchAssets } from '@immich/sdk';
import { SvelteMap } from 'svelte/reactivity';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { choosePlaceFace, type PlaceAt } from '$lib/utils/place-faces';
import { placeKey } from '$lib/utils/place-stats';

// Local Omarchy layer: the photo each place tile shows on Places and in Explore's row (utils/place-faces), asked for
// once the tile comes near the screen (PlaceTile; the pages ask for their first screen, most photos first), a few places
// at a time, each once per page load, so the two pages
// show a place alike and a tile never changes photo once it has shown one: it keeps its quiet ground until its face is
// chosen. A place without a photo that qualifies, or whose question failed, shows the server's photo. One or two small
// searches a place (about 2 KB each). Forgotten on sign-out.

/** places asked about at once */
const AT_ONCE = 6;
/** a question not answered by then counts as failed */
const QUESTION_MS = 8000;
/** a place tile with its share of the gap, in CSS pixels squared (9rem and 10px, each way) */
const TILE_AREA = 154 * 154;

class PlaceFaceManager {
  // null: no photo qualifies, or the question failed (the tile shows the server's photo)
  #faces = new SvelteMap<string, string | null>();
  #asked = new Set<string>();
  #queue: PlaceAt[] = [];
  #running = 0;
  #listening = false;
  // who waits for answers (settle): woken as each place comes in, and on sign-out
  #waiters = new Set<() => void>();

  /** A place's face once chosen; null where the server's photo stands; undefined while it is looked for. */
  get(place: PlaceAt): string | null | undefined {
    return this.#faces.get(placeKey(place));
  }

  /** About how many place tiles fill the window (a tile is at least 9rem on the desktop's gap): a page asks for that
   * many faces first, in its own order, before its tiles ask for theirs. */
  firstScreen() {
    return typeof window === 'undefined' ? 0 : Math.ceil((window.innerWidth * window.innerHeight) / TILE_AREA);
  }

  /** Ask for these places' faces: once each, a few at a time, in the order given. */
  request(places: Iterable<PlaceAt>) {
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

  /** Ask for these places' faces and wait until they are all in, or `patience` milliseconds are up. */
  async settle(places: PlaceAt[], patience: number): Promise<void> {
    this.request(places);
    const deadline = Date.now() + patience;
    while (
      places.some((place) => this.get(place) === undefined) &&
      Date.now() < deadline &&
      authManager.authenticated
    ) {
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

  async #load(place: PlaceAt) {
    const key = placeKey(place);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUESTION_MS);
    try {
      const face = await choosePlaceFace(place, (filter, size) =>
        searchAssets(
          // the places' own reach: my photos, my partners' and the Spaces on my timeline (GET /search/cities')
          { metadataSearchDto: { filter, size, withSharedSpaces: true } },
          { signal: controller.signal },
        ).then(({ assets }) => assets.items),
      );
      this.#faces.set(key, face ?? null);
    } catch {
      this.#faces.set(key, null);
    } finally {
      clearTimeout(timer);
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
    this.#faces.clear();
    this.#asked.clear();
    this.#queue = [];
    this.#wake();
  }
}

export const placeFaces = new PlaceFaceManager();
