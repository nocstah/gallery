// Local Omarchy layer: the sidebar as a place to carry photos to, as on the Mac ("I want what Mac photos has… easy
// album management"). Photos lifted out of a grid (actions/marquee-select) can be dropped on an album row (the Albums
// tree, a Space's tree, the pinned albums), on To do, Villa or QR, on a Space, or on the New album zone that shows at
// the sidebar's foot while photos are carried. A folder row springs open after a short hover, as Finder's
// spring-loaded folders do, and the folders a drag opened close again when it leaves the sidebar or ends without a
// drop there (a drop keeps the ones on the way to where the photos went open). Near the sidebar's top or bottom edge
// the carried photos scroll it.
//
// The rows say what they are with two actions: `dropTarget` (what photos dropped here go to) and `dropSpring` (how to
// open and close the folder the row heads). This module decides, from what is carried and where it comes from, which
// row takes the photos and lights it (`data-drop-target`); what a drop then does lives in services/sidebar-drop,
// loaded on first use. Touch keeps Immich's long-press, and a sidebar that is hidden (a phone, the drawer, put away by
// hand) offers nothing.
import type { SharedSpaceResponseDto } from '@immich/sdk';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { MAX_SPACE_ASSETS_PER_REQUEST } from '$lib/constants';
import { authManager } from '$lib/managers/auth-manager.svelte';
import type { SpecialAlbumManager } from '$lib/managers/special-albums.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { locale } from '$lib/stores/preferences.store';
import { suggestAlbumName } from '$lib/utils/album-naming';

/** What a row takes photos into. `writable`: whether I may add to it (an editor of the album, of the Space). */
export type DropTarget =
  | { kind: 'album'; id: string; name: string; writable: boolean }
  | { kind: 'special'; special: SpecialAlbumManager; name: string }
  | { kind: 'space'; space: SharedSpaceResponseDto; writable: boolean }
  | { kind: 'new-album' };

/** A row that heads a folder (an album folder, a Space's tree, Albums, Shared): a hover opens it. */
export type Spring = { isOpen: () => boolean; open: () => void; close: () => void };

/** Where photos come from: the album or Space on screen, which is no place to drop them again. */
export type Source = { albumId?: string; spaceId?: string };

/** The photos being carried. */
export type Carry = {
  ids: string[];
  /** the photos as the grid knows them (where, when and whose); a photo it cannot name is missing here */
  assets: TimelineAsset[];
  source: Source;
  /** me, to tell my photos from the ones I may only look at */
  me?: string;
};

/** What the carried photo says it will do, under it. */
export type Offer = { label?: string; detail?: string };

/** How long a folder row is pointed at before it springs open. */
export const SPRING_MS = 700;
/** How long the pointer may be off the sidebar before the folders a drag opened close again. */
export const LEAVE_MS = 400;
/** The band at the sidebar's top and bottom that scrolls it while photos are carried. */
export const EDGE = 48;

const targets = new WeakMap<Element, DropTarget>();
const springs = new WeakMap<Element, Spring>();

/** Svelte action: photos dropped on this row go to the target (nothing, while the target is undefined). */
export const dropTarget = (node: HTMLElement, target: DropTarget | undefined) => {
  const set = (next: DropTarget | undefined) => {
    if (next) {
      targets.set(node, next);
      node.dataset.drop = next.kind;
    } else {
      targets.delete(node);
      delete node.dataset.drop;
    }
  };
  set(target);
  return {
    update: set,
    destroy: () => set(undefined),
  };
};

/** Svelte action: this row heads a folder that springs open when photos are held over it. */
export const dropSpring = (node: HTMLElement, spring: Spring | undefined) => {
  const set = (next: Spring | undefined) => {
    if (next) {
      springs.set(node, next);
      node.dataset.dropSpring = '';
    } else {
      springs.delete(node);
      delete node.dataset.dropSpring;
    }
  };
  set(spring);
  return {
    update: set,
    destroy: () => set(undefined),
  };
};

/** The album (or Space) whose page is on screen: /albums/<id>, /spaces/<id>, /spaces/<id>/albums/<id>. */
export const sourceOf = (pathname: string): Source => {
  const space = /^\/spaces\/([^/]+)/.exec(pathname)?.[1];
  const album =
    /^\/albums\/([^/]+)/.exec(pathname)?.[1] ?? /^\/spaces\/[^/]+\/albums\/([^/]+)/.exec(pathname)?.[1] ?? undefined;
  return { ...(album && { albumId: album }), ...(space && { spaceId: space }) };
};

