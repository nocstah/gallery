// Local Omarchy layer: a shared link in words: what it shows, who can open it, and when it ends, counted in calendar
// days ("Ends tomorrow" whatever the hour). One vocabulary wherever a link is told (the owner's "one word for one
// thing", 2026-10-23): the Shared links page's rows (components/omarchy/SharedLinkRow), a link in the Shared feed, a
// link in the Share sheets (components/omarchy/ShareLinkPanel) and the memory Share sheet's sentence, which had said
// "Expires Oct 28", "Ends in 5 days" and "until Nov 22, 2026" of links that end alike.
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

/** When a link ends, in the reader's calendar days (as utils/relative-time counts them): never; ended (today,
 * yesterday, or on a date); or ends today, tomorrow, within the week ("in 5 days") or on a date further off. */
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

/** The day a link ends on, as its line says it: "Nov 22", with the year where it is not this one ("Oct 23, 2027"). */
export const linkEndDay = (date: DateTime, locale: string, now: DateTime = DateTime.now()) =>
  date.setLocale(locale).toLocaleString({
    day: 'numeric',
    month: 'short',
    ...(date.year !== now.year && { year: 'numeric' }),
  });

/** When a link ends, in words ("Ends in 5 days", "Ends Nov 22", "Never ends", "Ended yesterday"), with the day and
 * time it ends for a tooltip. */
export const linkEndWords = (
  $t: MessageFormatter,
  end: LinkEnd,
  locale: string,
  now: DateTime = DateTime.now(),
): { text: string; title?: string } => {
  if (end.state === 'never') {
    return { text: $t('shared_links_row_never') };
  }
  const date = linkEndDay(end.date, locale, now);
  const title = end.date.setLocale(locale).toLocaleString(DateTime.DATETIME_MED);
  return end.state === 'ended'
    ? { text: $t('shared_links_row_ended', { values: { when: end.when, date } }), title }
    : { text: $t('shared_links_row_ends', { values: { when: end.when, days: end.days, date } }), title };
};

/** One fact of a link's line; its end keeps its words together and an end that has passed is said in the danger role. */
export type LinkFact = { text: string; end?: boolean; ended?: boolean; title?: string };

type LinkFacts = Pick<
  SharedLinkResponseDto,
  'password' | 'expiresAt' | 'allowDownload' | 'allowUpload' | 'showMetadata'
>;

/**
 * A link's line: what it is, where its name does not say (`what`: "Album", "Memory", "12 photos"), who can open it,
 * when it ends, then what it lets a visitor do beyond looking. `download` adds whether a visitor can download, for the
 * Share sheets, where the link has just been made with downloads on or off; the lists leave it to Edit.
 */
export const linkFacts = (
  $t: MessageFormatter,
  link: LinkFacts,
  {
    what,
    locale,
    now = DateTime.now(),
    download = false,
  }: { what?: string; locale: string; now?: DateTime; download?: boolean },
): LinkFact[] => {
  const end = linkEnd(link.expiresAt, now);
  const when = linkEndWords($t, end, locale, now);
  const facts: LinkFact[] = what ? [{ text: what }] : [];
  facts.push(
    { text: $t('shared_links_row_who', { values: { password: link.password ? 'yes' : 'no' } }) },
    { text: when.text, title: when.title, end: true, ended: end.state === 'ended' },
  );
  if (download && link.allowDownload) {
    facts.push({ text: $t('shared_links_row_download') });
  }
  if (link.allowUpload) {
    facts.push({ text: $t('shared_links_row_upload') });
  }
  if (link.showMetadata) {
    facts.push({ text: $t('shared_links_row_location') });
  }
  return facts;
};
