// Local Omarchy layer: Shared as a feed (the owner's choice, 2026-10-16: "Shared as a feed" over sections and a New
// strip). Newest first: who added what to which Space or shared album, the comments and hearts left on shared albums,
// the photos new in them since this browser last looked, and the links I made, each with a strip of its photos. This
// file is the feed's shape (the items each source makes, how they merge, the full time in a tooltip); managers/shared-feed
// fetches the sources, and utils/relative-time says how long ago, by the calendar.
import {
  ReactionType,
  SharedLinkType,
  UserAvatarColor,
  type ActivityResponseDto,
  type AlbumResponseDto,
  type AssetResponseDto,
  type SharedLinkResponseDto,
  type SharedSpaceActivityResponseDto,
  type UserResponseDto,
} from '@immich/sdk';

/** Who did something: a Space activity's user, an album member, or me. */
export type FeedPerson = {
  id: string;
  name: string;
  email: string;
  profileImagePath: string;
  avatarColor: UserAvatarColor;
  profileChangedAt: string;
};

/** Where it happened: a Space, an album, or (a link to photos alone) the shared links. */
export type FeedPlace = { kind: 'space' | 'album' | 'links'; id: string; name: string };

export type FeedComment = { id: string; at: string; person: FeedPerson | null; text: string; assetId: string | null };

type ItemBase = {
  key: string;
  /** the newest thing the item holds: where it sorts, the day it falls on and the time it shows */
  at: string;
  /** the oldest thing it holds */
  since: string;
  place: FeedPlace;
  /** who did it, null where the server no longer knows (a deleted account); several people: the latest */
  person: FeedPerson | null;
  /** the photos it is about, newest first: the strip shows the first few, the viewer steps through them all */
  photoIds: string[];
};

export type FeedItem =
  | (ItemBase & { kind: 'added' | 'removed'; count: number })
  | (ItemBase & { kind: 'album-added' | 'album-removed'; album: { id: string; name: string } })
  | (ItemBase & { kind: 'joined' | 'left' })
  | (ItemBase & { kind: 'comments'; comments: FeedComment[]; people: FeedPerson[] })
  | (ItemBase & { kind: 'hearts'; hearts: number; people: FeedPerson[] })
  // Local Omarchy layer: a link I made carries the link itself, so the feed tells it in the Shared links page's words
  // (utils/shared-link-words: what it shows, who can open it, when it ends)
  | (ItemBase & { kind: 'link'; link: SharedLinkResponseDto });

/** Adds by one person to one place this close together (and on the same day) are one item: a sitting's batches. */
export const MERGE_GAP_MS = 2 * 60 * 60 * 1000;

const ms = (iso: string) => Date.parse(iso);
/** An instant as the API writes it. */
export const isoOf = (time: number) => new Date(time).toISOString();
const newestFirst = <T extends { createdAt: string }>(rows: T[]) =>
  [...rows].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));

/** The local calendar day an instant falls on (the feed's days are the reader's own). */
export const dayKey = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const unique = <T>(values: Iterable<T>) => [...new Set(values)];

export const toFeedPerson = (user: UserResponseDto): FeedPerson => ({
  id: user.id,
  name: user.name,
  email: user.email,
  profileImagePath: user.profileImagePath,
  avatarColor: user.avatarColor,
  profileChangedAt: user.profileChangedAt,
});

const spacePerson = (activity: SharedSpaceActivityResponseDto): FeedPerson | null =>
  activity.userId
    ? {
        id: activity.userId,
        name: activity.userName ?? '',
        email: activity.userEmail ?? '',
        profileImagePath: activity.userProfileImagePath ?? '',
        avatarColor: (activity.userAvatarColor as UserAvatarColor | null) ?? UserAvatarColor.Primary,
        profileChangedAt: '',
      }
    : null;

/** Whether a newer item can take an older event: the same day, and the gap from its oldest event small enough. */
const joins = (item: { since: string }, at: string) =>
  ms(item.since) - ms(at) <= MERGE_GAP_MS && dayKey(item.since) === dayKey(at);

/**
 * A Space's activity as feed items: photos added or removed (one person's batches in a sitting as one item), albums
 * put in or taken out, people joining and leaving. Faces, people, covers, roles and renames are the Space's own
 * housekeeping and stay on its Activity page.
 */