/** My photos among those carried: the only ones a Space, To do, Villa, QR or a new album can take. */
export const mineOf = (carry: Carry) =>
  carry.me ? carry.assets.filter((asset) => asset.ownerId === carry.me) : ([] as TimelineAsset[]);

/** Whether the target takes the carried photos: never the album or Space they come from, nor one I cannot add to. */
export const accepts = (target: DropTarget, carry: Carry): boolean => {
  if (carry.ids.length === 0) {
    return false;
  }
  switch (target.kind) {
    case 'album': {
      return target.writable && target.id !== carry.source.albumId;
    }
    case 'special': {
      // the add path only: dropping To do's own photos back on To do would do nothing
      return !target.special.isAlbum(carry.source.albumId) && mineOf(carry).length > 0;
    }
    case 'space': {
      const mine = mineOf(carry).length;
      return (
        target.writable && target.space.id !== carry.source.spaceId && mine > 0 && mine <= MAX_SPACE_ASSETS_PER_REQUEST
      );
    }
    case 'new-album': {
      return mineOf(carry).length > 0;
    }
  }
};

/** What the carried photo says over the target: "Add to Bali", "Move to To do", "New album" with the name it gets. */
export const offerFor = (target: DropTarget, carry: Carry): Offer => {
  const translate = get(t);
  switch (target.kind) {
    case 'album': {
      return { label: translate('drop_add_to', { values: { name: target.name } }) };
    }
    case 'special': {
      return { label: translate(target.special.words.move) };
    }
    case 'space': {
      return { label: translate('drop_add_to', { values: { name: target.space.name } }) };
    }
    case 'new-album': {
      const name = suggestAlbumName(carry.assets, get(locale));
      return { label: translate('sidebar_new_album'), ...(name && { detail: name }) };
    }
  }
};

class SidebarDrop {
  /** the photos being carried over the grid or the sidebar, while they are (raw: replaced whole, never changed) */
  carrying = $state.raw<Carry | undefined>();
  /** an album a drop just made: its row in the tree lights for a moment */
  arrived = $state<string | undefined>();

  #row: HTMLElement | undefined;
  #target: DropTarget | undefined;
  #springRow: Element | undefined;
  #springTimer: ReturnType<typeof setTimeout> | undefined;
  #leaveTimer: ReturnType<typeof setTimeout> | undefined;
  #arrivedTimer: ReturnType<typeof setTimeout> | undefined;
  #opened: { row: Element; spring: Spring }[] = [];

  /** The sidebar is on screen (expanded, or the rail, which opens under the pointer): photos can go there. */
  available() {
    const nav = document.querySelector<HTMLElement>('nav#sidebar');
    const layout = nav?.dataset.layout;
    return !!nav && !nav.inert && (layout === 'expanded' || layout === 'rail');
  }

  /** Photos start to move: the sidebar takes drops until `end`. */
  begin(carry: Omit<Carry, 'me'>) {
    this.end();
    this.carrying = { ...carry, me: authManager.authenticated ? authManager.user.id : undefined };
  }

  /** The row that takes the photos if they are dropped now, and what it is. */
  get target() {
    return this.#target;
  }

  get row() {
    return this.#row;
  }

