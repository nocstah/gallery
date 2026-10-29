// Local Omarchy layer: where Move to <library> is offered (gallery/moves). The mover listens on this computer only, so
// a page reaches for it only where it can be reached and only for the owner: never in a vault's Gallery, only where
// the library context lists another library, only on this library's own registered address, in this desktop's
// browser. Elsewhere (another device, the tailnet, a vault) no page ever asks 127.0.0.1:2297 anything.
import { AssetVisibility, type PersonResponseDto } from '@immich/sdk';
import { vaultEdition } from '$lib/gallery/edition';
import { currentLibrary, libraries, otherLibraries } from '$lib/gallery/libraries/library-context.svelte';
import type { Library } from '$lib/gallery/libraries/library-file';
import { isDesktop, isLoopback } from '$lib/gallery/vaults/launcher';
import type { MovePerson } from './mover';

/** Who is signed in, as far as a move cares: their id, and whether they are the owner (the server's admin). */
export type MoveOwner = { id: string; isAdmin: boolean } | undefined;

/** This library's own address, as the context lists it. */
export const ownLibraryAddress = (): string | undefined => {
  const here = currentLibrary();
  return here && libraries().find(({ id }) => id === here.id)?.url;
};

/**
 * The page conditions: not a vault's Gallery, another library listed, this page served from this library's own
 * registered address on this computer, this desktop's browser, and the owner signed in. The menu rows, the progress
 * panel and the move page all ask this first.
 */
export const moverPageAllowed = (url: URL, userAgent: string, owner: MoveOwner): boolean =>
  !vaultEdition() &&
  otherLibraries().length > 0 &&
  ownLibraryAddress() === url.origin &&
  isLoopback(url.hostname) &&
  isDesktop(userAgent) &&
  !!owner?.isAdmin;

/** The libraries a move from here can go to: every other one the context lists, in its order. */
export const moveTargets = (): readonly Library[] => otherLibraries();

/** The library the context lists under this id. */
export const libraryById = (id: string): Library | undefined => libraries().find((library) => library.id === id);

/**
 * A move's page in its destination, at that library's own address: the move's id, and the source it comes from, which
 * the page names while the move is on its way.
 */
export const movePageUrl = (destination: Library, move: string, source: string) => {
  const url = new URL('/moves', destination.url);
  url.searchParams.set('move', move);
  url.searchParams.set('from', source);
  return url.href;
};

/** Opens a library's move page in a new tab. Call it inside the owner's click, so it is never blocked. */
export const openMovePage = (destination: Library, move: string, source: string) => {
  window.open(movePageUrl(destination, move, source), '_blank', 'noopener');
};

type Movable = { id: string; ownerId: string; isTrashed: boolean; visibility?: AssetVisibility };

/** What a selection can move: the owner's own photos, and how many of the selection are someone else's. */
export type MoveSelection = { ids: string[]; notOwned: number };

/**
 * Whether a selection can move from here, and what of it: the page conditions, no photo in the trash or in the Locked
 * Folder (the mover's key cannot read one there, so it would only stay behind), and at least one photo the owner's
 * own. Only those go; a person's page can show a partner's photos too, and those stay.
 */
export const canMoveFrom = (
  url: URL,
  userAgent: string,
  owner: MoveOwner,
  assets: readonly Movable[],
): MoveSelection | undefined => {
  if (
    !owner ||
    !moverPageAllowed(url, userAgent, owner) ||
    assets.some(({ isTrashed, visibility }) => isTrashed || visibility === AssetVisibility.Locked)
  ) {
    return;
  }
  const ids = assets.filter(({ ownerId }) => ownerId === owner.id).map(({ id }) => id);
  return ids.length > 0 ? { ids, notOwned: assets.length - ids.length } : undefined;
};

/**
 * Whether a person is the owner's own here, as the person page reads them: no grouped person (a filterId spans
 * Spaces, so its photos are chosen with Select all instead) and no Space's person. The mover checks it again.
 */
export const isOwnPerson = (person: PersonResponseDto) =>
  !person.filterId &&
  person.primaryProfile?.type !== 'space-person' &&
  !person.spacePersonId &&
  person.sharedBy.length === 0;

/** Whether a person's photos can move from here: the page conditions, and the person the owner's own. */
export const canMovePerson = (
  url: URL,
  userAgent: string,
  owner: MoveOwner,
  person: PersonResponseDto | undefined,
): boolean => !!person && moverPageAllowed(url, userAgent, owner) && isOwnPerson(person);

/** The longest name a hand-off carries for a person. */
const NAME_LENGTH = 200;

/** The person as a move names them: the id, and the name the page shows (none for a person without one). */
export const movePerson = (person: PersonResponseDto): MovePerson => {
  const name = [...person.name.trim()].slice(0, NAME_LENGTH).join('');
  return { id: person.id, name: name || null };
};