export const spaceItems = (
  space: { id: string; name: string },
  activities: SharedSpaceActivityResponseDto[],
): FeedItem[] => {
  const place: FeedPlace = { kind: 'space', id: space.id, name: space.name };
  const items: FeedItem[] = [];
  const open = new Map<string, Extract<FeedItem, { kind: 'added' | 'removed' }>>();

  for (const activity of newestFirst(activities)) {
    const data = (activity.data ?? {}) as Record<string, unknown>;
    const person = spacePerson(activity);
    const base = { at: activity.createdAt, since: activity.createdAt, place, person, photoIds: [] as string[] };

    switch (activity.type) {
      case 'asset_add':
      case 'asset_remove': {
        const kind = activity.type === 'asset_add' ? 'added' : 'removed';
        const count = Number(data.count ?? 0);
        const photoIds = Array.isArray(data.assetIds) ? (data.assetIds as unknown[]).map(String) : [];
        const mergeKey = `${kind}:${activity.userId ?? ''}`;
        const current = open.get(mergeKey);
        if (current && joins(current, activity.createdAt)) {
          current.count += count;
          current.since = activity.createdAt;
          current.photoIds = unique([...current.photoIds, ...photoIds]);
          break;
        }
        const item: Extract<FeedItem, { kind: 'added' | 'removed' }> = {
          ...base,
          key: `space:${space.id}:${activity.id}`,
          kind,
          count,
          photoIds: unique(photoIds),
        };
        open.set(mergeKey, item);
        items.push(item);
        break;
      }
      case 'album_link':
      case 'album_unlink': {
        const album = { id: String(data.albumId ?? ''), name: String(data.albumName ?? '') };
        const kind = activity.type === 'album_link' ? 'album-added' : 'album-removed';
        items.push({ ...base, key: `space:${space.id}:${activity.id}`, kind, album });
        break;
      }
      case 'member_join':
      case 'member_leave': {
        const kind = activity.type === 'member_join' ? 'joined' : 'left';
        items.push({ ...base, key: `space:${space.id}:${activity.id}`, kind });
        break;
      }
    }
  }
  return items;
};

/**
 * A shared album's comments and hearts as feed items: per day, its comments as one item (each with its text and
 * photo) and its hearts as another ("3 hearts on 2 photos").
 */
export const reactionItems = (album: AlbumResponseDto, activities: ActivityResponseDto[]): FeedItem[] => {
  const place: FeedPlace = { kind: 'album', id: album.id, name: album.albumName };
  const days = new Map<string, ActivityResponseDto[]>();
  for (const activity of newestFirst(activities)) {
    const key = `${activity.type}:${dayKey(activity.createdAt)}`;
    days.set(key, [...(days.get(key) ?? []), activity]);
  }

  const items: FeedItem[] = [];
  for (const [key, group] of days) {
    const newest = group[0];
    const people = unique(group.map(({ user }) => user.id)).map((id) =>
      toFeedPerson(group.find(({ user }) => user.id === id)!.user),
    );
    const base = {
      key: `${album.id}:${key}`,
      at: newest.createdAt,
      since: group.at(-1)!.createdAt,
      place,
      person: people[0] ?? null,
      photoIds: unique(group.map(({ assetId }) => assetId).filter((id): id is string => !!id)),
      people,
    };
    if (newest.type === ReactionType.Comment) {
      const comments = group
        .map((activity) => ({
          id: activity.id,
          at: activity.createdAt,
          person: toFeedPerson(activity.user),
          text: activity.comment ?? '',
          assetId: activity.assetId,
        }))
        .reverse();
      // the viewer steps through their photos in the order the comments read
      const photoIds = unique(comments.map(({ assetId }) => assetId).filter((id): id is string => !!id));
      items.push({ ...base, kind: 'comments', comments, photoIds });
    } else {
      items.push({ ...base, kind: 'hearts', hearts: group.length });
    }
  }
  return items;
};

/**
 * The photos new in a shared album since this browser last looked, as one item per person and sitting (the same
 * merge as a Space's adds): who uploaded them comes from the album's members, me included.
 */
export const freshItems = (album: AlbumResponseDto, assets: AssetResponseDto[], me: FeedPerson): FeedItem[] => {
  const place: FeedPlace = { kind: 'album', id: album.id, name: album.albumName };
  const members = new Map(album.albumUsers.map(({ user }) => [user.id, toFeedPerson(user)]));
  members.set(me.id, me);
  const items: Array<Extract<FeedItem, { kind: 'added' | 'removed' }>> = [];
  const open = new Map<string, Extract<FeedItem, { kind: 'added' | 'removed' }>>();

  for (const asset of newestFirst(assets)) {
    const current = open.get(asset.ownerId);
    if (current && joins(current, asset.createdAt)) {
      current.count += 1;
      current.since = asset.createdAt;
      current.photoIds.push(asset.id);
      continue;
    }
    const item = {
      key: `new:${album.id}:${asset.id}`,
      kind: 'added' as const,
      at: asset.createdAt,
      since: asset.createdAt,
      place,
      person: members.get(asset.ownerId) ?? null,
      photoIds: [asset.id],
      count: 1,
    };
    open.set(asset.ownerId, item);
    items.push(item);
  }
  return items;
};

