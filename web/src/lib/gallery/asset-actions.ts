import { ProjectionType } from '#lib/constants.ts';
import { vaultEdition } from '#lib/gallery/edition.ts';
import { celebrate } from '#lib/gallery/motion/index.ts';
import { getEditableAssetsWithWarning } from '#lib/gallery/utils/editable-assets.ts';
import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
import { assetViewerManager } from '#lib/managers/asset-viewer-manager.svelte.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { specialAlbumOf } from '#lib/managers/special-albums.svelte.ts';
import AssetAddToCollectionModal from '#lib/modals/AssetAddToCollectionModal.svelte';
import AssetTagModal from '#lib/modals/AssetTagModal.svelte';
import SelectionShareModal from '#lib/modals/SelectionShareModal.svelte';
import { getSharedLink } from '#lib/utils.ts';
import { canEditAsset } from '#lib/utils/asset-editability.ts';
import { waitForEditRendered } from '#lib/utils/edit-rendered.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { editsDone, favoritesDone, removedFromAlbumDone } from '#lib/utils/undoable.ts';
import {
  AssetEditAction,
  AssetTypeEnum,
  AssetVisibility,
  editAsset,
  getAssetEdits,
  removeAssetEdits,
  removeAssetFromAlbum,
  updateAssetFavorites,
  type AlbumResponseDto,
  type AssetEditActionItemDto,
  type AssetResponseDto,
} from '@immich/sdk';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import { mdiRotateLeft, mdiRotateRight } from '@mdi/js';
import type { MessageFormatter } from 'svelte-i18n';

/**
Gallery's overlay on upstream's asset action helpers (`#lib/services/asset.service.ts`). Upstream's
`getAssetBulkActions` and `getAssetActions` keep their own items and positional `album?`, take the
fork's options as one trailing optional argument, and hand their result to the functions below,
which replace the items Gallery changes (same key, same position) and add the quick-rotate items.
*/
export type GalleryAssetBulkActionOptions = {
  /**
  #734: which of the current selection the caller may edit (resolved by `SelectionToolbar`
  via `POST /assets/editable`). When set, Tag sends only these and reports the skipped count;
  omitted on every other surface, which keeps upstream's all-owned behaviour.
  */
  editableSelectedAssetIds?: string[];
  /**
  #1018: set on a space surface where the caller is an Owner/Editor. The link is then authorized
  against the space rather than against asset ownership, so the whole selection goes in,
  including photos other members contributed.
  */
  shareSpaceId?: string;
  /** Local Omarchy layer: the Space whose page shows this selection, which the Share sheet does not offer to add to. */
  fromSpaceId?: string;
  /**
  Set by `SelectionToolbar` when its capability rules allow removing the selection from this
  album (a space album's editor included). Upstream's item, which gates on album ownership, is
  used otherwise.
  */
  removeFromAlbum?: { album: AlbumResponseDto; onRemove?: (assetIds: string[]) => void };
};

export type GalleryAssetActionOptions = {
  /**
  The shared space this asset is being viewed through, when the viewer sits on a space
  surface. Drives the add-to-album gating below; absent everywhere else.
  */
  space?: { id: string; canWrite: boolean };
};

export const getGalleryAssetBulkActions = <
  T extends { AddToAlbum: ActionItem; CreateSharedLink: ActionItem; RemoveFromAlbum: ActionItem; Tag: ActionItem },
>(
  $t: MessageFormatter,
  { editableSelectedAssetIds, shareSpaceId, fromSpaceId, removeFromAlbum }: GalleryAssetBulkActionOptions = {},
  upstream: T,
) => {
  const assetIds = assetMultiSelectManager.assets.map((asset) => asset.id);

  const AddToAlbum: ActionItem = {
    ...upstream.AddToAlbum,
    // Local Omarchy layer: a vault's Gallery has no Spaces (gallery/edition)
    title: vaultEdition() ? $t('add_to_album') : $t('add_to_album_or_space'),
    onAction: () => modalManager.show(AssetAddToCollectionModal, { assetIds }),
  };

  // Local Omarchy layer: Share opens the Share sheet for photos (shareSelection, below), with the same guards
  const CreateSharedLink: ActionItem = {
    ...upstream.CreateSharedLink,
    $if: () => !vaultEdition(), // Local Omarchy layer: a vault's Gallery shares nothing (gallery/edition)
    onAction: () => shareSelection($t, { shareSpaceId, fromSpaceId }),
  };

  const Tag: ActionItem = {
    ...upstream.Tag,
    $if: () =>
      authManager.preferences.tags.enabled &&
      (assetMultiSelectManager.isAllUserOwned || (editableSelectedAssetIds?.length ?? 0) > 0),
    onAction: async () => {
      // #734: a space Owner/Editor may tag a member's assets. Send only the editable subset and
      // report what was skipped; a selection that resolves to nothing editable never opens the
      // modal, which would otherwise "succeed" with an empty id list.
      const ids =
        editableSelectedAssetIds === undefined
          ? assetIds
          : getEditableAssetsWithWarning(assetMultiSelectManager.assets, editableSelectedAssetIds);
      if (ids.length === 0) {
        return;
      }
      if (await modalManager.show(AssetTagModal, { assetIds: ids })) {
        assetMultiSelectManager.clear();
      }
    },
  };

  const RemoveFromAlbum: ActionItem = removeFromAlbum
    ? {
        ...upstream.RemoveFromAlbum,
        // Local Omarchy layer: photos leave a special album (To do, Villa) its own way (managers/special-albums)
        $if: () => !specialAlbumOf(removeFromAlbum.album.id),
        onAction: () => handleRemoveFromAlbum($t, assetIds, removeFromAlbum.album, removeFromAlbum.onRemove),
      }
    : upstream.RemoveFromAlbum;

  return { ...upstream, AddToAlbum, CreateSharedLink, RemoveFromAlbum, Tag };
};