  /**
   * The pointer moved: the elements under it, topmost first (elementsFromPoint). Lights the row that would take the
   * photos and aims the spring at the folder row under it. Null when the pointer is not over the sidebar; else what
   * the carried photo should say (nothing over a row that takes no photos).
   */
  hover(stack: Element[]): Offer | null {
    const carry = this.carrying;
    const top = stack[0];
    if (!carry || !top?.closest('nav#sidebar')) {
      this.#light(undefined, undefined);
      this.#aim(undefined);
      this.#away();
      return null;
    }
    clearTimeout(this.#leaveTimer);
    this.#leaveTimer = undefined;
    const row = top.closest<HTMLElement>('[data-drop]') ?? undefined;
    const target = row ? targets.get(row) : undefined;
    const taken = !!target && accepts(target, carry);
    this.#light(taken ? row : undefined, taken ? target : undefined);
    this.#aim(top.closest('[data-drop-spring]') ?? undefined);
    return taken && target ? offerFor(target, carry) : {};
  }

  /** Whether a point is in the sidebar's column (the bar above it included, for scrolling up). */
  over({ x }: { x: number; y: number }) {
    const panel = this.#panel();
    if (!panel) {
      return false;
    }
    const rect = panel.getBoundingClientRect();
    return rect.width > 0 && x >= rect.left && x <= rect.right;
  }

  /** Near the sidebar's top or bottom edge, the carried photos scroll it; true when it moved. */
  scroll({ x, y }: { x: number; y: number }) {
    const panel = this.#panel();
    if (!panel || !this.over({ x, y })) {
      return false;
    }
    const rect = panel.getBoundingClientRect();
    // the bar can float over the sidebar's top (the glass chrome), and the New album zone sits on its foot
    const bar = document.querySelector('#dashboard-navbar')?.getBoundingClientRect();
    const top = bar && bar.bottom > rect.top && bar.left < rect.right ? Math.max(rect.top, bar.bottom) : rect.top;
    const dock = panel.querySelector('.ws-drop-dock')?.getBoundingClientRect();
    const bottom = dock && dock.height > 0 ? Math.min(rect.bottom, dock.top) : rect.bottom;
    const before = panel.scrollTop;
    if (y < top + EDGE) {
      panel.scrollBy(0, -Math.ceil((top + EDGE - y) / 3));
    } else if (y > bottom - EDGE && y < bottom) {
      panel.scrollBy(0, Math.ceil((y - (bottom - EDGE)) / 3));
    }
    return panel.scrollTop !== before;
  }

  /**
   * The drag is over. Without a drop on the sidebar every folder it opened closes again; with one, the folders on
   * the way to the row that took the photos stay open, so the eye can follow them there.
   */
  end(dropped = false) {
    clearTimeout(this.#springTimer);
    clearTimeout(this.#leaveTimer);
    this.#springTimer = undefined;
    this.#leaveTimer = undefined;
    const kept = dropped ? this.#row : undefined;
    this.#close((row) => !!kept && !!row.closest('[data-drop-group]')?.contains(kept));
    this.#light(undefined, undefined);
    this.#springRow = undefined;
    this.carrying = undefined;
  }

  /** An album a drop made: lit in the tree for a moment (services/sidebar-drop). */
  arrive(albumId: string, ms = 2400) {
    clearTimeout(this.#arrivedTimer);
    this.arrived = albumId;
    this.#arrivedTimer = setTimeout(() => {
      if (this.arrived === albumId) {
        this.arrived = undefined;
      }
    }, ms);
  }

  #panel() {
    return document.querySelector<HTMLElement>('nav#sidebar [data-testid="sidebar-panel"]') ?? undefined;
  }

  #light(row: HTMLElement | undefined, target: DropTarget | undefined) {
    this.#target = target;
    if (row === this.#row) {
      return;
    }
    this.#row?.removeAttribute('data-drop-target');
    this.#row = row;
    this.#row?.setAttribute('data-drop-target', '');
  }

  /** The folder row under the pointer: it springs open once it has been pointed at long enough. */
  #aim(row: Element | undefined) {
    if (row === this.#springRow) {
      return;
    }
    clearTimeout(this.#springTimer);
    this.#springTimer = undefined;
    this.#springRow = row;
    const spring = row ? springs.get(row) : undefined;
    if (!row || !spring || spring.isOpen()) {
      return;
    }
    this.#springTimer = setTimeout(() => {
      this.#springTimer = undefined;
      if (this.carrying && this.#springRow === row && !spring.isOpen()) {
        spring.open();
        this.#opened.push({ row, spring });
      }
    }, SPRING_MS);
  }

  /** Off the sidebar: what the drag opened closes once the pointer has stayed away a moment. */
  #away() {
    if (this.#opened.length === 0 || this.#leaveTimer) {
      return;
    }
    this.#leaveTimer = setTimeout(() => {
      this.#leaveTimer = undefined;
      this.#close(() => false);
    }, LEAVE_MS);
  }

  /** Closes the folders the drag opened, the deepest first, but those `keep` holds on to. */
  #close(keep: (row: Element) => boolean) {
    for (const { row, spring } of [...this.#opened].reverse()) {
      if (!keep(row) && spring.isOpen()) {
        spring.close();
      }
    }
    this.#opened = [];
  }
}

export const sidebarDrop = new SidebarDrop();
