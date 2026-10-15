// Local Omarchy layer: Merge into… (the owner: "add the merge into option"). Gallery has no album merge, so one album's
// photos join another and then the album is deleted; its photos stay in Photos. It is deleted only once every one of
// them is in the other album. Gallery cannot bring a deleted album back, so the Undo makes it again as it was: name,
// description, date, cover, order, photos and its place on the Albums page (folder, hidden from my timeline), as a new
// album under a new link, and takes out of the other album the photos the merge put there. A link or people it was
// shared with cannot come back; the confirmation says so.
import {
  addAssetsToAlbum,
  BulkIdErrorReason,
  createAlbum,
  deleteAlbum,
  getTimeBucket,
  getTimeBuckets,
  removeAssetFromAlbum,
  updateAlbumInfo,
  type AlbumResponseDto,
  type BulkIdResponseDto,
} from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { albumFolders } from '$lib/managers/album-folders.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { specialAlbumOf } from '$lib/managers/special-albums.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import AlbumPickerModal from '$lib/modals/AlbumPickerModal.svelte';
import { Route } from '$lib/route';
import { isAlbumEditor } from '$lib/utils/album-utils';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { toastUndoable } from '$lib/utils/undoable';

/** Every photo of an album, month by month as its page loads them (the album itself does not list them). */
export const albumAssetIds = async (albumId: string) => {
  const ids: string[] = [];
  for (const { timeBucket } of await getTimeBuckets({ ...authManager.params, albumId })) {
    const bucket = await getTimeBucket({ ...authManager.params, albumId, timeBucket });
    ids.push(...bucket.id);
  }
  return ids;
};

const succeeded = (results: BulkIdResponseDto[]) => results.filter(({ success }) => success).map(({ id }) => id);

/** Merges `source` into `target`, with an Undo; resolves with whether it did. */
export const mergeAlbum = async (source: AlbumResponseDto, target: AlbumResponseDto) => {
  const $t = await getFormatter();
  const values = { source: source.albumName, target: target.albumName };
  try {
    await albumFolders.ready();
    const place = albumFolders.placeOf(source.id);
    const ids = await albumAssetIds(source.id);
    const results =
      ids.length > 0 ? await addAssetsToAlbum({ ...authManager.params, id: target.id, bulkIdsDto: { ids } }) : [];
    const added = succeeded(results);
    // a photo the other album already holds is safe there; any other refusal keeps the album as it is
    if (results.some(({ success, error }) => !success && error !== BulkIdErrorReason.Duplicate)) {
      if (added.length > 0) {
        await removeAssetFromAlbum({ id: target.id, bulkIdsDto: { ids: added } });
      }
      toastManager.warning($t('album_merge_failed', { values }));
      return false;
    }

    // from the album's own page, on to the album it went into first: that page goes back to Albums on the delete
    if (page.url.pathname.startsWith(Route.viewAlbum({ id: source.id }))) {
      await goto(Route.viewAlbum({ id: target.id }));
    }
    await deleteAlbum({ id: source.id });
    eventManager.emit('AlbumDelete', source);
    if (added.length > 0) {
      eventManager.emit('AlbumAddAssets', { assetIds: added, albumIds: [target.id] });
    }

    const label = $t('album_merged', { values });
    const entry = undoManager.record(
      label,
      async () => {
        const again = await createAlbum({
          createAlbumDto: { albumName: source.albumName, description: source.description, assetIds: ids },
        });
        const cover = source.albumThumbnailAssetId;
        await updateAlbumInfo({
          id: again.id,
          updateAlbumDto: {
            createdAt: source.createdAt,
            isActivityEnabled: source.isActivityEnabled,
            order: source.order,
            ...(cover && ids.includes(cover) && { albumThumbnailAssetId: cover }),
          },
        });
        if (place) {
          await albumFolders.refile(again.id, place);
        }
        if (added.length > 0) {
          await removeAssetFromAlbum({ id: target.id, bulkIdsDto: { ids: added } });
          eventManager.emit('AlbumRemoveAssets', { assetIds: added, albumIds: [target.id] });
        }
        // only once it sits in its folder: the Albums page files a new album into the folder that is open
        eventManager.emit('AlbumCreate', again);
        return $t('album_merge_undone', { values });
      },
      $t('errors.failed_to_create_album'),
    );
    toastUndoable(label, entry);
    return true;
  } catch (error) {
    handleError(error, $t('album_merge_failed', { values }));
    return false;
  }
};

/**
 * Merge into…: the album to merge into (never the album itself, To do, Villa, QR, or one I can't add to), then the
 * merge once confirmed. Resolves with whether it merged.
 */
export const pickAndMerge = async (source: AlbumResponseDto) => {
  const $t = await getFormatter();
  const me = authManager.user.id;
  // typed here: outside a .svelte file the modal's own result type does not reach tsc
  const picked = (await modalManager.show(AlbumPickerModal, {
    title: $t('album_merge_into'),
    exclude: (album: AlbumResponseDto) =>
      album.id === source.id || !!specialAlbumOf(album.id) || !isAlbumEditor(album, me),
  })) as AlbumResponseDto[] | undefined;
  const target = picked?.[0];
  if (!target) {
    return false;
  }

  const prompt = $t('album_merge_confirm', {
    values: { source: source.albumName, target: target.albumName, count: source.assetCount },
  });
  const confirmed = await modalManager.showDialog({
    title: $t('album_merge_into'),
    prompt: source.shared || source.hasSharedLink ? `${prompt} ${$t('album_merge_shared')}` : prompt,
    confirmText: $t('merge'),
  });
  return confirmed ? mergeAlbum(source, target) : false;
};
