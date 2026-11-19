import { notInVaults } from '#lib/gallery/edition.ts';
import { notInThisLibrary } from '#lib/gallery/libraries/library-gates.ts';
import { languageManager } from '#lib/managers/language-manager.svelte.ts';
import { readPreloadedQuery } from '#lib/queries/client.ts';
import { getServerConfigQuery } from '#lib/queries/server-info.query.ts';
import { lang } from '#lib/stores/preferences.store.ts';
import { init } from '#lib/utils/client.ts';
import { convertBCP47 } from '#lib/utils/i18n.ts';
import { maintenanceCreateUrl, maintenanceReturnUrl, maintenanceShouldRedirect } from '#lib/utils/maintenance.ts';
import { configureYucca } from '@futo-org/backups-orchestrator-ui';
import { commandPaletteManager } from '@immich/ui';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const csr = true;

export const load = (async ({ fetch, url }) => {
  notInVaults(url); // Local Omarchy layer: a vault's Gallery sends each page it leaves out to Photos (gallery/edition)
  await notInThisLibrary(url, fetch); // Local Omarchy layer: as a library does those it lacks (gallery/libraries)
  configureYucca({ api: 'orchestrator', language: convertBCP47(get(lang)) });

  let error;
  try {
    await init(fetch);

    const { maintenanceMode } = readPreloadedQuery(getServerConfigQuery());
    if (maintenanceShouldRedirect(maintenanceMode, url)) {
      await goto(maintenanceMode ? maintenanceCreateUrl(url) : maintenanceReturnUrl(url.searchParams));
    }
  } catch (initError) {
    error = initError;
  }

  // Enable the @immich/ui command palette manager *only* for its #handleKeydown
  // dispatcher, which fires per-page <CommandPaletteDefaultProvider> action
  // shortcuts (F=favorite, I=info, face-editor keys, etc.). The upstream's
  // Ctrl+K / Cmd+K / `/` palette-open shortcuts are stripped at the package
  // level via patches/@immich__ui@0.69.0.patch so Gallery owns those keys for
  // its own cmdk palette (GlobalSearchManager). Without this enable() call,
  // every page-level keyboard action silently dies.
  commandPaletteManager.enable();
  languageManager.init();

  return {
    error,
    meta: {
      title: 'Immich',
    },
  };
}) satisfies LayoutLoad;
