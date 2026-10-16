import {
  ReactionType,
  SharedLinkType,
  UserAvatarColor,
  type ActivityResponseDto,
  type AssetResponseDto,
  type SharedSpaceActivityResponseDto,
  type UserResponseDto,
} from '@immich/sdk';
import { albumFactory } from '@test-data/factories/album-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import {
  freshItems,
  groupByDay,
  linkItems,
  MERGE_GAP_MS,
  reactionItems,
  relativeTime,
  sortItems,
  spaceItems,
  takeSharedVisit,
  withoutPhotos,
  type FeedItem,
  type FeedPerson,
} from './shared-feed';

const user = (id: string, name: string): UserResponseDto => ({
  id,
  name,
  email: `${id}@example.com`,
  profileImagePath: '',
  avatarColor: UserAvatarColor.Primary,
  profileChangedAt: '2026-01-01T00:00:00.000Z',
});
const mom = user('mom', 'Mom');
const dad = user('dad', 'Dad');
const me: FeedPerson = { ...user('me', 'Me') };

const space = { id: 'family', name: 'Family' };
let row = 0;
const activity = (
  type: string,
  createdAt: string,
  data: Record<string, unknown> = {},
  person: UserResponseDto | null = mom,
): SharedSpaceActivityResponseDto => ({
  id: `a${row++}`,
  type,
  createdAt,
  data,
  userId: person?.id ?? null,
  userName: person?.name ?? null,
  userEmail: person?.email ?? null,
  userAvatarColor: 'primary',
  userProfileImagePath: '',
});

const reaction = (
  type: ReactionType,
  createdAt: string,
  who: UserResponseDto,
  assetId: string | null,
  comment?: string,
): ActivityResponseDto => ({ id: `r${row++}`, type, createdAt, user: who, assetId, comment });

const asset = (id: string, ownerId: string, createdAt: string) => ({ id, ownerId, createdAt }) as AssetResponseDto;