/**
Local Omarchy layer: Share on a selection, from every selection bar, the photos' right-click menu, Ctrl+K and Show
selected's foot, opens the Share sheet for photos (modals/SelectionShareModal): Add to the Space that leads, then a
link. Gallery (#853): `Permission.AssetShare` is owner ∪ partner only and rejects the ENTIRE request if it names one
asset the caller does not own, so the link and the Space take the owned subset and the sheet says what was left out;
with nothing of mine selected there is nothing to share, which a toast says instead. `ownedAssets` falls back to the
full selection when unauthenticated, so that is refused first. On a space surface the selection bar may scope the
link to the space (#1018, `shareSpaceId`): the link then takes the whole selection, against the space, and the sheet
warns before other members' photos become public; a Space still takes only my own.
*/
export const shareSelection = async (
  $t: MessageFormatter,
  { shareSpaceId, fromSpaceId }: { shareSpaceId?: string; fromSpaceId?: string } = {},
) => {
  if (!authManager.authenticated) {
    return;
  }
  const assetIds = assetMultiSelectManager.assets.map(({ id }) => id);
  const ownedAssetIds = assetMultiSelectManager.ownedAssets.map(({ id }) => id);
  if (shareSpaceId) {
    await modalManager.show(SelectionShareModal, {
      assetIds,
      ownedAssetIds,
      spaceId: shareSpaceId,
      contributedCount: assetIds.length - ownedAssetIds.length,
      fromSpaceId,
    });
    return;
  }
  if (ownedAssetIds.length === 0) {
    toastManager.warning($t('shared_link_nothing_owned_to_share'));
    return;
  }
  await modalManager.show(SelectionShareModal, {
    assetIds: ownedAssetIds,
    ownedAssetIds,
    excludedCount: assetIds.length - ownedAssetIds.length,
    fromSpaceId,
  });
};

const handleRemoveFromAlbum = async (
  $t: MessageFormatter,
  ids: string[],
  album: AlbumResponseDto,
  onRemove?: (assetIds: string[]) => void,
) => {
  const isConfirmed = await modalManager.showDialog({
    prompt: $t('remove_assets_album_confirmation', { values: { count: ids.length } }),
  });
  if (!isConfirmed) {
    return;
  }

  try {
    const results = await removeAssetFromAlbum({ id: album.id, bulkIdsDto: { ids } });

    // #752: the server answers per asset (a space editor may not remove another member's own
    // album_asset rows), so prune and report only what was actually removed.
    const removedIds = results.filter(({ success }) => success).map(({ id }) => id);
    onRemove?.(removedIds);

    // Local Omarchy layer: what was removed can be put back, from the toast or the bar's undo (utils/undoable)
    if (removedIds.length === ids.length) {
      removedFromAlbumDone(album.id, removedIds, $t('assets_removed_count', { values: { count: removedIds.length } }));
    } else if (removedIds.length > 0) {
      removedFromAlbumDone(
        album.id,
        removedIds,
        $t('assets_removed_partial_count', { values: { removedCount: removedIds.length, totalCount: ids.length } }),
        'info',
      );
    } else {
      toastManager.warning($t('assets_remove_failed_count', { values: { count: ids.length } }));
    }

    assetMultiSelectManager.clear();
  } catch (error) {
    handleError(error, $t('errors.error_removing_assets_from_album'));
  }
};

