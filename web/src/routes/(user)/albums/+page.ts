import { getAllAlbums } from '@immich/sdk';
import { albumFolders } from '$lib/managers/album-folders.svelte';
import { slipCovers } from '$lib/managers/slip-covers.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const [sharedAlbums, albums, $t] = await Promise.all([
    getAllAlbums({ isShared: true }),
    getAllAlbums({ isOwned: true }),
    getFormatter(),
    albumFolders.load(),
    slipCovers.load(),
  ]);

  return {
    albums,
    sharedAlbums,
    meta: {
      title: $t('albums'),
    },
  };
}) satisfies PageLoad;
