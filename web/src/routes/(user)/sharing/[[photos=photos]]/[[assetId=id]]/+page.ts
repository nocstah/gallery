import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  // Local Omarchy layer: Shared is a feed (DESIGN.md, Shared). The page asks its sources itself, all at once and each
  // on its own (managers/shared-feed), so it shows at once, a source that fails takes nothing else with it, and a photo
  // opened from the feed and closed again (/sharing/photos/:id) reads nothing twice
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('shared'),
    },
  };
}) satisfies PageLoad;