type UpstreamAssetActions = Record<
  | 'Share'
  | 'Favorite'
  | 'Unfavorite'
  | 'Rate'
  | 'AddToAlbum'
  | 'Edit'
  | 'RefreshFacesJob'
  | 'RefreshMetadataJob'
  | 'RegenerateThumbnailJob'
  | 'TranscodeVideoJob',
  ActionItem
>;

export const getGalleryAssetActions = <T extends UpstreamAssetActions>(
  $t: MessageFormatter,
  asset: AssetResponseDto,
  { space }: GalleryAssetActionOptions = {},
  upstream: T,
) => {
  const sharedLink = getSharedLink();
  const authUser = authManager.authenticated ? authManager.user : undefined;
  const isOwner = !!(authUser && authUser.id === asset.ownerId);

  // Server-side `Permission.AssetShare` is owner ∪ partner only, so album or space membership grants
  // no share access. Gating on `authUser` alone offered a shared-album/space viewer a button that
  // `POST /shared-links` then rejected with "Not found or no asset.share access" (#871).
  //
  // `|| !asset.ownerId`: a `showMetadata: false` shared link returns SanitizedAssetResponseDto, which
  // omits `ownerId` altogether, so ownership is unknowable client-side there — treat unknown as
  // shareable rather than hiding the button from the owner of the asset they linked.
  const canShare = !!authUser && (isOwner || !asset.ownerId);

  // #889: an asset the caller does not own reaches an album only through the #764 contribution
  // path, which the server accepts solely for albums linked to a space where the caller is
  // Owner/Editor, so the action is dropped for a space Viewer, who has no contribution path at all.
  // Mirrors the multi-select rule in `getSelectionCapabilities`. The picker itself is the timeline's
  // (#1119): it asks the server which albums accept the asset. Off a space surface `space` is
  // undefined and nothing changes: partner-shared assets do land in the caller's own album
  // (Permission.AssetShare), and the viewer cannot evaluate that from the DTO.
  const canAddToAlbum = isOwner || space === undefined || space.canWrite;

  // Local Omarchy layer: the photo's own Share opens the Share sheet for photos (modals/SelectionShareModal), as a
  // selection's does: Add to the Space that leads (my own photo only, never the Space it is seen through), then a link
  const Share: ActionItem = {
    ...upstream.Share,
    $if: () => canShare && !asset.isTrashed && asset.visibility !== AssetVisibility.Locked && !vaultEdition(),
    onAction: () =>
      modalManager.show(SelectionShareModal, {
        assetIds: [asset.id],
        ownedAssetIds: isOwner ? [asset.id] : [],
        fromSpaceId: space?.id,
      }),
  };

  const Favorite: ActionItem = {
    ...upstream.Favorite,
    // #763: favoriting is per-user — any authenticated reader may favorite. Shared-link
    // sessions are explicitly excluded: auth.user there is the LINK OWNER, and an anonymous
    // visitor must never write favorites in the owner's name (spec §5.1).
    $if: () => !!authUser && !sharedLink && !asset.isFavorite,
    onAction: () => handleFavorite(asset),
  };

  const Unfavorite: ActionItem = {
    ...upstream.Unfavorite,
    $if: () => !!authUser && !sharedLink && asset.isFavorite,
    onAction: () => handleUnfavorite(asset),
  };

  // Server-authoritative on a single-asset read (`asset.canEdit`); falls back to ownership when
  // the field was never resolved (e.g. bulk/list surfaces). See `canEditAsset` (#734).
  const isEditable = () => canEditAsset(asset, { userId: authUser?.id });

  const Rate: ActionItem = {
    ...upstream.Rate,
    // #734: ratings are a metadata edit, open to a space Owner/Editor of a member's asset.
    $if: () => isEditable() && authManager.preferences.ratings.enabled,
  };

  const AddToAlbum: ActionItem = {
    ...upstream.AddToAlbum,
    title: vaultEdition() ? $t('add_to_album') : $t('add_to_album_or_space'),
    $if: () => canAddToAlbum && asset.visibility !== AssetVisibility.Locked && !asset.isTrashed,
    onAction: () => modalManager.show(AssetAddToCollectionModal, { assetIds: [asset.id] }),
  };

  const canEditImage = () =>
    !sharedLink &&
    isEditable() &&
    asset.type === AssetTypeEnum.Image &&
    !asset.livePhotoVideoId &&
    asset.exifInfo?.projectionType !== ProjectionType.EQUIRECTANGULAR &&
    !asset.originalPath.toLowerCase().endsWith('.insp') &&
    !asset.originalPath.toLowerCase().endsWith('.gif') &&
    !asset.originalPath.toLowerCase().endsWith('.svg');

  const canEditVideo = () => {
    if (sharedLink || !isEditable() || asset.type !== AssetTypeEnum.Video || asset.livePhotoVideoId) {
      return false;
    }
    // Duration must be known and >= 2 seconds
    if (!asset.duration) {
      return false;
    }
    return asset.duration >= 2000;
  };

  const canEdit = () => canEditImage() || canEditVideo();

  const Edit: ActionItem = {
    ...upstream.Edit,
    $if: canEdit,
  };

  const RotateRight: ActionItem = {
    title: $t('rotate_right'),
    icon: mdiRotateRight,
    $if: canEditImage,
    onAction: () => handleQuickRotate(asset, 90),
  };

  const RotateLeft: ActionItem = {
    title: $t('rotate_left'),
    icon: mdiRotateLeft,
    $if: canEditImage,
    onAction: () => handleQuickRotate(asset, 270),
  };

  const Rotate180: ActionItem = {
    title: $t('rotate_180'),
    icon: mdiRotateRight,
    $if: canEditImage,
    onAction: () => handleQuickRotate(asset, 180),
  };

  // The rotate items sit before upstream's job items, where the palette has always listed them.
  const { RefreshFacesJob, RefreshMetadataJob, RegenerateThumbnailJob, TranscodeVideoJob, ...rest } = upstream;
  return {
    ...rest,
    Share,
    Favorite,
    Unfavorite,
    Rate,
    AddToAlbum,
    Edit,
    RotateRight,
    RotateLeft,
    Rotate180,
    RefreshFacesJob,
    RefreshMetadataJob,
    RegenerateThumbnailJob,
    TranscodeVideoJob,
  };
};

