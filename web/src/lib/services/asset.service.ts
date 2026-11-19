import { ProjectionType } from '#lib/constants.ts';
import {
  getGalleryAssetActions,
  getGalleryAssetBulkActions,
  type GalleryAssetActionOptions,
  type GalleryAssetBulkActionOptions,
} from '#lib/gallery/asset-actions.ts';
import { resetLibraryView } from '#lib/gallery/library-view/library-view.svelte.ts';
import { animateRemoval, celebrate } from '#lib/gallery/motion/index.ts';
import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
import { assetViewerManager } from '#lib/managers/asset-viewer-manager.svelte.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { specialAlbumOf } from '#lib/managers/special-albums.svelte.ts';
import type { TimelineAsset } from '#lib/managers/timeline-manager/types.ts';
import AssetAddToAlbumModal from '#lib/modals/AssetAddToAlbumModal.svelte';
import AssetTagModal from '#lib/modals/AssetTagModal.svelte';
import ProfileImageCropperModal from '#lib/modals/ProfileImageCropperModal.svelte';
import SharedLinkCreateModal from '#lib/modals/SharedLinkCreateModal.svelte';
import { removeAssetFromAlbumMutation } from '#lib/queries/album.query.ts';
import { executeMutation, readPreloadedQuery } from '#lib/queries/client.ts';
import { getUserConfigQuery } from '#lib/queries/config-user.query.ts';
import { Route } from '#lib/route.ts';
import { SlideshowState, slideshowStore } from '#lib/stores/slideshow.store.ts';
import { downloadUrl, getAssetMediaUrl, getSharedLink, sleep } from '#lib/utils.ts';
import type { OnFavorite } from '#lib/utils/actions.ts';
import { newAlbumFromAssets } from '#lib/utils/album-from-selection.ts';
import { showUndoArchiveToast } from '#lib/utils/asset-utils.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { beforeChange, favoritesDone, ratingDone, removedFromAlbumDone, taggedDone } from '#lib/utils/undoable.ts';
import {
  AssetJobName,
  AssetMediaSize,
  AssetTypeEnum,
  AssetVisibility,
  bulkTagAssets,
  getAssetInfo,
  runAssetJobs,
  updateAsset,
  updateAssetFavorites,
  updateAssets,
  type AlbumResponseDto,
  type AssetJobsDto,
  type AssetResponseDto,
} from '@immich/sdk';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import {
  mdiAccountCircleOutline,
  mdiAlertOutline,
  mdiArchiveArrowDownOutline,
  mdiArchiveArrowUpOutline,
  mdiCogRefreshOutline,
  mdiCompare,
  mdiContentCopy,
  mdiCropRotate,
  mdiDatabaseRefreshOutline,
  mdiDownload,
  mdiDownloadBox,
  mdiFaceRecognition,
  mdiHeadSyncOutline,
  mdiHeart,
  mdiHeartOutline,
  mdiImageRefreshOutline,
  mdiImageRemoveOutline,
  mdiImageSearch,
  mdiInformationOutline,
  mdiMagnifyMinusOutline,
  mdiMagnifyPlusOutline,
  mdiMotionPauseOutline,
  mdiMotionPlayOutline,
  mdiMovieEditOutline,
  mdiPlus,
  mdiPlusBoxMultipleOutline,
  mdiPresentationPlay,
  mdiShareVariantOutline,
  mdiTagMultipleOutline,
  mdiTagPlusOutline,
} from '@mdi/js';
import { t, type MessageFormatter } from 'svelte-i18n';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';

