import { getAllAlbums } from '@immich/sdk';
import { albumFolders } from '$lib/managers/album-folders.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  // the album folders (local Omarchy layer) load beside the albums, so no album shows at the top first
  const [sharedAlbums, albums] = await Promise.all([
    getAllAlbums({ isShared: true }),
    getAllAlbums({ isOwned: true }),
    albumFolders.load(),
  ]);
  const $t = await getFormatter();

  return {
    albums,
    sharedAlbums,
    meta: {
      title: $t('albums'),
    },
  };
}) satisfies PageLoad;
