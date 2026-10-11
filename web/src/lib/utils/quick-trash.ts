// Local Omarchy layer: Shift + middle-click on a photo or video tile moves it to the trash at once, with the same Undo
// toast as the Delete key. The grids (Timeline, GalleryViewer) listen on the document and say how to find the tile's
// asset, drop it and put it back, so the tile leaves at once instead of when the server's trash event reaches the page.
import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { handlePromiseError } from '$lib/utils';
import { deleteAssets, type OnDelete, type OnUndoDelete } from '$lib/utils/actions';

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
 * On auxclick: trash the tile's asset when `find` knows it. Never deletes for good: with the trash turned off, or for
 * an asset already in the trash, the gesture does nothing (the Delete key asks first there; a click must not).
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
  if (!featureFlagsManager.value.trash || asset.isTrashed) {
    return;
  }
  handlePromiseError(deleteAssets(false, onDelete, [asset], onUndo));
};
