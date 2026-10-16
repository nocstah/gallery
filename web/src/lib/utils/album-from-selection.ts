// Local Omarchy layer: N, a new album of the selected photos (the Mac's File › New Album with Selection; the owner: "easy
// album management"). It is named by where and when the photos were taken (utils/album-naming) and becomes the album the
// Add to album picker offers first (utils/last-album), so the next photos follow it with L then Enter. The server keeps
// out what is not the person's to add (someone else's photo seen through a Space): the toast says how many went in, and
// when none could, no empty album is left behind. The toast opens the album; its Undo, kept in the bar's undo history
// too (managers/undo-manager), deletes the album again, which never touches the photos themselves.
import { createAlbum, deleteAlbum, type AlbumResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import UndoToast from '$lib/components/omarchy/UndoToast.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { Route } from '$lib/route';
import { locale } from '$lib/stores/preferences.store';
import { suggestAlbumName } from '$lib/utils/album-naming';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { rememberLastAlbum } from '$lib/utils/last-album';
import { undone } from '$lib/utils/undoable';

// as long as the other toasts that offer an Undo (utils/undoable)
const TOAST_MS = 8000;

// a second N while the first album is still being made is the same press, not a second album
let making = false;

type Photo = Pick<TimelineAsset, 'id' | 'localDateTime' | 'city' | 'country'>;

/** Makes the album; resolves with it, or with nothing when no album was made (the caller then keeps the selection). */
export const newAlbumFromAssets = async (assets: Photo[]): Promise<AlbumResponseDto | undefined> => {
  if (assets.length === 0 || making) {
    return;
  }
  making = true;
  const $t = await getFormatter();
  const total = assets.length;
  const name = suggestAlbumName(assets, get(locale));
  try {
    const album = await createAlbum({ createAlbumDto: { albumName: name, assetIds: assets.map(({ id }) => id) } });
    const count = album.assetCount;
    if (count === 0) {
      await deleteAlbum({ id: album.id });
      toastManager.warning($t('assets_cannot_be_added_to_album_count', { values: { count: total } }));
      return;
    }

    eventManager.emit('AlbumCreate', album);
    rememberLastAlbum(album.id);
    const partly = count < total;
    const label = partly
      ? $t('album_made_partial', { values: { name, count, total } })
      : $t('album_made', { values: { name, count } });
    const entry = undoManager.record(
      label,
      async () => {
        await deleteAlbum({ id: album.id });
        eventManager.emit('AlbumDelete', album);
        return undone(label);
      },
      $t('errors.unable_to_delete_album'),
    );
    toastManager.custom(
      {
        component: UndoToast,
        props: {
          description: label,
          tone: partly ? 'info' : 'primary',
          action: { label: $t('open'), onclick: () => goto(Route.viewAlbum(album)) },
          onUndo: () => undoManager.undo(entry),
          onClose: () => {},
        },
      },
      { timeout: TOAST_MS },
    );
    return album;
  } catch (error) {
    handleError(error, $t('errors.failed_to_create_album'));
  } finally {
    making = false;
  }
};