describe('spaceItems', () => {
  it("merges one person's adds to a place in a sitting into one item", () => {
    const items = spaceItems(space, [
      activity('asset_add', '2026-10-16T10:00:00.000Z', { count: 3, assetIds: ['p1', 'p2', 'p3'] }),
      activity('asset_add', '2026-10-16T11:30:00.000Z', { count: 5, assetIds: ['p4', 'p5', 'p6', 'p7'] }),
      activity('asset_add', '2026-10-16T12:10:00.000Z', { count: 4, assetIds: ['p8', 'p9', 'p1'] }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'added',
      count: 12,
      at: '2026-10-16T12:10:00.000Z',
      since: '2026-10-16T10:00:00.000Z',
      place: { kind: 'space', id: 'family', name: 'Family' },
      person: { id: 'mom', name: 'Mom' },
    });
    // newest batch first, each photo once
    expect(items[0].photoIds).toEqual(['p8', 'p9', 'p1', 'p4', 'p5', 'p6', 'p7', 'p2', 'p3']);
  });

  it('keeps adds apart across a long gap, midnight, or another person', () => {
    const later = new Date(Date.parse('2026-10-16T08:00:00.000Z') + MERGE_GAP_MS + 1).toISOString();
    const gap = spaceItems(space, [
      activity('asset_add', '2026-10-16T08:00:00.000Z', { count: 1 }),
      activity('asset_add', later, { count: 2 }),
    ]);
    const midnight = spaceItems(space, [
      activity('asset_add', '2026-10-16T00:10:00.000Z', { count: 1 }),
      activity('asset_add', '2026-10-15T23:50:00.000Z', { count: 1 }),
    ]);
    const people = spaceItems(space, [
      activity('asset_add', '2026-10-16T08:00:00.000Z', { count: 1 }),
      activity('asset_add', '2026-10-16T08:05:00.000Z', { count: 1 }, dad),
    ]);

    expect(gap.map((item) => item.kind === 'added' && item.count)).toEqual([2, 1]);
    expect(midnight).toHaveLength(2);
    expect(people.map(({ person }) => person?.name)).toEqual(['Dad', 'Mom']);
  });

  it('reads albums, members and removals, and leaves the Space housekeeping to its own page', () => {
    const items = spaceItems(space, [
      activity('album_link', '2026-10-16T09:00:00.000Z', { albumId: 'bali', albumName: 'Bali' }),
      activity('album_unlink', '2026-10-16T08:00:00.000Z', { albumId: 'old', albumName: 'Old' }),
      activity('member_join', '2026-10-16T07:00:00.000Z', { role: 'editor' }, dad),
      activity('member_leave', '2026-10-16T06:00:00.000Z', {}, dad),
      activity('asset_remove', '2026-10-16T05:00:00.000Z', { count: 2 }),
      activity('person_face_assign', '2026-10-16T04:00:00.000Z', { count: 9 }),
      activity('cover_change', '2026-10-16T03:00:00.000Z'),
      activity('space_rename', '2026-10-16T02:00:00.000Z', { oldName: 'A', newName: 'B' }),
    ]);

    expect(items.map(({ kind }) => kind)).toEqual(['album-added', 'album-removed', 'joined', 'left', 'removed']);
    expect(items[0]).toMatchObject({ album: { id: 'bali', name: 'Bali' } });
  });

  it('keeps an activity whose author is gone, without a person', () => {
    const [item] = spaceItems(space, [activity('asset_add', '2026-10-16T09:00:00.000Z', { count: 1 }, null)]);
    expect(item.person).toBeNull();
  });
});

describe('reactionItems', () => {
  const album = albumFactory.build({ id: 'bali', albumName: 'Bali' });

  it("gathers a day's comments on an album into one item, oldest first, with their photos", () => {
    const [item] = reactionItems(album, [
      reaction(ReactionType.Comment, '2026-10-16T10:00:00.000Z', mom, 'p1', 'So cute!'),
      reaction(ReactionType.Comment, '2026-10-16T12:00:00.000Z', dad, null, 'Lovely trip'),
      reaction(ReactionType.Comment, '2026-10-16T11:00:00.000Z', mom, 'p2', 'Look at that wave'),
    ]);

    expect(item).toMatchObject({ kind: 'comments', at: '2026-10-16T12:00:00.000Z', person: { id: 'dad' } });
    if (item.kind !== 'comments') {
      throw new Error('expected comments');
    }
    expect(item.comments.map(({ text }) => text)).toEqual(['So cute!', 'Look at that wave', 'Lovely trip']);
    expect(item.people.map(({ name }) => name)).toEqual(['Dad', 'Mom']);
    // in the order the comments read, as the viewer steps through them
    expect(item.photoIds).toEqual(['p1', 'p2']);
  });

  it('collapses hearts into one item a day, counting hearts and the photos they are on', () => {
    const items = reactionItems(album, [
      reaction(ReactionType.Like, '2026-10-15T10:00:00.000Z', mom, 'p1'),
      reaction(ReactionType.Like, '2026-10-15T11:00:00.000Z', dad, 'p1'),
      reaction(ReactionType.Like, '2026-10-15T12:00:00.000Z', mom, 'p2'),
      reaction(ReactionType.Like, '2026-10-15T13:00:00.000Z', dad, null),
      reaction(ReactionType.Like, '2026-10-14T13:00:00.000Z', dad, 'p3'),
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'hearts', hearts: 4, photoIds: ['p2', 'p1'] });
    expect(items[1]).toMatchObject({ kind: 'hearts', hearts: 1, photoIds: ['p3'] });
  });
});

describe('freshItems', () => {
  const album = albumFactory.build({
    id: 'bali',
    albumName: 'Bali',
    albumUsers: [{ user: mom, role: 'owner' as never }],
  });

  it("makes an item per person and sitting of an album's new photos, naming them from its members", () => {
    const items = freshItems(
      album,
      [
        asset('p1', 'mom', '2026-10-16T10:00:00.000Z'),
        asset('p2', 'mom', '2026-10-16T10:05:00.000Z'),
        asset('p3', 'me', '2026-10-16T09:00:00.000Z'),
        asset('p4', 'stranger', '2026-10-16T08:00:00.000Z'),
        asset('p5', 'mom', '2026-10-15T10:00:00.000Z'),
      ],
      me,
    );

    expect(
      items.map((item) => [item.person?.name ?? null, item.kind === 'added' && item.count, item.photoIds]),
    ).toEqual([
      ['Mom', 2, ['p2', 'p1']],
      ['Me', 1, ['p3']],
      [null, 1, ['p4']],
      ['Mom', 1, ['p5']],
    ]);
    expect(items[0]).toMatchObject({ place: { kind: 'album', id: 'bali', name: 'Bali' } });
  });
});

describe('linkItems', () => {
  it("shows an album link with the album's cover, and a link to photos with them", () => {
    const album = albumFactory.build({ id: 'bali', albumName: 'Bali', albumThumbnailAssetId: 'cover', assetCount: 40 });
    const items = linkItems(
      [
        sharedLinkFactory.build({ id: 'l1', type: SharedLinkType.Album, album, expiresAt: null }),
        sharedLinkFactory.build({
          id: 'l2',
          type: SharedLinkType.Individual,
          description: 'For grandma',
          assets: [{ id: 'p1' }, { id: 'p2' }] as AssetResponseDto[],
        }),
        sharedLinkFactory.build({ id: 'l3', type: SharedLinkType.Album, album: undefined }),
      ],
      me,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'link', place: { kind: 'album', name: 'Bali' }, photoIds: ['cover'] });
    expect(items[1]).toMatchObject({
      kind: 'link',
      count: 2,
      place: { kind: 'links', name: 'For grandma' },
      photoIds: ['p1', 'p2'],
    });
    expect(items[0].person).toBe(me);
  });
});

