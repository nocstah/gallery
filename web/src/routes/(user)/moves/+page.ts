import { redirect } from '@sveltejs/kit';
import { vaultEdition } from '$lib/gallery/edition';
import { Route } from '$lib/route';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  // Local Omarchy layer: a move between libraries is the owner's (gallery/moves); the sign-in comes back here with
  // the move's address, and a family account lands on Photos. A vault's Gallery is none of Kioku's libraries, so it
  // has no move page at all.
  if (vaultEdition()) {
    redirect(307, Route.photos());
  }
  await authenticate(url, { admin: true });
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('moves_list_title'),
    },
  };
}) satisfies PageLoad;
