// Local Omarchy layer: Hide from sidebar, the right-click menu of a sidebar row a person may hide in this browser
// (People: stores/sidebar-rows). Hiding it says so, with an Undo (the toast's, the bar's, Ctrl+Z); Settings > Features
// shows it again later.
import { menuManager } from '@immich/ui';
import { mdiEyeOffOutline } from '@mdi/js';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { setSidebarRowHidden } from '$lib/stores/sidebar-rows';
import { toastUndoable } from '$lib/utils/undoable';

let anchor: HTMLDivElement | undefined;

/** The row's right-click menu, where the pointer is (under the row when the keyboard opened it). `hidden` is what the
 * toast says once the row is gone ("People hidden from the sidebar in this browser"). */
export const showSidebarRowMenu = async (event: MouseEvent, row: string, hidden: string) => {
  event.preventDefault();
  const target = event.currentTarget instanceof Element ? event.currentTarget.getBoundingClientRect() : undefined;
  const fromKeys = event.clientX === 0 && event.clientY === 0 && target;
  anchor ??= document.createElement('div');
  if (!anchor.isConnected) {
    document.body.append(anchor);
  }
  const left = fromKeys ? target.left + 16 : event.clientX;
  const top = fromKeys ? target.bottom : event.clientY;
  anchor.style.cssText = `position: fixed; left: ${left}px; top: ${top}px; width: 0; height: 0;`;
  await menuManager.show({
    target: anchor,
    items: [
      {
        title: get(t)('sidebar_row_hide'),
        icon: mdiEyeOffOutline,
        onAction: () => {
          setSidebarRowHidden(row, true);
          const entry = undoManager.record(hidden, () => {
            setSidebarRowHidden(row, false);
            return Promise.resolve();
          });
          toastUndoable(hidden, entry);
        },
      },
    ],
  });
};
