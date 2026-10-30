import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  // Local Omarchy layer: one of the owner's tools ("Owner tools only for me"), as the AI inbox: a family account lands
  // on Photos. A vault's Gallery and a library without a Curator for memories leave the page out (gallery/series).
  await authenticate(url, { admin: true });
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('memory_series_title'),
    },
  };
}) satisfies PageLoad;
