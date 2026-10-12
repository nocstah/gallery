// Local Omarchy layer: the undo side of everyday actions (managers/undo-manager). Each is called right after its action
// succeeded, records how to take it back, and shows the action's toast with an Undo; the undo puts the old state back
// on the server and lets every live view catch up (utils/asset-refresh, or the stack and album events). Trash and
// archive record theirs where they happen (utils/actions, utils/asset-utils).
import {
  addAssetsToAlbum,
  createStack,
  deleteStacks,
  getAssetInfo,
  getStack,
  removeAssetFromAlbum,
  restoreAssets,
  updateAsset,
  updateAssetFavorites,
  updateStack,
  type StackResponseDto,
} from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { refreshAssets } from '$lib/utils/asset-refresh';

/** The toast of a done action, with an Undo that takes back its history entry. */
export const toastUndoable = (description: string, entry: number) => {
  const $t = get(t);
  toastManager.primary({
    description,
    button: (close) => ({
      label: $t('undo'),
      onclick: () => {
        close();
        void undoManager.undo(entry);
      },
    }),
  });
};

/** Favourites: taken back by setting them the other way round. */
export const favoritesDone = (ids: string[], isFavorite: boolean, description?: string) => {
  if (ids.length === 0) {
    return;
  }
  const $t = get(t);
  const count = ids.length;
  const added = $t('added_to_favorites_count', { values: { count } });
  const removed = $t('removed_from_favorites_count', { values: { count } });
  const label = description ?? (isFavorite ? added : removed);
  const entry = undoManager.record(
    label,
    async () => {
      await updateAssetFavorites({ assetFavoriteUpdateDto: { ids, isFavorite: !isFavorite } });
      await refreshAssets(ids);
      return isFavorite ? removed : added;
    },
    $t('errors.unable_to_add_remove_favorites', { values: { favorite: !isFavorite } }),
  );
  toastUndoable(label, entry);
};

// -1 is "rejected" where ratings allow it
const stars = (rating: number | null | undefined) => (rating && rating > 0 ? '★'.repeat(rating) : '–');

/** A star rating: taken back to the rating it had. Rating has no toast of its own, so it records quietly. */
export const ratingDone = (id: string, before: number | null | undefined, after: number | null) => {
  const $t = get(t);
  undoManager.record(
    `${$t('rating')} ${stars(after)}`,
    async () => {
      await updateAsset({ id, updateAssetDto: { rating: before ?? null } });
      await refreshAssets([id]);
      return `${$t('rating')} ${stars(before)}`;
    },
    $t('errors.unable_to_set_rating'),
  );
};

/** A stack as it was: its cover first, then the rest. */
type StackShape = { primaryAssetId: string; assetIds: string[] };

const shapeOf = (stack: StackResponseDto): StackShape => ({
  primaryAssetId: stack.primaryAssetId,
  assetIds: stack.assets.map(({ id }) => id),
});

/** Puts stacks back as they were (new ids; a stack whose cover is given first takes in the rest). */
const restack = async (shapes: StackShape[]) => {
  for (const { primaryAssetId, assetIds } of shapes) {
    const stack = await createStack({
      stackCreateDto: { assetIds: [primaryAssetId, ...assetIds.filter((id) => id !== primaryAssetId)] },
    });
    eventManager.emit('StackCreate', stack);
  }
};

/** The stacks the given photos are in before they are stacked (stacking moves them, and merges a stack whose cover is
 * among them); undefined when there are too many to read, and the stacking then records no undo. */
export const stacksBefore = async (assetIds: string[]): Promise<StackShape[] | undefined> => {
  if (assetIds.length > 50) {
    return undefined;
  }
  try {
    const assets = await Promise.all(assetIds.map((id) => getAssetInfo({ ...authManager.params, id })));
    const stackIds = new Set(assets.flatMap(({ stack }) => (stack ? [stack.id] : [])));
    return (await Promise.all([...stackIds].map((id) => getStack({ id })))).map((stack) => shapeOf(stack));
  } catch {
    return undefined;
  }
};

