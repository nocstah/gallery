import { AssetVisibility, deleteAssets as deleteBulk, restoreAssets, type StackResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { pageKey, undoManager } from '$lib/managers/undo-manager.svelte';
import { refreshAssets } from '$lib/utils/asset-refresh';
import { announceCovers, handOverCovers, restoreCovers, type CoverChange } from '$lib/utils/stack-covers';
import { handleError } from './handle-error';

export type OnDelete = (assetIds: string[]) => void;
export type OnUndoDelete = (assets: TimelineAsset[]) => void;
export type OnRestore = (ids: string[]) => void;
export type OnLink = (assets: { still: TimelineAsset; motion: TimelineAsset }) => void;
export type OnUnlink = (assets: { still: TimelineAsset; motion: TimelineAsset }) => void;
export type OnArchive = (ids: string[], visibility: AssetVisibility) => void;
export type OnFavorite = (ids: string[], favorite: boolean) => void;
export type OnSetVisibility = (ids: string[]) => void;

export const deleteAssets = async (
  force: boolean,
  onAssetDelete: OnDelete,
  assets: TimelineAsset[],
  onUndoDelete: OnUndoDelete | undefined = undefined,
) => {
  const $t = get(t);
  try {
    const ids = assets.map((a) => a.id);
    // Local Omarchy layer: a stack losing its cover gets a new one first, so it stays in view (utils/stack-covers)
    const here = pageKey();
    const covers = await handOverCovers(assets);
    await deleteBulk({ assetBulkDeleteDto: { ids, force } });
    onAssetDelete(ids);
    announceCovers(covers, ids);

    const description = force
      ? $t('assets_permanently_deleted_count', { values: { count: ids.length } })
      : $t('assets_trashed_count', { values: { count: ids.length } });
    // Local Omarchy layer: the undo stays in the bar's undo history once the toast is gone (managers/undo-manager)
    const entry = force
      ? undefined
      : undoManager.record(
          description,
          () => undoDeleteAssets(onUndoDelete, assets, covers, here),
          $t('errors.unable_to_restore_assets'),
        );
    toastManager.primary(
      {
        description,
        button:
          entry === undefined
            ? undefined
            : { label: $t('undo'), color: 'secondary', onclick: () => void undoManager.undo(entry) },
      },
      { timeout: 5000 },
    );
  } catch (error) {
    handleError(error, $t('errors.unable_to_delete_assets'));
  }
};

/** Restores trashed assets, puts back the stack covers they had, and shows them again wherever the page is now (the
 * page they were trashed on also gets its own callback, which may reopen the photo, while it is still open). */
export const undoDeleteAssets = async (
  onUndoDelete: OnUndoDelete | undefined,
  assets: TimelineAsset[],
  covers: CoverChange[] = [],
  here = pageKey(),
) => {
  const $t = get(t);
  const ids = assets.map((a) => a.id);
  await restoreAssets({ bulkIdsDto: { ids } });
  await restoreCovers(covers);
  if (pageKey() === here) {
    onUndoDelete?.(assets);
  }
  await refreshAssets(ids);
  return $t('assets_restored_count', { values: { count: ids.length } });
};

/**
 * Update the asset stack state in the asset store based on the provided stack response.
 * This function updates the stack information so that the icon is shown for the primary asset
 * and removes the non-primary assets from the timeline.
 */
export function updateStackedAssetInTimeline(timelineManager: TimelineManager, stack: StackResponseDto) {
  timelineManager.update([stack.primaryAssetId], (asset) => {
    asset.stack = {
      id: stack.id,
      primaryAssetId: stack.primaryAssetId,
      assetCount: stack.assets.length,
    };
  });

  timelineManager.removeAssets(
    stack.assets.filter((asset) => asset.id !== stack.primaryAssetId).map((asset) => asset.id),
  );
}
