import { AssetTypeEnum, SharedLinkType, type AssetResponseDto, type SharedLinkResponseDto } from '@immich/sdk';
import type { FilmStoryCue } from './film/film-plan';

/** Only the presentation the owner is sharing; no private asset metadata or session credentials. */
export type MemoryPresentation = {
  assetIds: string[];
  name: string;
  title: string;
  line: string;
  cover: string | null;
  focus: Record<string, [number, number]>;
  story: string | null;
  storyCues: FilmStoryCue[];
  trackIds: string[];
  photoSeconds: number;
  language: string;
};

export type MemoryShareMode = 'memory' | 'portrait' | 'landscape';
export const memoryVideoAspect = (mode: Exclude<MemoryShareMode, 'memory'>) => (mode === 'portrait' ? 9 / 16 : 16 / 9);

// ---- Local Omarchy layer: the Share sheet's link ("Postcard: say it, then share", the owner, 2026-10-23) ----

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a memory's link stays open: the Share sheet's segmented control, 30 days chosen as on every link the Share
 * sheets make (SHARE_LINK_DAYS, `shareLinkExpiry`); `null` keeps it open until it is turned off. Any other date is a
 * press away once the link is made (its Edit link, or Remove expiry).
 */
export const MEMORY_LINK_DAYS = [7, 30, 365, null] as const;
export type MemoryLinkDays = (typeof MEMORY_LINK_DAYS)[number];

/** when a link made now with that choice ends, as Gallery stores it (`expiresAt`), or null for no end */
export const memoryLinkExpiry = (days: MemoryLinkDays, now = Date.now()) =>
  days === null ? null : new Date(now + days * DAY_MS).toISOString();

/** a choice's words in the reader's language ("7 days", "30 days", "1 year"); the year counts as one, not 365 days */
export const memoryLinkDuration = (days: Exclude<MemoryLinkDays, null>, locale?: string) => {
  const [unit, amount] = days === 365 ? (['year', 1] as const) : (['day', days] as const);
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(amount);
};

/** What a link shares: a playable memory (the film, from Curator's snapshot) or one video file of it. */
export type MemoryLinkKind = 'memory' | 'video';
export type MemoryLink = { link: SharedLinkResponseDto; kind: MemoryLinkKind };

/**
 * The name Curator gives a memory's video file (curator/jobs/film.py `file_name`): its title with the characters a
 * file name cannot hold turned to spaces, at most 100 characters.
 */
const filmFileName = (title: string) =>
  title
    // eslint-disable-next-line no-control-regex -- the control characters Curator replaces
    .replaceAll(/[\u{0}-\u{1F}\u{7F}/\\:*?"<>|]+/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 100)
    .replace(/[\s.]+$/, '');

/**
 * A memory's links that are still open, newest first, found among the owner's shared links (one request: Gallery
 * lists each link with its first photo). The Share sheet makes a memory's links individual and names them by the
 * memory's title (their description), so a link of this memory is one of those whose first photo is the memory's
 * (a playable memory), or whose one asset is a video Curator saved under the memory's title (a video file). A link
 * renamed since, or a memory whose title has changed, is not found here; Shared links still lists it.
 */
export const liveMemoryLinks = (
  links: SharedLinkResponseDto[],
  memory: { title: string; assetIds: string[] },
  now = Date.now(),
): MemoryLink[] => {
  const photos = new Set(memory.assetIds);
  const fileName = filmFileName(memory.title);
  const found: MemoryLink[] = [];
  for (const link of links) {
    const first = link.assets[0];
    const open = !link.expiresAt || Date.parse(link.expiresAt) > now;
    if (link.type !== SharedLinkType.Individual || link.description !== memory.title || !first || !open) {
      continue;
    }
    if (photos.has(first.id)) {
      found.push({ link, kind: 'memory' });
    } else if (first.type === AssetTypeEnum.Video && fileName && first.originalFileName.startsWith(fileName)) {
      found.push({ link, kind: 'video' });
    }
  }
  return found.sort((a, b) => b.link.createdAt.localeCompare(a.link.createdAt));
};

/** How many photos a playable memory's film plays: Curator leaves exact copies out (curator/memory_sharing.py). */
export const filmPhotoCount = (assets: Pick<AssetResponseDto, 'id' | 'checksum'>[]) =>
  new Set(assets.map(({ id, checksum }) => checksum || id)).size;
