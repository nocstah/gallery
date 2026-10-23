// Local Omarchy layer: subject lift (Curator's /api/subject, ~/code/curator/curator/subject.py). The photo's main
// subject cut out of its background goes on the clipboard as a PNG; where the browser keeps the clipboard from the
// page (Gallery opened over the network without HTTPS), it is downloaded instead.
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { curatorSubject } from '$lib/utils/curator';

export const copySubject = async (assetId: string, fileName: string) => {
  const $t = get(t);
  const cut = curatorSubject(assetId);
  try {
    if (globalThis.isSecureContext && navigator.clipboard?.write && globalThis.ClipboardItem) {
      // the item takes the cut-out still being made, so the click's permission to write lasts until it arrives
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': cut })]);
      toastManager.primary($t('copy_subject_copied'));
      return;
    }
    const url = URL.createObjectURL(await cut);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${fileName.replace(/\.[^.]+$/, '')} (subject).png`,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toastManager.primary($t('copy_subject_saved'));
  } catch (error) {
    toastManager.danger($t('copy_subject_failed', { values: { reason: (error as Error).message } }));
  }
};
