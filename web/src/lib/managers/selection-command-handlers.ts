import { AssetVisibility, deleteAssets as deleteBulk, updateAssetFavorites, updateAssets } from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { MAX_SPACE_ASSETS_PER_REQUEST } from '$lib/constants';
import type { CommandContext, SelectionCommandContext } from '$lib/managers/command-context-manager.svelte';
import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
import { pageKey, undoManager } from '$lib/managers/undo-manager.svelte';
import AssetAddToCollectionModal from '$lib/modals/AssetAddToCollectionModal.svelte';
import AssetDeleteConfirmModal from '$lib/modals/AssetDeleteConfirmModal.svelte';
import { showDeleteModal } from '$lib/stores/preferences.store';
import { undoDeleteAssets } from '$lib/utils/actions';
import { newAlbumFromAssets } from '$lib/utils/album-from-selection';
import { showUndoArchiveToast } from '$lib/utils/asset-utils';
import { handleError } from '$lib/utils/handle-error';
import { announceCovers, handOverCovers } from '$lib/utils/stack-covers';
import { favoritesDone } from '$lib/utils/undoable';

const getSelection = (ctx?: CommandContext): SelectionCommandContext | null => ctx?.selection ?? null;

export const canAddSelectedToAlbum = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  return selection !== null && selection.canAddToAlbum;
};

// Local Omarchy layer: N's album from Ctrl+K (utils/album-from-selection), wherever the selection may go into an album,
// except where the picker would be narrowed to a Space's albums: a new album of mine cannot hold the other members'
// photos (the same rule as handleAddSelectedToAlbum's restrictToSpaceId)
export const canMakeAlbumOfSelected = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  return selection !== null && selection.canAddToAlbum && (selection.isAllUserOwned || ctx.space?.canWrite !== true);
};

export const canAddSelectedToCurrentSpace = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  const selectedCount = selection?.selectedAssetIds.length ?? 0;
  return (
    ctx.space?.canWrite === true &&
    selection?.addSelectedToCurrentSpace !== undefined &&
    selectedCount > 0 &&
    selectedCount <= MAX_SPACE_ASSETS_PER_REQUEST
  );
};

export const canAddSelectedToSpace = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  return selection !== null && selection.canAddToSpace;
};

export const canFavoriteSelected = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  return selection !== null && selection.onFavorite !== undefined && !selection.isAllFavorite;
};

export const canArchiveSelected = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  return (
    selection !== null && selection.isAllUserOwned && selection.onArchive !== undefined && !selection.isAllArchived
  );
};

export const canDeleteSelected = (ctx: CommandContext) => {
  const selection = getSelection(ctx);
  return selection !== null && selection.isAllUserOwned && selection.onDelete !== undefined;
};

export function handleAddSelectedToAlbum(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection?.canAddToAlbum) {
    return;
  }
  // #1119: the same picker as the timeline. It asks the server which albums accept the selection, so
  // assets the caller does not own still only reach the space-linked albums that can take them (#764).
  return modalManager.show(AssetAddToCollectionModal, { assetIds: selection.selectedAssetIds });
}

export async function handleNewAlbumFromSelected(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!ctx || !selection || !canMakeAlbumOfSelected(ctx)) {
    return;
  }
  if (await newAlbumFromAssets(selection.assets)) {
    selection.clearSelection();
  }
}

export function handleAddSelectedToSpace(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection?.canAddToSpace) {
    return;
  }
  return modalManager.show(AssetAddToCollectionModal, { assetIds: selection.selectedAssetIds });
}

export async function handleAddSelectedToCurrentSpace(ctx?: CommandContext) {
  if (!ctx || !canAddSelectedToCurrentSpace(ctx)) {
    return false;
  }
  return getSelection(ctx)?.addSelectedToCurrentSpace?.() ?? false;
}

export async function handleFavoriteSelected(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection || !selection.onFavorite) {
    return;
  }

  // #763: favorites are per-user — the whole selection is favoritable, not just owned assets.
  const assets = selection.assets.filter((asset) => !asset.isFavorite);
  const ids = assets.map((asset) => asset.id);
  if (ids.length === 0) {
    return;
  }

  const $t = get(t);
  try {
    await updateAssetFavorites({ assetFavoriteUpdateDto: { ids, isFavorite: true } });
    for (const asset of assets) {
      asset.isFavorite = true;
    }
    selection.onFavorite(ids, true);
    // Local Omarchy layer: with an Undo, kept in the bar's undo history too (utils/undoable)
    favoritesDone(ids, true);
    selection.clearSelection();
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: true } }));
  }
}

export async function handleArchiveSelected(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection || !selection.isAllUserOwned || !selection.onArchive) {
    return;
  }

  const visibility = AssetVisibility.Archive;
  const assets = selection.ownedAssets.filter((asset) => asset.visibility !== visibility);
  const ids = assets.map((asset) => asset.id);
  if (ids.length === 0) {
    return;
  }

  const $t = get(t);
  const prior = assets.map((asset) => ({ id: asset.id, visibility: asset.visibility }));
  try {
    await updateAssets({ assetBulkUpdateDto: { ids, visibility } });
    selection.onArchive(ids, visibility);
    // Local Omarchy layer: with an undo, kept in the bar's undo history too (managers/undo-manager)
    showUndoArchiveToast($t('archived_count', { values: { count: ids.length } }), prior, assets, true);
    selection.clearSelection();
  } catch (error) {
    handleError(error, $t('errors.unable_to_archive_unarchive', { values: { archived: true } }));
  }
}

export async function handleDeleteSelected(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection || !selection.isAllUserOwned || !selection.onDelete) {
    return false;
  }

  const assets = selection.ownedAssets;
  const ids = assets.map((asset) => asset.id);
  if (ids.length === 0) {
    return false;
  }

  const force = !featureFlagsManager.value.trash || assets.some((asset) => asset.isTrashed);
  if (force && get(showDeleteModal)) {
    const confirmed = await modalManager.show(AssetDeleteConfirmModal, { size: ids.length });
    if (!confirmed) {
      return false;
    }
  }

  const $t = get(t);
  try {
    // Local Omarchy layer: a stack losing its cover gets a new one first, so it stays in view (utils/stack-covers)
    const here = pageKey();
    const covers = await handOverCovers(assets);
    await deleteBulk({ assetBulkDeleteDto: { ids, force } });
    selection.onDelete(ids);
    announceCovers(covers, ids);
    const description = force
      ? $t('assets_permanently_deleted_count', { values: { count: ids.length } })
      : $t('assets_trashed_count', { values: { count: ids.length } });
    // Local Omarchy layer: the undo stays in the bar's undo history once the toast is gone (managers/undo-manager)
    const entry = force
      ? undefined
      : undoManager.record(
          description,
          () => undoDeleteAssets(selection.onUndoDelete, assets, covers, here),
          $t('errors.unable_to_restore_assets'),
        );
    toastManager.primary(
      {
        description,
        button:
          entry === undefined
            ? undefined
            : { label: $t('undo'), color: 'secondary' as const, onclick: () => void undoManager.undo(entry) },
      },
      { timeout: 5000 },
    );
    selection.clearSelection();
    return true;
  } catch (error) {
    handleError(error, $t('errors.unable_to_delete_assets'));
    return false;
  }
}