export const getAssetBulkActions = (
  $t: MessageFormatter,
  album?: AlbumResponseDto,
  gallery?: GalleryAssetBulkActionOptions,
) => {
  const assetIds = assetMultiSelectManager.assets.map((asset) => asset.id);
  const ownedAssets = assetMultiSelectManager.ownedAssets;
  const isAlbumOwner = album?.albumUsers[0].user.id === authManager.user.id;

  const onAction = async (name: AssetJobName) => {
    await handleRunAssetJob({ name, assetIds: ownedAssets.map(({ id }) => id) });
    assetMultiSelectManager.clear();
  };

  const AddToAlbum: ActionItem = {
    title: $t('add_to_album'),
    icon: mdiPlus,
    shortcuts: [{ key: 'l' }],
    onAction: () => modalManager.show(AssetAddToAlbumModal, { assetIds }),
  };

  const Archive: ActionItem = {
    title: $t('to_archive'),
    icon: mdiArchiveArrowDownOutline,
    shortcuts: [{ key: 'a', shift: true }],
    $if: () => assetMultiSelectManager.isAllUserOwned && !assetMultiSelectManager.isAllArchived,
    onAction: async () => {
      const assets = ownedAssets.filter((asset) => asset.visibility !== AssetVisibility.Archive);
      if (await handleSetVisibility(assets, AssetVisibility.Archive)) {
        assetMultiSelectManager.clear();
      }
    },
  };

  // Local Omarchy layer: N makes an album of the selection, named by where and when (utils/album-from-selection), and
  // the selection's work is done. Not where the picker is narrowed to a Space's albums (a new album of mine could not
  // take the other members' photos), not over an open photo, and not while typing (a search field is no text field to
  // the shortcut's own check)
  const NewAlbum: ActionItem = {
    title: $t('new_album_from_selection'),
    icon: mdiPlusBoxMultipleOutline,
    shortcuts: [{ key: 'n' }],
    $if: () =>
      (!gallery?.fromSpaceId || assetMultiSelectManager.isAllUserOwned) &&
      assetMultiSelectManager.selectionActive &&
      !assetViewerManager.isViewing &&
      !document.activeElement?.closest('input, textarea, select, [contenteditable]'),
    onAction: async () => {
      if (await newAlbumFromAssets(assetMultiSelectManager.assets)) {
        assetMultiSelectManager.clear();
      }
    },
  };

  const CreateSharedLink: ActionItem = {
    title: $t('share'),
    icon: mdiShareVariantOutline,
    onAction: () => modalManager.show(SharedLinkCreateModal, { assetIds }),
  };

  const RemoveFromAlbum: ActionItem = {
    title: $t('remove_from_album'),
    icon: mdiImageRemoveOutline,
    shortcuts: [{ key: 'l', shift: true }],
    // Local Omarchy layer: photos leave a special album (To do, Villa) its own way, which also puts them back where they
    // came from
    $if: () => !!album && !specialAlbumOf(album.id) && (isAlbumOwner || assetMultiSelectManager.isAllUserOwned),
    onAction: () => handleBulkRemoveAssetsFromAlbum(assetIds, album!),
  };

  const Tag: ActionItem = {
    title: $t('tag'),
    icon: mdiTagMultipleOutline,
    $if: () => authManager.preferences.tags.enabled && assetMultiSelectManager.isAllUserOwned,
    onAction: async () => {
      if (await modalManager.show(AssetTagModal, { assetIds })) {
        assetMultiSelectManager.clear();
      }
    },
    shortcuts: { key: 't' },
  };

  const Unarchive: ActionItem = {
    title: $t('unarchive'),
    icon: mdiArchiveArrowUpOutline,
    shortcuts: [{ key: 'a', shift: true }],
    $if: () => assetMultiSelectManager.isAllUserOwned && assetMultiSelectManager.isAllArchived,
    onAction: async () => {
      if (await handleSetVisibility(ownedAssets, AssetVisibility.Timeline)) {
        assetMultiSelectManager.clear();
      }
    },
  };

  const RefreshFacesJob: ActionItem = {
    title: $t('refresh_faces'),
    icon: mdiHeadSyncOutline,
    onAction: () => onAction(AssetJobName.RefreshFaces),
  };

  const RefreshMetadataJob: ActionItem = {
    title: $t('refresh_metadata'),
    icon: mdiDatabaseRefreshOutline,
    onAction: () => onAction(AssetJobName.RefreshMetadata),
  };

  const RegenerateThumbnailJob: ActionItem = {
    title: $t('refresh_thumbnails'),
    icon: mdiImageRefreshOutline,
    onAction: () => onAction(AssetJobName.RegenerateThumbnail),
  };

  const TranscodeVideoJob: ActionItem = {
    title: $t('refresh_encoded_videos'),
    icon: mdiCogRefreshOutline,
    onAction: () => onAction(AssetJobName.TranscodeVideo),
    $if: () => ownedAssets.every((asset) => asset.isVideo),
  };

  return getGalleryAssetBulkActions($t, gallery, {
    AddToAlbum,
    NewAlbum,
    Archive,
    CreateSharedLink,
    RemoveFromAlbum,
    Tag,
    Unarchive,
    RefreshFacesJob,
    RefreshMetadataJob,
    RegenerateThumbnailJob,
    TranscodeVideoJob,
  });
};

