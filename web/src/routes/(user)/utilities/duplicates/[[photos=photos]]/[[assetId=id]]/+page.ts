import { getAssetDuplicates } from '@immich/sdk';
import { authenticate } from '$lib/utils/auth';
import { curator } from '$lib/utils/curator';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  // Local Omarchy layer: one of the owner's tools ("Owner tools only for me"): a family account lands on Photos
  await authenticate(url, { admin: true });
  // Local Omarchy layer: payment slips with a QR code look alike to Gallery's duplicate detection although each is its
  // own transaction; Curator finds them (jobs/qrcodes.py) and the page leaves those groups out unless asked
  const [all, qr] = await Promise.all([
    getAssetDuplicates(),
    curator
      .duplicatesWithQr()
      .then(({ groups }) => new Set(groups))
      .catch(() => new Set<string>()),
  ]);
  const $t = await getFormatter();

  return {
    duplicates: all.filter(({ duplicateId }) => !qr.has(duplicateId)),
    qrSlips: all.filter(({ duplicateId }) => qr.has(duplicateId)),
    meta: {
      title: $t('duplicates'),
    },
  };
}) satisfies PageLoad;
