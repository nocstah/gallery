import { PartnerDirection, getAllAlbums, getAllSpaces, getPartners } from '@immich/sdk';
import { isLibrarySpace } from '$lib/managers/album-folders.svelte';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  // Local Omarchy layer (plan A, "Let's go with A"): this page is Shared, the one place for everything shared, as the
  // Mac keeps Shared Albums beside My Albums: the albums shared by or with me, the Spaces (except Library, the Albums
  // tree's engine) and the partners
  const [sharedAlbums, partners, spaces] = await Promise.all([
    getAllAlbums({ isShared: true }),
    getPartners({ direction: PartnerDirection.SharedWith }),
    getAllSpaces(),
  ]);
  const $t = await getFormatter();

  return {
    sharedAlbums,
    partners,
    spaces: spaces.filter((space) => !isLibrarySpace(space)),
    meta: {
      title: $t('shared'),
    },
  };
}) satisfies PageLoad;