export const getAssetActions = (
  $t: MessageFormatter,
  asset: AssetResponseDto & { stackPrimaryAssetId?: string },
  album?: AlbumResponseDto,
  gallery?: GalleryAssetActionOptions,
) => {
  const sharedLink = getSharedLink();
  const authUser = authManager.authenticated ? authManager.user : undefined;
  const isOwner = !!(authUser && authUser.id === asset.ownerId);
  const isAlbumOwner = !!(authUser && authUser.id === album?.albumUsers.at(0)?.user.id);
  const smartSearchEnabled = !!authUser && readPreloadedQuery(getUserConfigQuery()).machineLearning.clip.enabled;

  const Share: ActionItem = {
    title: $t('share'),
    icon: mdiShareVariantOutline,
    $if: () => !!(authUser && !asset.isTrashed && asset.visibility !== AssetVisibility.Locked),
    onAction: () => modalManager.show(SharedLinkCreateModal, { assetIds: [asset.id] }),
  };

  const Download: ActionItem = {
    title: $t('download'),
    icon: mdiDownload,
    shortcuts: { key: 'd', shift: true },
    $if: () => !!authUser,
    onAction: () => handleDownloadAsset(asset, { edited: true }),
  };

  const DownloadOriginal: ActionItem = {
    title: $t('download_original'),
    icon: mdiDownloadBox,
    $if: () => !!authUser && asset.isEdited,
    onAction: () => handleDownloadAsset(asset, { edited: false }),
  };

  const SharedLinkDownload: ActionItem = {
    ...Download,
    $if: () => isOwner || !!sharedLink?.allowDownload,
  };

  const PlayMotionPhoto: ActionItem = {
    title: $t('play_motion_photo'),
    icon: mdiMotionPlayOutline,
    $if: () => !!asset.livePhotoVideoId && !assetViewerManager.isPlayingMotionPhoto,
    onAction: () => {
      assetViewerManager.isPlayingMotionPhoto = true;
    },
  };

  const StopMotionPhoto: ActionItem = {
    title: $t('stop_motion_photo'),
    icon: mdiMotionPauseOutline,
    $if: () => !!asset.livePhotoVideoId && assetViewerManager.isPlayingMotionPhoto,
    onAction: () => {
      assetViewerManager.isPlayingMotionPhoto = false;
    },
  };

  const PlaySlideshow: ActionItem = {
    title: $t('slideshow'),
    icon: mdiPresentationPlay,
    $if: () => asset.visibility !== AssetVisibility.Locked,
    onAction: () => slideshowStore.slideshowState.set(SlideshowState.PlaySlideshow),
  };

  const Favorite: ActionItem = {
    title: $t('to_favorite'),
    icon: mdiHeartOutline,
    $if: () => isOwner && !asset.isFavorite,
    onAction: () => handleFavorite(asset),
    shortcuts: [{ key: 'f' }],
  };

  const Unfavorite: ActionItem = {
    title: $t('unfavorite'),
    icon: mdiHeart,
    $if: () => isOwner && asset.isFavorite,
    onAction: () => handleUnfavorite(asset),
    shortcuts: [{ key: 'f' }],
  };

  const Rate: ActionItem = {
    title: $t('rate_asset'),
    description: $t('rate_asset_description'),
    $if: () => isOwner && authManager.preferences.ratings.enabled,
    onAction: ({ event }) => handleRate(asset, event instanceof KeyboardEvent ? Number(event.key) : NaN),
    shortcuts: [0, 1, 2, 3, 4, 5].map((key) => ({ key: String(key) })),
  };

  const AddToAlbum: ActionItem = {
    title: $t('add_to_album'),
    icon: mdiPlus,
    shortcuts: [{ key: 'l' }],
    $if: () => asset.visibility !== AssetVisibility.Locked && !asset.isTrashed,
    onAction: () => modalManager.show(AssetAddToAlbumModal, { assetIds: [asset.id] }),
  };

  const RemoveFromAlbum: ActionItem = {
    title: $t('remove_from_album'),
    icon: mdiImageRemoveOutline,
    shortcuts: [{ key: 'l', shift: true }],
    // Local Omarchy layer: photos leave a special album its own way (managers/special-albums)
    $if: () => !!album && !specialAlbumOf(album.id) && (isOwner || isAlbumOwner),
    onAction: () => handleRemoveAssetsFromAlbum([asset.id], album!),
  };

  const Offline: ActionItem = {
    title: $t('asset_offline'),
    icon: mdiAlertOutline,
    color: 'danger',
    $if: () => !!asset.isOffline,
    onAction: () => assetViewerManager.toggleDetailPanel(),
  };

  const ZoomIn: ActionItem = {
    title: $t('zoom_image'),
    icon: mdiMagnifyPlusOutline,
    $if: () => assetViewerManager.canZoomIn(),
    onAction: () => assetViewerManager.emit('Zoom'),
  };

  const ZoomOut: ActionItem = {
    title: $t('zoom_image'),
    icon: mdiMagnifyMinusOutline,
    $if: () => assetViewerManager.canZoomOut(),
    onAction: () => assetViewerManager.emit('Zoom'),
  };

  const Copy: ActionItem = {
    title: $t('copy_image'),
    icon: mdiContentCopy,
    $if: () => assetViewerManager.canCopyImage(),
    onAction: () => assetViewerManager.emit('Copy'),
  };

  const Info: ActionItem = {
    title: $t('info'),
    icon: mdiInformationOutline,
    $if: () => asset.hasMetadata,
    onAction: () => assetViewerManager.toggleDetailPanel(),
    shortcuts: { key: 'i' },
  };

  const Tag: ActionItem = {
    title: $t('add_tag'),
    icon: mdiTagPlusOutline,
    $if: () => authManager.authenticated && authManager.preferences.tags.enabled,
    onAction: () => modalManager.show(AssetTagModal, { assetIds: [asset.id] }),
    shortcuts: { key: 't' },
  };

  const TagPeople: ActionItem = {
    title: $t('tag_people'),
    icon: mdiFaceRecognition,
    $if: () => isOwner && asset.type === AssetTypeEnum.Image && !asset.isTrashed,
    onAction: () => assetViewerManager.toggleFaceEditMode(),
    shortcuts: { key: 'p' },
  };

  const Edit: ActionItem = {
    title: $t('editor'),
    // Local Omarchy layer: what the editor does (crop and rotate, a video's trim), not the sliders Adjust wears beside it
    icon: asset.type === AssetTypeEnum.Video ? mdiMovieEditOutline : mdiCropRotate,
    $if: () =>
      !sharedLink &&
      isOwner &&
      asset.type === AssetTypeEnum.Image &&
      !asset.livePhotoVideoId &&
      asset.exifInfo?.projectionType !== ProjectionType.EQUIRECTANGULAR &&
      !asset.originalPath.toLowerCase().endsWith('.insp') &&
      !asset.originalPath.toLowerCase().endsWith('.gif') &&
      !asset.originalPath.toLowerCase().endsWith('.svg'),
    onAction: () => assetViewerManager.openEditor(),
    shortcuts: [{ key: 'e' }],
  };

  const SetProfilePicture: ActionItem = {
    title: $t('set_as_profile_picture'),
    icon: mdiAccountCircleOutline,
    $if: () => asset.type === AssetTypeEnum.Image && asset.visibility !== AssetVisibility.Locked,
    onAction: () => modalManager.show(ProfileImageCropperModal, { asset }),
  };

  const ViewInTimeline: ActionItem = {
    title: $t('view_in_timeline'),
    icon: mdiImageSearch,
    $if: () => isOwner && asset.visibility !== AssetVisibility.Locked && !asset.isArchived && !asset.isTrashed,
    onAction: () => {
      resetLibraryView();
      return goto(Route.photos({ at: asset.stackPrimaryAssetId ?? asset.id }));
    },
  };

  const ViewSimilar: ActionItem = {
    title: $t('view_similar_photos'),
    icon: mdiCompare,
    $if: () =>
      asset.visibility !== AssetVisibility.Locked && !asset.isArchived && !asset.isTrashed && smartSearchEnabled,
    onAction: () => goto(Route.search({ queryAssetId: asset.stackPrimaryAssetId ?? asset.id })),
  };

  const RefreshFacesJob: ActionItem = {
    title: $t('refresh_faces'),
    icon: mdiHeadSyncOutline,
    onAction: () => handleRunAssetJob({ name: AssetJobName.RefreshFaces, assetIds: [asset.id] }),
  };

  const RefreshMetadataJob: ActionItem = {
    title: $t('refresh_metadata'),
    icon: mdiDatabaseRefreshOutline,
    onAction: () => handleRunAssetJob({ name: AssetJobName.RefreshMetadata, assetIds: [asset.id] }),
  };

  const RegenerateThumbnailJob: ActionItem = {
    title: $t('refresh_thumbnails'),
    icon: mdiImageRefreshOutline,
    onAction: () => handleRunAssetJob({ name: AssetJobName.RegenerateThumbnail, assetIds: [asset.id] }),
  };

  const TranscodeVideoJob: ActionItem = {
    title: $t('refresh_encoded_videos'),
    icon: mdiCogRefreshOutline,
    onAction: () => handleRunAssetJob({ name: AssetJobName.TranscodeVideo, assetIds: [asset.id] }),
    $if: () => asset.type === AssetTypeEnum.Video,
  };

  return getGalleryAssetActions($t, asset, gallery, {
    Share,
    Download,
    DownloadOriginal,
    SharedLinkDownload,
    Offline,
    Info,
    Favorite,
    Unfavorite,
    Rate,
    PlayMotionPhoto,
    StopMotionPhoto,
    PlaySlideshow,
    AddToAlbum,
    RemoveFromAlbum,
    ZoomIn,
    ZoomOut,
    Copy,
    Tag,
    TagPeople,
    Edit,
    SetProfilePicture,
    ViewInTimeline,
    ViewSimilar,
    RefreshFacesJob,
    RefreshMetadataJob,
    RegenerateThumbnailJob,
    TranscodeVideoJob,
  });
};

