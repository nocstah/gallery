// Local Omarchy layer: a shared link in words, for the Shared links page's rows (components/omarchy/SharedLinkRow):
// what it shows, who can open it, and when it ends, counted in calendar days ("Ends tomorrow" whatever the hour).
import { AssetTypeEnum, SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
import { DateTime } from 'luxon';
import type { MessageFormatter } from 'svelte-i18n';

/** what a link shows: an album, a memory, photos, or only videos */
export type LinkKind = 'album' | 'memory' | 'photos' | 'videos';

type KindFacts = Pick<
  SharedLinkResponseDto,
  'type' | 'description' | 'allowDownload' | 'allowUpload' | 'showMetadata' | 'assets'
>;

/**
 * What a link shows. Gallery keeps no mark of a memory's link, so it is known by how the memory Share sheet
 * (modals/MemoryShareModal) makes one: an Individual link named by the memory (its description), either the film's
 * photos with downloads, uploads and the photos' details off, or a film saved as one video with downloads and its
 * details on. Any other Individual link shows photos, or videos when that is all it holds.
 */
export const linkKind = (link: KindFacts): LinkKind => {
  if (link.type === SharedLinkType.Album) {
    return 'album';
  }
  const named = !!link.description?.trim();
  const onlyVideos = link.assets.length > 0 && link.assets.every((asset) => asset.type === AssetTypeEnum.Video);
  if (named && !link.allowDownload && !link.allowUpload && !link.showMetadata) {
    return 'memory';
  }
  if (named && link.assets.length === 1 && onlyVideos && link.allowDownload && link.showMetadata) {
    return 'memory';
  }
  return onlyVideos ? 'videos' : 'photos';
};

/**
 * A link's name and what it is: an album or a memory by its own name ("Album", "Memory"), photos by the words the
 * link was given or, without any, by how many they are (the count is then the name, so it is not said twice).
 */
export const linkName = (
  $t: MessageFormatter,
  link: KindFacts & Pick<SharedLinkResponseDto, 'album'>,
): { name: string; what?: string } => {
  const kind = linkKind(link);
  const count = link.album ? link.album.assetCount : link.assets.length;
  const counted =
    kind === 'videos'
      ? $t('shared_links_row_videos', { values: { count } })
      : $t('assets_count', { values: { count } });
  if (link.album) {
    return { name: link.album.albumName || $t('unnamed_album'), what: $t('album') };
  }
  const words = link.description?.trim();
  if (kind === 'memory') {
    return { name: words || counted, what: $t('shared_links_row_memory') };
  }
  return words ? { name: words, what: counted } : { name: counted };
};

/** When a link ends, in the reader's calendar days: never; ended (today, yesterday, or on a date); or ends today,
 * tomorrow, within the week ("in 5 days") or on a date further off. */
export type LinkEnd =
  | { state: 'never' }
  | { state: 'ended'; when: 'today' | 'yesterday' | 'date'; date: DateTime }
  | { state: 'ends'; when: 'today' | 'tomorrow' | 'soon' | 'date'; days: number; date: DateTime };

export const linkEnd = (expiresAt: string | null | undefined, now: DateTime = DateTime.now()): LinkEnd => {
  if (!expiresAt) {
    return { state: 'never' };
  }
  const date = DateTime.fromISO(expiresAt).setZone(now.zone);
  // calendar days between the two, rounded over a change of the clocks
  const days = Math.round(date.startOf('day').diff(now.startOf('day'), 'days').days);
  if (date <= now) {
    return { state: 'ended', when: days === 0 ? 'today' : days === -1 ? 'yesterday' : 'date', date };
  }
  if (days === 0) {
    return { state: 'ends', when: 'today', days, date };
  }
  if (days === 1) {
    return { state: 'ends', when: 'tomorrow', days, date };
  }
  return { state: 'ends', when: days < 7 ? 'soon' : 'date', days, date };
};
