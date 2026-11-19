import { animateRemoval } from '#lib/gallery/motion/index.ts';
import type { TimelineAsset } from '#lib/managers/timeline-manager/types.ts';
import { showUndoArchiveToast } from '#lib/utils/asset-utils.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { AssetVisibility, updateAssets } from '@immich/sdk';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

/**
Bulk (un)archive that returns the ids it changed, so the caller can update its own view.

Upstream (immich-32189) replaced this with event-driven bulk actions in asset.service.ts. The fork's
filtered timelines (lib/gallery/filtered-timeline) also show search results, which no upstream event
listener updates, so the fork's selection toolbar keeps this callback-based path.
*/
export const archiveAssets = async (assets: TimelineAsset[], visibility: AssetVisibility) => {
  const ids = assets.map(({ id }) => id);
  // Local Omarchy layer: what each photo was, so archiving and unarchiving can both be taken back, from the toast or
  // later from the bar's undo (utils/asset-utils showUndoArchiveToast)
  const prior = assets.map((asset) => ({ id: asset.id, visibility: asset.visibility }));
  const $t = get(t);

  try {
    if (ids.length > 0) {
      await updateAssets({ assetBulkUpdateDto: { ids, visibility } });
      const archived = visibility === AssetVisibility.Archive;
      if (archived) {
        animateRemoval(ids, 'archive');
      }
      showUndoArchiveToast(
        archived
          ? $t('archived_count', { values: { count: ids.length } })
          : $t('unarchived_count', { values: { count: ids.length } }),
        prior,
        assets,
        archived,
      );
    }
  } catch (error) {
    handleError(
      error,
      $t('errors.unable_to_archive_unarchive', { values: { archived: visibility === AssetVisibility.Archive } }),
    );
  }

  return ids;
};