export const handleDownloadAsset = async (asset: AssetResponseDto, { edited }: { edited: boolean }) => {
  const $t = await getFormatter();

  const assets = [
    {
      filename: asset.originalFileName,
      id: asset.id,
      cacheKey: asset.thumbhash,
    },
  ];

  const isAndroidMotionVideo = (asset: AssetResponseDto) => {
    return asset.originalPath.includes('encoded-video');
  };

  if (asset.livePhotoVideoId) {
    const motionAsset = await getAssetInfo({ ...authManager.params, id: asset.livePhotoVideoId });
    if (
      !isAndroidMotionVideo(motionAsset) ||
      (authManager.authenticated && authManager.preferences.download.includeEmbeddedVideos)
    ) {
      const motionFilename = motionAsset.originalFileName;
      const lastDotIndex = motionFilename.lastIndexOf('.');
      const motionDownloadFilename =
        lastDotIndex > 0
          ? `${motionFilename.slice(0, lastDotIndex)}-motion${motionFilename.slice(lastDotIndex)}`
          : `${motionFilename}-motion`;
      assets.push({
        filename: motionDownloadFilename,
        id: asset.livePhotoVideoId,
        cacheKey: motionAsset.thumbhash,
      });
    }
  }

  for (const [i, { filename, id, cacheKey }] of assets.entries()) {
    if (i !== 0) {
      // play nice with Safari
      await sleep(500);
    }

    try {
      toastManager.primary($t('downloading_asset_filename', { values: { filename } }));
      downloadUrl(getAssetMediaUrl({ id, size: AssetMediaSize.Original, edited, cacheKey, download: true }), filename);
    } catch (error) {
      handleError(error, $t('errors.error_downloading', { values: { filename } }));
    }
  }
};

