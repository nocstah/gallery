import { INSPECTOR_TITLE, INSPECTOR_WINDOW } from '$lib/managers/inspector-link.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

// Local Omarchy layer: the inspector window (lib/components/inspector), outside the user pages' shell (no bar, no
// sidebar, no drop to upload). The owner's Hyprland rule places the window by its title, so the title is set before
// anything is asked of the server, and the root layout keeps it at the front of the page's title from then on
// ("Gallery inspector - Noodle Gallery" once branded). Only the window Gallery opened for the inspector carries that
// name (window.open names it): in an ordinary tab the browser window takes the tab's title, and the rule would send
// the whole browser, every tab with it, to the Dell. Signed out, the login page leads back here.
export const load = (async ({ url }) => {
  const opened = window.name === INSPECTOR_WINDOW;
  if (opened) {
    document.title = INSPECTOR_TITLE;
  }
  await authenticate(url);
  const $t = await getFormatter();
  return {
    meta: { title: opened ? INSPECTOR_TITLE : $t('inspector_window') },
  };
}) satisfies PageLoad;
