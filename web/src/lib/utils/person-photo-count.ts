import type { MessageFormatter } from 'svelte-i18n';

// Local Omarchy layer: how many photos a person's bar says (DESIGN.md, Person page; the owner's "counts that match the
// cards", 2026-10-23). The bar counts the photos it shows: a stack folded onto one photo of the person is one photo
// here, as its tile is, and the photos folded into stacks follow, so the bar still adds up to the People page's count
// and to Add all's ("1 photo · 4 more in stacks" over one tile with a stack of five). It had counted every photo, the
// folded ones too: "5 photos" over that one tile.

/** The bar's count: the photos shown, then those folded into their stacks when there are any. */
export const personPhotoCount = (t: MessageFormatter, shown: number, total: number): string[] => {
  const folded = Math.max(0, total - shown);
  return [
    t('cmdk_preview_photo_count', { values: { count: shown } }),
    ...(folded > 0 ? [t('person_photos_in_stacks', { values: { count: folded } })] : []),
  ];
};
