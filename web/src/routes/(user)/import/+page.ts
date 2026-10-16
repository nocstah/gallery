import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  // Local Omarchy layer: one of the owner's tools ("Owner tools only for me"): a family account lands on Photos
  await authenticate(url, { admin: true });
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('import'),
    },
  };
}) satisfies PageLoad;
