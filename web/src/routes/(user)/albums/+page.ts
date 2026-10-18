import { getAllAlbums } from '@immich/sdk';
import { albumFolders } from '$lib/managers/album-folders.svelte';
import { slipCovers } from '$lib/managers/slip-covers.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  // the album folders (local Omarchy layer) load beside the albums, so no album shows at the top first; and QR's slips,
  // so no album shows one for its cover first (managers/slip-covers)
  const [sharedAlbums, albums] = await Promise.all([
    getAllAlbums({ isShared: true }),
    getAllAlbums({ isOwned: true }),
    albumFolders.load(),
    slipCovers.load(),
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
