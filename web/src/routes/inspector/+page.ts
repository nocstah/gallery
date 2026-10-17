import { INSPECTOR_TITLE } from '$lib/managers/inspector-link.svelte';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

// Local Omarchy layer: the inspector window (lib/components/inspector), outside the user pages' shell (no bar, no
// sidebar, no drop to upload). The owner's Hyprland rule places the window by its title, so the title is set before
// anything is asked of the server, and the root layout keeps it at the front of the page's title from then on
// ("Gallery inspector - Noodle Gallery" once branded). Signed out, the login page leads back here.
export const load = (async ({ url }) => {
  document.title = INSPECTOR_TITLE;
  await authenticate(url);
  return {
    meta: { title: INSPECTOR_TITLE },
  };
}) satisfies PageLoad;