const handleFavorite = async (asset: AssetResponseDto) => {
  const $t = await getFormatter();

  // Local Omarchy layer: the favourite's celebration, as upstream's own handler has it
  celebrate('favorite');
  try {
    await updateAssetFavorites({ assetFavoriteUpdateDto: { ids: [asset.id], isFavorite: true } });
    // Local Omarchy layer: with an Undo, kept in the bar's undo history too (utils/undoable)
    favoritesDone([asset.id], true, $t('added_to_favorites'));
    eventManager.emit('AssetUpdate', { ...asset, isFavorite: true });
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: asset.isFavorite } }));
  }
};

const handleUnfavorite = async (asset: AssetResponseDto) => {
  const $t = await getFormatter();

  try {
    await updateAssetFavorites({ assetFavoriteUpdateDto: { ids: [asset.id], isFavorite: false } });
    favoritesDone([asset.id], false, $t('removed_from_favorites'));
    eventManager.emit('AssetUpdate', { ...asset, isFavorite: false });
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: asset.isFavorite } }));
  }
};

export const normalizeAngle = (angle: number): number => ((angle % 360) + 360) % 360;

export const mergeRotation = (
  existingEdits: AssetEditActionItemDto[],
  additionalAngle: number,
): AssetEditActionItemDto[] => {
  const otherEdits = existingEdits.filter((e) => e.action !== AssetEditAction.Rotate);
  const existingRotate = existingEdits.find((e) => e.action === AssetEditAction.Rotate);
  const existingAngle = (existingRotate?.parameters as { angle?: number })?.angle ?? 0;
  const merged = normalizeAngle(existingAngle + additionalAngle);

  if (merged === 0) {
    return otherEdits;
  }

  return [...otherEdits, { action: AssetEditAction.Rotate, parameters: { angle: merged } }];
};

const handleQuickRotate = async (asset: AssetResponseDto, angle: number) => {
  const $t = await getFormatter();

  try {
    const existing = await getAssetEdits({ id: asset.id });
    const before = existing.edits.map(({ action, parameters }) => ({ action, parameters }));
    const edits = mergeRotation(before, angle);

    // Local Omarchy layer: wait for the server to draw the turned photo however long its queue takes (utils/edit-rendered)
    const editRendered = waitForEditRendered(asset.id, asset.thumbhash);

    await (edits.length === 0
      ? removeAssetEdits({ id: asset.id })
      : editAsset({ id: asset.id, assetEditsCreateDto: { edits } }));

    const refreshedAsset = await editRendered;
    assetViewerManager.setAsset(refreshedAsset);
    eventManager.emit('AssetUpdate', refreshedAsset);
    eventManager.emit('AssetEditsApplied', asset.id);
    // Local Omarchy layer: a quick rotate has no toast of its own, so its undo is recorded quietly (utils/undoable)
    const turn = angle === 90 ? 'rotate_right' : angle === 180 ? 'rotate_180' : 'rotate_left';
    editsDone(`${$t(turn)} · ${asset.originalFileName}`, [{ id: asset.id, edits: before }]);
  } catch (error) {
    handleError(error, $t('rotate_error'));
  }
};
