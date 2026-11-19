import { albumFolders } from '#lib/managers/album-folders.svelte.ts';
import { slipCovers } from '#lib/managers/slip-covers.svelte.ts';
import { getAllAlbumsQuery } from '#lib/queries/album.query.ts';
import { queryClient } from '#lib/queries/client.ts';
import { authenticate } from '#lib/utils/auth.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const [, $t] = await Promise.all([
    queryClient.query({ ...getAllAlbumsQuery(), staleTime: 0 }),
    getFormatter(),
    // Local Omarchy layer: the album folders the page lists by, and QR's bank slips its covers leave out
    albumFolders.load(),
    slipCovers.load(),
  ]);

  return {
    meta: {
      title: $t('albums'),
    },
  };
}) satisfies PageLoad;
