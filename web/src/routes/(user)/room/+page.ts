import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

// Local Omarchy layer: Room is for every account (a family member's plays silent: its music is Curator's owner's); it
// reads what it plays itself, so the page is there at once, within the press that opened it full screen
export const load = (async ({ url }) => {
  await authenticate(url);
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('room'),
    },
  };
}) satisfies PageLoad;
