// Local Omarchy layer: one place to take things back. An action that can be undone records how here, so its undo
// outlives the toast that offered it: the bar's undo button (components/omarchy/BarUndo.svelte) lists the recent
// ones, newest first, and Ctrl+Z takes back the newest. The history lasts as long as the page (a reload starts it
// afresh) and keeps the last 30. An entry leaves once it is undone, from the bar, Ctrl+Z or its toast's own Undo
// button alike, so nothing is taken back twice.
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { page } from '$app/state';
import { handleError } from '$lib/utils/handle-error';

export type UndoEntry = {
  id: number;
  /** what was done, in the words of its toast ("Trashed 3 assets") */
  label: string;
  at: number;
  /** takes it back; may return what to say once done ("Restored 3 assets") */
  undo: () => Promise<string | void>;
  /** what to say when taking it back fails (it then stays on the list, to try again) */
  failed?: string;
};

const LIMIT = 30;

/** The page an action was taken on (its route and params, not the photo open in it): an undo made from another page
 * leaves the first page's own callbacks alone (they would act on a page that is gone). */
export const pageKey = () => {
  try {
    const params = Object.entries(page.params ?? {})
      .filter(([key]) => key !== 'assetId' && key !== 'photos')
      .map((entry) => entry.join('='))
      .join('&');
    return `${page.route?.id ?? ''}?${params}`;
  } catch {
    return '';
  }
};

class UndoManager {
  entries = $state<UndoEntry[]>([]);
  #next = 1;
  // undos run one after another, in the order asked: one on the same photos as another (archived, then trashed)
  // must not overtake it, and a second Ctrl+Z while the first is still on its way waits instead of being dropped
  #pending = $state(0);
  #chain: Promise<void> = Promise.resolve();

  /** an undo is on its way (the bar's rows wait) */
  get busy() {
    return this.#pending > 0;
  }

  /** Records how to take an action back; the id is for its toast's own Undo button. */
  record(label: string, undo: UndoEntry['undo'], failed?: string) {
    const entry: UndoEntry = { id: this.#next++, label, at: Date.now(), undo, failed };
    this.entries = [entry, ...this.entries].slice(0, LIMIT);
    return entry.id;
  }

  /** Takes back the named entry, or the newest; resolves once it (and any undo before it) has run. */
  undo(id?: number): Promise<void> {
    const entry = id === undefined ? this.entries[0] : this.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      return this.#chain;
    }
    // off the list before it runs, so a second press cannot run it again
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.#pending++;
    this.#chain = this.#chain.then(() => this.#run(entry));
    return this.#chain;
  }

  async #run(entry: UndoEntry) {
    try {
      const done = await entry.undo();
      if (done) {
        toastManager.primary(done);
      }
    } catch (error) {
      this.entries = [...this.entries, entry].sort((a, b) => b.id - a.id);
      handleError(error, entry.failed ?? get(t)('errors.something_went_wrong'));
    } finally {
      this.#pending--;
    }
  }
}

export const undoManager = new UndoManager();
