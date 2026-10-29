// Local Omarchy layer: the moves that involve this library (gallery/moves), as the mover reports them, for the
// progress panel on every page; and the steps that hand the mover a key: the source's hand-off (S3), the
// destination's confirmation (D3), and a fresh key for a paused move (S7, D6). It polls only while something wants it
// (the panel, which mounts only where the page conditions hold): every 2 s while a move involves this library and the
// tab is visible, every 30 s while it is hidden, and not at all once the moves have ended, until the tab is shown
// again. When a move out of this library ends, the page clears its selection and reloads its data.
import { invalidateAll } from '$app/navigation';
import { currentLibrary } from '$lib/gallery/libraries/library-context.svelte';
import type { Library } from '$lib/gallery/libraries/library-file';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { openMovePage } from './move-gates';
import { deleteLeftoverMoveKeys, handOverMoveKey, keysInUse } from './move-keys';
import {
  cancelMove,
  confirmMove,
  giveKey,
  isEnded,
  listMoves,
  MoverError,
  newMoveId,
  startMove,
  type MoveKey,
  type MovePerson,
  type MoveSide,
  type MoverErrorCode,
  type MoveStatus,
} from './mover';

export const ACTIVE_VISIBLE_MS = 2000;
export const ACTIVE_HIDDEN_MS = 30_000;
/** An ended move shows on its own for a day after it ended, unless the owner closed it here before. */
export const ENDED_SHOWN_MS = 24 * 3_600_000;
const DISMISSED_KEY = 'kioku-moves-dismissed';
const DISMISSED_MOST = 50;

/**
 * What a page asks to move: a selection (from a person's page, with that person), or a person's photos alone, their
 * timeline, and with `archived` their archived photos too.
 */
export type MoveRequest =
  | { kind: 'selection'; ids: string[]; notOwned: number; person?: MovePerson }
  | { kind: 'person'; person: MovePerson; archived?: boolean };

/** The person as the hand-off names them: the id, the name when there is one, and whether the archived ones go. */
const handOffPerson = (person: MovePerson, archived: boolean) => ({
  id: person.id,
  ...(!!person.name && { name: person.name }),
  ...(archived && { archived: true as const }),
});

/** How a hand-off ended: the mover took it (and checks it now), another move is under way, or an error's code. */
export type HandOffOutcome = { kind: 'accepted' } | { kind: 'busy' } | { kind: 'error'; code: MoverErrorCode };

const codeOf = (error: unknown): MoverErrorCode => (error instanceof MoverError ? error.code : 'failed');

/**
 * Makes this side's key and sends it: first the mover's list (it must answer, or no key is made), which says the keys
 * it holds, so the leftovers can go; then the key, handed over under the rule in move-keys.
 */
export const withFreshKey = async <T>(side: MoveSide, move: string, send: (key: MoveKey) => Promise<T>) => {
  const moves = await listMoves();
  await deleteLeftoverMoveKeys(keysInUse(moves)).catch(() => 0);
  return handOverMoveKey(side, move, send);
};

const readDismissed = (): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const writeDismissed = (ids: string[]) => {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-DISMISSED_MOST)));
  } catch {
    // a private window, or storage turned off: the panel shows it again on the next page load
  }
};

class MoveManager {
  /** the moves that involve this library, newest first, as the mover last listed them */
  moves = $state.raw<MoveStatus[]>([]);
  /** whether the mover answered the last time it was asked (undefined: not asked yet) */
  reachable = $state<boolean | undefined>();

  #users = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #cleaned = false;
  // moves this page saw under way, or handed over, so it shows how they end and acts on it once
  #watching = new Set<string>();
  #settled = new Set<string>();
  #dismissed = $state<string[]>(readDismissed());

  /** The move under way that involves this library, if any: only one runs at a time. */
  get active(): MoveStatus | undefined {
    return this.moves.find(({ state }) => !isEnded(state));
  }