describe('sortItems and groupByDay', () => {
  it('orders newest first and splits by the local day', () => {
    const items = sortItems([
      ...spaceItems(space, [activity('member_join', '2026-10-15T09:00:00.000Z')]),
      ...spaceItems(space, [activity('member_leave', '2026-10-16T09:00:00.000Z', {}, dad)]),
      ...spaceItems(space, [activity('member_join', '2026-10-16T07:00:00.000Z', {}, dad)]),
    ]);
    const days = groupByDay(items);

    expect(days.map(({ key }) => key)).toEqual(['2026-10-16', '2026-10-15']);
    expect(days[0].items.map(({ kind }) => kind)).toEqual(['left', 'joined']);
  });
});

describe('withoutPhotos', () => {
  it('counts photos gone to the trash out of an add, and drops an add with nothing left', () => {
    const items: FeedItem[] = [
      ...spaceItems(space, [activity('asset_add', '2026-10-16T09:00:00.000Z', { count: 5, assetIds: ['p1', 'p2'] })]),
      ...freshItems(albumFactory.build({ albumUsers: [] }), [asset('p3', 'me', '2026-10-16T08:00:00.000Z')], me),
    ];
    const left = withoutPhotos(items, new Set(['p1', 'p3']));

    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ count: 4, photoIds: ['p2'] });
    expect(withoutPhotos(items, new Set())).toBe(items);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('says how long ago in a few characters, never "yesterday"', () => {
    expect(relativeTime(ago(20), now, 'en')).toBe('now');
    expect(relativeTime(ago(5 * 60), now, 'en')).toBe('5m ago');
    expect(relativeTime(ago(2 * 3600 + 59), now, 'en')).toBe('2h ago');
    expect(relativeTime(ago(30 * 3600), now, 'en')).toBe('1d ago');
    expect(relativeTime(ago(15 * 86_400), now, 'en')).toBe('2w ago');
    expect(relativeTime(ago(100 * 86_400), now, 'en')).toBe('3mo ago');
    expect(relativeTime(ago(800 * 86_400), now, 'en')).toBe('2y ago');
  });

  it('takes the short style where the narrow one is a signed number', () => {
    expect(relativeTime(ago(2 * 3600), now, 'fr')).not.toMatch(/^[-−]/);
  });
});

describe('takeSharedVisit', () => {
  const HOUR = 3600 * 1000;
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  beforeEach(() => localStorage.clear());

  it('counts the last week as new on the first look, then what came since the previous look', () => {
    expect(takeSharedVisit(now)).toBe(now - 7 * 24 * HOUR);
    expect(takeSharedVisit(now + 5 * HOUR)).toBe(now);
  });

  it('keeps what was new while the same look goes on (a reload, a photo opened and closed)', () => {
    takeSharedVisit(now - 24 * HOUR);
    const since = takeSharedVisit(now);
    expect(takeSharedVisit(now + 10 * 60 * 1000)).toBe(since);
  });

  it('ends a sitting after twelve hours of looks', () => {
    takeSharedVisit(now - 24 * HOUR);
    expect(takeSharedVisit(now)).toBe(now - 24 * HOUR);
    const step = 29 * 60 * 1000;
    for (let look = 1; look < 25; look++) {
      expect(takeSharedVisit(now + look * step)).toBe(now - 24 * HOUR);
    }
    expect(takeSharedVisit(now + 25 * step)).toBe(now + 24 * step);
  });

  it('treats a damaged mark as a first look', () => {
    localStorage.setItem('gallery.sharedVisit', '{nope');
    expect(takeSharedVisit(now)).toBe(now - 7 * 24 * HOUR);
  });
});
