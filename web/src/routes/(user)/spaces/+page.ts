import { getAllSpaces } from '@immich/sdk';
import { isLibrarySpace } from '$lib/managers/album-folders.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  // Local Omarchy layer: Library holds the album folders and lives under Albums (managers/album-folders)
  const all = await getAllSpaces();
  const spaces = all.filter((space) => !isLibrarySpace(space));
  const $t = await getFormatter();

  return {
    spaces,
    meta: {
      title: $t('spaces'),
    },
  };
}) satisfies PageLoad;
