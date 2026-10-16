// Local Omarchy layer: Pin to sidebar / Unpin from sidebar (stores/pinned-albums), one action for every album menu
// (the album card's right-click and ⋮, the album page's ⋮) and the right-click menu of an album's row in the sidebar.
import { menuManager, type ActionItem } from '@immich/ui';
import { mdiPinOffOutline, mdiPinOutline } from '@mdi/js';
import { t, type MessageFormatter } from 'svelte-i18n';
import { get } from 'svelte/store';
import { pinnedAlbums } from '$lib/stores/pinned-albums.svelte';

export const getPinAction = ($t: MessageFormatter, albumId: string): ActionItem => {
  const pinned = pinnedAlbums.has(albumId);
  return {
    title: pinned ? $t('album_unpin_from_sidebar') : $t('album_pin_to_sidebar'),
    icon: pinned ? mdiPinOffOutline : mdiPinOutline,
    onAction: () => pinnedAlbums.toggle(albumId),
  };
};

let anchor: HTMLDivElement | undefined;

/** The right-click menu of an album's row in the sidebar: pinned or not, where the pointer is. */
export const showPinMenu = async (event: MouseEvent, albumId: string) => {
  event.preventDefault();
  anchor ??= document.createElement('div');
  if (!anchor.isConnected) {
    document.body.append(anchor);
  }
  anchor.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px; width: 0; height: 0;`;
  await menuManager.show({ target: anchor, items: [getPinAction(get(t), albumId)] });
};