/** The links I made: to an album (its cover in the strip) or to photos alone (them). */
export const linkItems = (links: SharedLinkResponseDto[], me: FeedPerson): FeedItem[] =>
  links.flatMap((link): FeedItem[] => {
    const base = { key: `link:${link.id}`, at: link.createdAt, since: link.createdAt, person: me };
    if (link.type === SharedLinkType.Album) {
      if (!link.album) {
        return [];
      }
      return [
        {
          ...base,
          kind: 'link',
          link,
          place: { kind: 'album', id: link.album.id, name: link.album.albumName },
          photoIds: link.album.albumThumbnailAssetId ? [link.album.albumThumbnailAssetId] : [],
        },
      ];
    }
    return [
      {
        ...base,
        kind: 'link',
        link,
        place: { kind: 'links', id: link.id, name: link.description ?? '' },
        photoIds: link.assets.map(({ id }) => id),
      },
    ];
  });

/** Newest first; items at the same moment keep one order. */
export const sortItems = (items: FeedItem[]) =>
  [...items].sort((a, b) => ms(b.at) - ms(a.at) || a.key.localeCompare(b.key));

export type FeedDay = { key: string; at: string; items: FeedItem[] };

/** Items (already newest first) by the local day they fall on. */
export const groupByDay = (items: FeedItem[]): FeedDay[] => {
  const days: FeedDay[] = [];
  for (const item of items) {
    const key = dayKey(item.at);
    const last = days.at(-1);
    if (last?.key === key) {
      last.items.push(item);
    } else {
      days.push({ key, at: item.at, items: [item] });
    }
  }
  return days;
};

/** Items without the photos that are gone (put in the trash from the viewer): an add counts them out, and goes when
 * nothing it added is left. */
export const withoutPhotos = (items: FeedItem[], gone: ReadonlySet<string>): FeedItem[] =>
  gone.size === 0
    ? items
    : items.flatMap((item) => {
        const photoIds = item.photoIds.filter((id) => !gone.has(id));
        if (photoIds.length === item.photoIds.length) {
          return [item];
        }
        if (item.kind === 'added') {
          const count = item.count - (item.photoIds.length - photoIds.length);
          return count > 0 ? [{ ...item, photoIds, count }] : [];
        }
        return [{ ...item, photoIds }];
      });

/** The full date and time, for a time's tooltip. */
export const fullTime = (iso: string, locale?: string) => {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(iso).toLocaleString();
  }
};

const VISIT_KEY = 'gallery.sharedVisit';
/** Opening the page again this soon is the same look: what was new stays new (a reload, a photo opened and closed). */
const SITTING_MS = 30 * 60 * 1000;
/** A sitting never stretches past this: whatever happened before it is no longer new. */
const SITTING_MAX_MS = 12 * 60 * 60 * 1000;
/** The first look in this browser counts the last week as new. */
const FIRST_LOOK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Since when photos in shared albums count as new, by this browser's last look at Shared (a per-browser mark, like the
 * layer's other marks), and the mark moved to now. Storage that is blocked or damaged makes every look a first one.
 */
export const takeSharedVisit = (now: number): number => {
  // seen: the last look; since: what counted as new then; start: when that sitting began
  let previous: { seen: number; since: number; start: number } | undefined;
  try {
    const parsed = JSON.parse(localStorage.getItem(VISIT_KEY) ?? 'null') as Record<string, unknown> | null;
    if (parsed && typeof parsed.seen === 'number' && typeof parsed.since === 'number') {
      previous = {
        seen: parsed.seen,
        since: parsed.since,
        start: typeof parsed.start === 'number' ? parsed.start : parsed.seen,
      };
    }
  } catch {
    // blocked or damaged: a first look
  }
  let since = now - FIRST_LOOK_MS;
  let start = now;
  if (previous) {
    const sameSitting = now - previous.seen < SITTING_MS && now - previous.start < SITTING_MAX_MS;
    since = sameSitting ? previous.since : previous.seen;
    start = sameSitting ? previous.start : now;
  }
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify({ seen: now, since, start }));
  } catch {
    // storage blocked: the next look is a first one again
  }
  return since;
};