const handleFavorite = async (asset: AssetResponseDto) => {
  const $t = await getFormatter();

  celebrate('favorite');
  try {
    const response = await updateAsset({ id: asset.id, updateAssetDto: { isFavorite: true } });
    // Local Omarchy layer: with an Undo, kept in the bar's undo history too (utils/undoable)
    favoritesDone([asset.id], true, $t('added_to_favorites'));
    eventManager.emit('AssetUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: asset.isFavorite } }));
  }
};

const handleUnfavorite = async (asset: AssetResponseDto) => {
  const $t = await getFormatter();

  try {
    const response = await updateAsset({ id: asset.id, updateAssetDto: { isFavorite: false } });
    favoritesDone([asset.id], false, $t('removed_from_favorites'));
    eventManager.emit('AssetUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: asset.isFavorite } }));
  }
};

export const toggleFavoriteAssets = async (
  assets: Pick<AssetResponseDto, 'id' | 'isFavorite'>[],
  isFavorite: boolean,
  onFavorite?: OnFavorite,
) => {
  const ids = assets.map((a) => a.id);
  const $t = get(t);

  try {
    if (ids.length > 0) {
      // Gallery #763: favorites are per user; this route also accepts assets the caller can only view.
      await updateAssetFavorites({ assetFavoriteUpdateDto: { ids, isFavorite } });
    }

    for (const asset of assets) {
      asset.isFavorite = isFavorite;
    }

    onFavorite?.(ids, isFavorite);

    // Local Omarchy layer: the toast's Undo is kept in the bar's undo history too (utils/undoable)
    favoritesDone(ids, isFavorite);
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: isFavorite } }));
  }
};

