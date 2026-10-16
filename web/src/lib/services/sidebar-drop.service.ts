// Local Omarchy layer: what a drop on the sidebar does (managers/sidebar-drop decides where photos may go). Each way in
// is the one the rest of the app already uses, so a drop toasts, undoes and remembers exactly as the same move by
// menu or key would: an album takes them through the single-album add (its toast, the bar's Undo, the album the Add to
// album picker offers first); To do, Villa and QR through their own move, never the toggle that could take photos
// out; a Space through the Add to album or Space picker's own dispatch; and New album through the N key's own album of
// the selection (utils/album-from-selection: named by where and when, its toast's Open and Undo, the last album).
import { spaceToCollection } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
import { mineOf, sidebarDrop, type Carry, type DropTarget } from '$lib/managers/sidebar-drop.svelte';
import { addAssetsToAlbumWithOutcome } from '$lib/services/album.service';
import { addAssetsToCollections } from '$lib/services/collection.service';
import { recentAlbumsDropdown } from '$lib/stores/preferences.store';
import { newAlbumFromAssets } from '$lib/utils/album-from-selection';

/** What the drop changed for the grid: the photos a special album took out of view, and whether the selection
 * that was carried has done its job (it leaves with the photos). */
export type DropResult = { archived: string[]; clear: boolean };

const KEPT: DropResult = { archived: [], clear: false };

export const dropOn = async (target: DropTarget, carry: Carry): Promise<DropResult | undefined> => {
  switch (target.kind) {
    case 'album': {
      const { ok } = await addAssetsToAlbumWithOutcome(target.id, carry.ids, { notify: true, albumName: target.name });
      return ok ? KEPT : undefined;
    }
    case 'special': {
      // my photos with what the grid knows of them (where they are now), as the B, V and Q keys send them
      const moved = await target.special.move(mineOf(carry));
      return moved ? { archived: moved.archived, clear: true } : undefined;
    }
    case 'space': {
      const ids = mineOf(carry).map(({ id }) => id);
      const ok = await addAssetsToCollections([spaceToCollection(target.space)], ids);
      return ok ? KEPT : undefined;
    }
    case 'new-album': {
      return makeAlbum(carry);
    }
  }
};

/** A new album of the carried photos (the carry holds every one of them: a lift that cannot name its photo offers no
 * New album), lit in the sidebar's tree. */
const makeAlbum = async (carry: Carry): Promise<DropResult | undefined> => {
  const album = await newAlbumFromAssets(carry.assets);
  if (!album) {
    return;
  }
  // shown where it now lives: the Albums tree opens, and the new row lights for a moment
  recentAlbumsDropdown.set(true);
  sidebarDrop.arrive(album.id);
  return KEPT;
};
