// Local Omarchy layer: Shift + middle-click on a photo or video tile moves it to the trash at once, with the same Undo
// toast as the Delete key. The grids (Timeline, GalleryViewer) listen on the document and say how to find the tile's
// asset, drop it and put it back, so the tile leaves at once instead of when the server's trash event reaches the page.
// Inside an album the gesture takes the photo out of that album only, as Delete does in a Mac Photos album (the owner
// chose it: "remove from this album"); the album page says which album is on screen.
import { removeAssetFromAlbum } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { handlePromiseError } from '$lib/utils';
import { deleteAssets, type OnDelete, type OnUndoDelete } from '$lib/utils/actions';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { removedFromAlbumDone } from '$lib/utils/undoable';

type TakeOut = (asset: TimelineAsset) => Promise<unknown>;

// the album whose own photos are on screen, and how a photo leaves it (nothing where it can't: a viewer's shared album)
let albumHere: { takeOut?: TakeOut } | undefined;

/**
 * The album page says its own photos are on screen (its grid, or a search inside it): there the gesture takes a photo
 * out with `takeOut` and never trashes it, or does nothing without one. Returns the cleanup.
 */
export const quickTrashInAlbum = (takeOut: TakeOut | undefined) => {
  const here = { takeOut };
  albumHere = here;
  return () => {
    if (albumHere === here) {
      albumHere = undefined;
    }
  };
};

/** Takes photos out of an album, with an Undo (utils/undoable); the grids drop their tiles on AlbumRemoveAssets. */
export const takeOutOfAlbum = async (albumId: string, ids: string[]) => {
  const $t = await getFormatter();
  try {
    const results = await removeAssetFromAlbum({ id: albumId, bulkIdsDto: { ids } });
    const removed = results.filter(({ success }) => success).map(({ id }) => id);
    if (removed.length === 0) {
      toastManager.warning($t('assets_remove_failed_count', { values: { count: ids.length } }));
      return;
    }
    eventManager.emit('AlbumRemoveAssets', { assetIds: removed, albumIds: [albumId] });
    removedFromAlbumDone(
      albumId,
      removed,
      $t('remove_from_album_action_prompt', { values: { count: removed.length } }),
    );
  } catch (error) {
    handleError(error, $t('errors.error_removing_assets_from_album'));
  }
};

/** The id of the tile under a Shift + middle-click; nothing for any other click, or a read-only or disabled tile. */
export const quickTrashTarget = (event: MouseEvent): string | undefined => {
  if (event.button !== 1 || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  const tile = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-asset]') : null;
  if (!tile || tile.dataset.readonly !== undefined || tile.dataset.disabled !== undefined) {
    return undefined;
  }
  return tile.dataset.asset;
};

/** On mousedown: the browser starts no autoscroll or paste for the gesture. */
export const holdQuickTrash = (event: MouseEvent) => {
  if (quickTrashTarget(event)) {
    event.preventDefault();
  }
};

/**
 * On auxclick: trash the tile's asset when `find` knows it, or inside an album take it out of the album
 * (quickTrashInAlbum). Never deletes for good: with the trash turned off, or for an asset already in the trash, the
 * gesture does nothing (the Delete key asks first there; a click must not).
 */
export const quickTrash = (
  event: MouseEvent,
  find: (id: string) => TimelineAsset | undefined,
  onDelete: OnDelete,
  onUndo?: OnUndoDelete,
) => {
  const id = quickTrashTarget(event);
  const asset = id ? find(id) : undefined;
  if (!asset) {
    return;
  }
  // the tile's hover link would open the photo in a new tab, and another grid on the page must not trash it twice
  event.preventDefault();
  event.stopImmediatePropagation();
  if (albumHere) {
    if (albumHere.takeOut) {
      handlePromiseError(albumHere.takeOut(asset));
    }
    return;
  }
  if (!featureFlagsManager.value.trash || asset.isTrashed) {
    return;
  }
  handlePromiseError(deleteAssets(false, onDelete, [asset], onUndo));
};