const handleRate = async (asset: AssetResponseDto, rating: number) => {
  const $t = await getFormatter();

  if (Number.isNaN(rating)) {
    toastManager.info($t('rate_asset_description'));
    return;
  }

  const newRating = rating === 0 ? null : rating;
  if (asset.exifInfo && asset.exifInfo.rating === newRating) {
    return;
  }

  try {
    const response = await updateAsset({ id: asset.id, updateAssetDto: { rating: newRating } });
    eventManager.emit('AssetUpdate', response);
    // Local Omarchy layer: a rating can be taken back from the bar's undo (utils/undoable)
    ratingDone(asset.id, asset.exifInfo?.rating, newRating);
  } catch (error) {
    handleError(error, $t('errors.unable_to_set_rating'));
  }
};

export const handleTagAssets = async (assetIds: string[], tagIds: string[]) => {
  const $t = await getFormatter();

  try {
    // Local Omarchy layer: the tags the photos already have, so the toast's Undo (kept in the bar's undo history too,
    // utils/undoable) takes off only the ones this added
    const before = await beforeChange(assetIds);
    const response = await bulkTagAssets({ tagBulkAssetsDto: { assetIds, tagIds } });
    taggedDone(assetIds, tagIds, before, $t('tagged_assets', { values: { count: response.count } }));
    eventManager.emit('AssetsTag', assetIds);
    return true;
  } catch (error) {
    handleError(error, $t('errors.failed_to_tag_assets'));
    return false;
  }
};