  /** What the panel shows: the move under way, and the ended ones this page saw or that ended today, until closed. */
  get shown(): MoveStatus[] {
    const now = Date.now();
    return this.moves.filter(
      (move) =>
        !isEnded(move.state) ||
        (!this.#dismissed.includes(move.move) &&
          (this.#watching.has(move.move) || now - Date.parse(move.endedAt ?? '') < ENDED_SHOWN_MS)),
    );
  }

  /** The panel mounts: start polling (once, however many ask). */
  start() {
    this.#users++;
    if (this.#users === 1) {
      document.addEventListener('visibilitychange', this.#onVisibility);
      void this.refresh();
    }
  }

  stop() {
    this.#users = Math.max(0, this.#users - 1);
    if (this.#users === 0) {
      document.removeEventListener('visibilitychange', this.#onVisibility);
      this.#clearTimer();
    }
  }

  #onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void this.refresh();
    } else {
      this.#schedule();
    }
  };

  #clearTimer() {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  #schedule() {
    this.#clearTimer();
    if (this.#users === 0 || !this.active) {
      return;
    }
    const delay = document.visibilityState === 'hidden' ? ACTIVE_HIDDEN_MS : ACTIVE_VISIBLE_MS;
    this.#timer = setTimeout(() => void this.refresh(), delay);
  }

  /** Asks the mover for the moves again, and acts on any that has ended since. */
  async refresh() {
    this.#clearTimer();
    let moves: MoveStatus[] | undefined;
    try {
      moves = await listMoves();
    } catch {
      moves = undefined;
    }
    if (moves) {
      this.reachable = true;
      for (const move of moves) {
        if (!isEnded(move.state)) {
          this.#watching.add(move.move);
        }
      }
      this.moves = moves;
      this.#settle(moves);
      if (!this.#cleaned) {
        // the first answer since the page loaded: keys a crash left behind can go, never one the mover holds
        this.#cleaned = true;
        void deleteLeftoverMoveKeys(keysInUse(moves)).catch(() => 0);
      }
    } else {
      this.reachable = false;
    }
    this.#schedule();
  }

  // a move out of this library that ended while this page watched: the selection is done with, the page reloads
  #settle(moves: MoveStatus[]) {
    const here = currentLibrary()?.id;
    for (const move of moves) {
      if (!isEnded(move.state) || !this.#watching.has(move.move) || this.#settled.has(move.move)) {
        continue;
      }
      this.#settled.add(move.move);
      // a refused or expired move took nothing away, and a move into this library leaves its selection as it is
      if (!here || move.source !== here || move.state === 'refused' || move.state === 'expired') {
        continue;
      }
      assetMultiSelectManager.clear();
      void invalidateAll();
    }
  }

  /** A move this page handed over: watch it from now on. */
  track(move: string) {
    this.#watching.add(move);
    void this.refresh();
  }

  /** The owner closed an ended move's words: they stay closed in this browser. */
  dismiss(move: string) {
    if (!this.#dismissed.includes(move)) {
      this.#dismissed = [...this.#dismissed, move];
      writeDismissed(this.#dismissed);
    }
  }

  /**
   * S3, after the click has opened the destination's move page: makes the source key and hands the move over. A
   * selection sends its ids (and, from a person's page, the person); a person's own ⋮ sends only the person, saying
   * whether their archived photos go too.
   */
  async handOff(move: string, request: MoveRequest, destination: Library): Promise<HandOffOutcome> {
    const here = currentLibrary();
    if (!here) {
      return { kind: 'error', code: 'failed' };
    }
    const archived = request.kind === 'person' && request.archived === true;
    try {
      await withFreshKey('source', move, (key) =>
        startMove({
          move,
          source: here.id,
          destination: destination.id,
          ...(request.kind === 'selection' && { assets: request.ids }),
          ...(request.person && { person: handOffPerson(request.person, archived) }),
          key,
        }),
      );
    } catch (error) {
      const code = codeOf(error);
      return code === 'busy' ? { kind: 'busy' } : { kind: 'error', code };
    }
    this.track(move);
    return { kind: 'accepted' };
  }

  /** D3: the destination's key and the holds moved anyway; the mover checks them, then the move runs. */
  async confirm(move: string, force: readonly string[]): Promise<HandOffOutcome> {
    try {
      await withFreshKey('destination', move, (key) => confirmMove(move, key, force));
    } catch (error) {
      return { kind: 'error', code: codeOf(error) };
    }
    this.track(move);
    return { kind: 'accepted' };
  }

  /** S7, D6: a fresh key for this side of a paused move. */
  async giveKey(move: string, side: MoveSide): Promise<HandOffOutcome> {
    try {
      await withFreshKey(side, move, (key) => giveKey(move, side, key));
    } catch (error) {
      return { kind: 'error', code: codeOf(error) };
    }
    this.track(move);
    return { kind: 'accepted' };
  }

  async cancel(move: string): Promise<HandOffOutcome> {
    try {
      await cancelMove(move);
    } catch (error) {
      return { kind: 'error', code: codeOf(error) };
    }
    await this.refresh();
    return { kind: 'accepted' };
  }

  /** Forgets everything (tests). */
  reset() {
    this.#clearTimer();
    if (this.#users > 0) {
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    this.#users = 0;
    this.#cleaned = false;
    this.#watching.clear();
    this.#settled.clear();
    this.#dismissed = readDismissed();
    this.moves = [];
    this.reachable = undefined;
  }
}

export const moveManager = new MoveManager();

/** S3, in the click: a new move's id, and its destination's move page opened inside the click. */
export const beginMove = (destination: Library): string | undefined => {
  const here = currentLibrary();
  if (!here) {
    return;
  }
  const move = newMoveId();
  openMovePage(destination, move, here.id);
  return move;
};