/** Stacking: taken back by unstacking the new stack and putting the photos' old stacks back. */
export const stackedDone = (stack: StackResponseDto, before: StackShape[] | undefined) => {
  if (!before) {
    return;
  }
  const $t = get(t);
  const count = stack.assets.length;
  undoManager.record(
    $t('stacked_assets_count', { values: { count } }),
    async () => {
      await deleteStacks({ bulkIdsDto: { ids: [stack.id] } });
      eventManager.emit('StackDelete', { id: stack.id, assets: stack.assets });
      await restack(before);
      return $t('unstacked_assets_count', { values: { count } });
    },
    $t('errors.failed_to_unstack_assets'),
  );
};

/** Unstacking: taken back by stacking the photos again, each stack around its cover. */
export const unstackedDone = (stacks: StackResponseDto[], description: string) => {
  const $t = get(t);
  const shapes = stacks.map((stack) => shapeOf(stack));
  const count = shapes.reduce((sum, { assetIds }) => sum + assetIds.length, 0);
  const entry = undoManager.record(
    description,
    async () => {
      await restack(shapes);
      return $t('stacked_assets_count', { values: { count } });
    },
    $t('errors.failed_to_stack_assets'),
  );
  toastUndoable(description, entry);
};

/** A new cover: taken back to the old one. */
export const coverDone = (stackId: string, before: string) => {
  const $t = get(t);
  undoManager.record(
    $t('set_stack_primary_asset'),
    async () => {
      const stack = await updateStack({ id: stackId, stackUpdateDto: { primaryAssetId: before } });
      eventManager.emit('StackUpdate', stack);
    },
    $t('errors.something_went_wrong'),
  );
};

/** A photo taken out of its stack: taken back by stacking it under the stack's cover again. */
export const unstackedOneDone = (stack: StackResponseDto, assetId: string) => {
  const $t = get(t);
  const label = $t('removed_from_stack');
  const entry = undoManager.record(
    label,
    async () => {
      await restack([{ primaryAssetId: stack.primaryAssetId, assetIds: [assetId] }]);
      await refreshAssets([assetId]);
    },
    $t('errors.failed_to_stack_assets'),
  );
  toastUndoable(label, entry);
};

/** "Keep this, delete others": taken back by restoring the others and stacking the whole stack again. */
export const keptThisDone = (stack: StackResponseDto, trashedIds: string[], description: string) => {
  const $t = get(t);
  const shape = shapeOf(stack);
  const entry = undoManager.record(
    description,
    async () => {
      await restoreAssets({ bulkIdsDto: { ids: trashedIds } });
      await restack([shape]);
      await refreshAssets(shape.assetIds);
      return $t('assets_restored_count', { values: { count: trashedIds.length } });
    },
    $t('errors.unable_to_restore_assets'),
  );
  toastUndoable(description, entry);
};

/** Photos added to an album: taken back by removing just those that were added (not those already in it). */
export const addedToAlbumDone = (albumId: string, addedIds: string[]) => {
  if (addedIds.length === 0) {
    return;
  }
  const $t = get(t);
  const count = addedIds.length;
  undoManager.record(
    $t('assets_added_to_album_count', { values: { count } }),
    async () => {
      await removeAssetFromAlbum({ id: albumId, bulkIdsDto: { ids: addedIds } });
      eventManager.emit('AlbumRemoveAssets', { assetIds: addedIds, albumIds: [albumId] });
      return $t('assets_removed_count', { values: { count } });
    },
    $t('errors.error_removing_assets_from_album'),
  );
};

/** Photos removed from an album: taken back by adding them again. */
export const removedFromAlbumDone = (albumId: string, removedIds: string[], description: string) => {
  if (removedIds.length === 0) {
    return;
  }
  const $t = get(t);
  const count = removedIds.length;
  const entry = undoManager.record(
    description,
    async () => {
      await addAssetsToAlbum({ ...authManager.params, id: albumId, bulkIdsDto: { ids: removedIds } });
      eventManager.emit('AlbumAddAssets', { assetIds: removedIds, albumIds: [albumId] });
      return $t('assets_added_to_album_count', { values: { count } });
    },
    $t('errors.error_adding_assets_to_album'),
  );
  toastUndoable(description, entry);
};