const handleSetVisibility = async (assets: TimelineAsset[], visibility: AssetVisibility) => {
  const $t = await getFormatter();
  const ids = assets.map((asset) => asset.id);
  // Local Omarchy layer: what each photo was, so archiving and unarchiving can both be taken back, from the toast or
  // later from the bar's undo (utils/asset-utils showUndoArchiveToast)
  const prior = assets.map(({ id, visibility }) => ({ id, visibility }));
  const archived = visibility === AssetVisibility.Archive;

  try {
    await updateAssets({ assetBulkUpdateDto: { ids, visibility } });

    if (archived) {
      animateRemoval(ids, 'archive');
      showUndoArchiveToast($t('archived_count', { values: { count: assets.length } }), prior, assets, true);
      eventManager.emit('AssetsArchive', ids);
    } else {
      // Timeline
      showUndoArchiveToast($t('unarchived_count', { values: { count: assets.length } }), prior, assets, false);
      eventManager.emit('AssetsUnarchive', assets);
    }
  } catch (error) {
    handleError(error, $t('errors.unable_to_archive_unarchive', { values: { archived } }));
    return false;
  }

  return true;
};

const handleBulkRemoveAssetsFromAlbum = async (assetIds: string[], album: AlbumResponseDto) => {
  const $t = await getFormatter();

  const isConfirmed = await modalManager.showDialog({
    prompt: $t('remove_assets_album_confirmation', { values: { count: assetIds.length } }),
  });

  if (!isConfirmed) {
    return;
  }

  await handleRemoveAssetsFromAlbum(assetIds, album);
  assetMultiSelectManager.clear();
};

const handleRemoveAssetsFromAlbum = async (assetIds: string[], album: AlbumResponseDto) => {
  const $t = await getFormatter();

  await executeMutation(removeAssetFromAlbumMutation, [{ id: album.id, bulkIdsDto: { ids: assetIds } }], {
    onSuccess: (results) => {
      const removedIds = results.filter(({ success }) => success).map(({ id }) => id);
      // Local Omarchy layer: with an Undo, kept in the bar's undo history too (utils/undoable)
      removedFromAlbumDone(album.id, removedIds, $t('assets_removed_count', { values: { count: removedIds.length } }));
      eventManager.emit('AlbumRemoveAssets', { assetIds, albumIds: [album.id] });
    },
  });
};

const getAssetJobMessage = ($t: MessageFormatter, job: AssetJobName) => {
  const messages: Record<AssetJobName, string> = {
    [AssetJobName.RefreshFaces]: $t('refreshing_faces'),
    [AssetJobName.RefreshMetadata]: $t('refreshing_metadata'),
    [AssetJobName.RegenerateThumbnail]: $t('regenerating_thumbnails'),
    [AssetJobName.TranscodeVideo]: $t('refreshing_encoded_video'),
  };

  return messages[job];
};

const handleRunAssetJob = async (dto: AssetJobsDto) => {
  const $t = await getFormatter();

  try {
    await runAssetJobs({ assetJobsDto: dto });
    toastManager.primary(getAssetJobMessage($t, dto.name));
  } catch (error) {
    handleError(error, $t('errors.unable_to_submit_job'));
  }
};
