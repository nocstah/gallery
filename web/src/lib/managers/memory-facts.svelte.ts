import { SvelteMap } from 'svelte/reactivity';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { curator, curatorIsMine, type MemoryFacts } from '$lib/utils/curator';

// Local Omarchy layer: what Curator knows of each memory (its places, people, span, count, cover and faces), for the
// titles of the Memories cards and of a memory's film (utils/memory-title) and for the film's cover and drift. Asked
// for in batches as pages show memories, each memory once per page load, and for Curator's owner only (curatorIsMine):
// a family member's account asks nothing, and its titles come from the memories themselves.

/** memories a request asks for at most: a page of 250 memories goes in a few short URLs */
const BATCH = 40;
/** the cards wait this long for Curator before they show what the memories say of themselves; a later answer lands */
const PATIENCE_MS = 2000;

class MemoryFactsManager {
  // null: Curator answered and knows nothing of the memory
  #facts = new SvelteMap<string, MemoryFacts | null>();
  #asked = new Set<string>();
  #queue = new Set<string>();
  #queued = false;
  // the sign-out that forgets them is listened for from the first request on, so importing this costs nothing
  #listening = false;
  // who waits for answers (settle): woken whenever a batch is answered or given up on, and on sign-out
  #waiters = new Set<() => void>();

  /** A memory's facts once Curator has told them; undefined before, without them, and for anyone but its owner. */
  get(memoryId: string): MemoryFacts | undefined {
    return curatorIsMine() ? (this.#facts.get(memoryId) ?? undefined) : undefined;
  }

  /** Whether Curator has answered for the memory, either way (a film waits for that before it plans its opening). */
  settled(memoryId: string): boolean {
    return !curatorIsMine() || this.#facts.has(memoryId);
  }

  /** Whether Curator has answered for all of these memories: the Memories page lays out its cards once it has, since
   * the facts tell which memories read the same (utils/memory-cards). */
  settledAll(memoryIds: Iterable<string>): boolean {
    if (!curatorIsMine()) {
      return true;
    }
    for (const id of memoryIds) {
      if (!this.#facts.has(id)) {
        return false;
      }
    }
    return true;
  }

  /** Ask for these memories' facts and wait until Curator has answered for all of them, or its patience is up (a
   * memory's page waits so before it checks which card the photo in its address belongs to). */
  async settle(memoryIds: string[]): Promise<void> {
    while (!this.settledAll(memoryIds)) {
      const answered = new Promise<void>((resolve) => this.#waiters.add(resolve));
      this.request(memoryIds);
      await answered;
    }
  }

  /** Ask Curator for these memories' facts: once each, in one batch per tick. */
  request(memoryIds: Iterable<string>) {
    if (!curatorIsMine()) {
      return;
    }
    if (!this.#listening) {
      this.#listening = true;
      eventManager.on({ AuthLogout: () => this.#clear() });
    }
    for (const id of memoryIds) {
      if (this.#asked.has(id)) {
        continue;
      }
      this.#asked.add(id);
      this.#queue.add(id);
    }
    if (this.#queue.size > 0 && !this.#queued) {
      this.#queued = true;
      queueMicrotask(() => void this.#flush());
    }
  }

  async #flush() {
    this.#queued = false;
    const ids = [...this.#queue];
    this.#queue.clear();
    await Promise.all(
      Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, index) =>
        this.#ask(ids.slice(index * BATCH, (index + 1) * BATCH)),
      ),
    );
  }

  async #ask(batch: string[]) {
    const unknown = () => {
      for (const id of batch) {
        if (!this.#facts.has(id)) {
          this.#facts.set(id, null);
        }
      }
    };
    const answered = curator
      .memoryFacts(batch)
      .then(({ memories }) => {
        for (const id of batch) {
          this.#facts.set(id, memories?.[id] ?? null);
        }
      })
      // Curator not answering: these memories are titled by what they say of themselves
      .catch(unknown);
    await Promise.race([answered, new Promise((resolve) => setTimeout(resolve, PATIENCE_MS))]);
    unknown();
    this.#wake();
  }

  #wake() {
    const waiters = [...this.#waiters];
    this.#waiters.clear();
    for (const wake of waiters) {
      wake();
    }
  }

  #clear() {
    this.#facts.clear();
    this.#asked.clear();
    this.#queue.clear();
    this.#wake();
  }
}

export const memoryFacts = new MemoryFactsManager();
