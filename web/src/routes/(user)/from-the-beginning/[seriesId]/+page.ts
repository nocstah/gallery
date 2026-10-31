import { seriesIdOf } from '$lib/gallery/series/series-route';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url, params }) => {
  // Local Omarchy layer: one series of From the beginning, by Curator's id, the owner's only as the list is: a family
  // account lands on Photos. An id Curator could not have is a series that is gone, which the page says (gallery/series).
  await authenticate(url, { admin: true });
  const $t = await getFormatter();

  return {
    seriesId: seriesIdOf(params.seriesId),
    meta: {
      title: $t('memory_series_title'),
    },
  };
}) satisfies PageLoad;
