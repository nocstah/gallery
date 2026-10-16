import {
  AssetVisibility,
  getActivities,
  getAllAlbums,
  getAllSharedLinks,
  getAllSpaces,
  getPartners,
  getSpaceActivities,
  ReactionType,
  searchAssets,
  SharedLinkType,
  UserAvatarColor,
  type AssetResponseDto,
  type SearchResponseDto,
  type SharedSpaceActivityResponseDto,
} from '@immich/sdk';
import { FEED_PAGE, SharedFeed, SPACE_PAGE } from '$lib/managers/shared-feed.svelte';
import type { FeedPerson } from '$lib/utils/shared-feed';
import { albumFactory } from '@test-data/factories/album-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { sharedSpaceFactory } from '@test-data/factories/shared-space-factory';
import { userFactory } from '@test-data/factories/user-factory';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getActivities: vi.fn(),
  getAllAlbums: vi.fn(),
  getAllSharedLinks: vi.fn(),
  getAllSpaces: vi.fn(),
  getPartners: vi.fn(),
  getSpaceActivities: vi.fn(),
  searchAssets: vi.fn(),
}));

const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const HOUR = 3600 * 1000;
const me: FeedPerson = {
  id: 'me',
  name: 'Me',
  email: 'me@example.com',
  profileImagePath: '',
  avatarColor: UserAvatarColor.Primary,
  profileChangedAt: '',
};
const iso = (ms: number) => new Date(ms).toISOString();

// the Library Space is the Albums page's engine: matched here by its name, before any folders have loaded
const library = sharedSpaceFactory.build({ id: 'library', name: 'Library', createdById: '', albumCount: 448 });
const family = sharedSpaceFactory.build({ id: 'family', name: 'Family', memberCount: 2, assetCount: 12 });

const row = (id: string, type: string, at: number, data: Record<string, unknown> = {}) =>
  ({ id, type, createdAt: iso(at), data, userId: 'mom', userName: 'Mom' }) as SharedSpaceActivityResponseDto;

const found = (items: Partial<AssetResponseDto>[]) =>
  ({
    assets: { items, count: items.length, total: items.length, facets: [], nextPage: null },
  }) as unknown as SearchResponseDto;

const feed = async () => {
  const shared = new SharedFeed(me, NOW);
  await shared.load();
  return shared;
};

describe('SharedFeed', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getAllSpaces).mockResolvedValue([library, family]);
    vi.mocked(getSpaceActivities).mockResolvedValue([]);
    vi.mocked(getAllAlbums).mockResolvedValue([]);
    vi.mocked(getActivities).mockResolvedValue([]);
    vi.mocked(searchAssets).mockResolvedValue(found([]));
    vi.mocked(getAllSharedLinks).mockResolvedValue([]);
    vi.mocked(getPartners).mockResolvedValue([]);
  });

  it("asks every source at once and leaves Library's bookkeeping out", async () => {
    vi.mocked(getSpaceActivities).mockResolvedValue([
      row('a1', 'asset_add', NOW - HOUR, { count: 4, assetIds: ['p1', 'p2', 'p3', 'p4'] }),
    ]);
    const shared = await feed();

    expect(getSpaceActivities).toHaveBeenCalledTimes(1);
    expect(getSpaceActivities).toHaveBeenCalledWith({ id: 'family', limit: SPACE_PAGE, offset: 0 });
    expect(getAllAlbums).toHaveBeenCalledWith({ isShared: true });
    expect(getAllSharedLinks).toHaveBeenCalled();
    expect(shared.spaces.map(({ name }) => name)).toEqual(['Family']);
    expect(shared.items).toHaveLength(1);
    expect(shared.items[0]).toMatchObject({ kind: 'added', count: 4, place: { name: 'Family' } });
    expect(shared.failures).toBe(0);
    expect(shared.loading).toBe(false);
  });

  it('keeps every other source when one fails, and counts what failed', async () => {
    vi.mocked(getAllAlbums).mockRejectedValue(new Error('offline'));
    vi.mocked(getSpaceActivities).mockResolvedValue([row('a1', 'member_join', NOW - HOUR)]);
    vi.mocked(getAllSharedLinks).mockResolvedValue([
      sharedLinkFactory.build({ type: SharedLinkType.Individual, assets: [{ id: 'p9' }] as AssetResponseDto[] }),
    ]);
    const shared = await feed();

    expect(shared.failures).toBe(1);
    expect(shared.items.map(({ kind }) => kind).sort()).toEqual(['joined', 'link']);
  });

  it("reads a shared album's comments and hearts", async () => {
    const mom = userFactory.build({ id: 'mom', name: 'Mom' });
    const album = albumFactory.build({ id: 'bali', albumName: 'Bali', isActivityEnabled: true });
    vi.mocked(getAllAlbums).mockResolvedValue([album]);
    vi.mocked(getActivities).mockResolvedValue([
      {
        id: 'c1',
        type: ReactionType.Comment,
        comment: 'So cute!',
        assetId: 'p1',
        createdAt: iso(NOW - HOUR),
        user: mom,
      },
      { id: 'h1', type: ReactionType.Like, assetId: 'p1', createdAt: iso(NOW - 2 * HOUR), user: mom },
    ]);
    const shared = await feed();

    expect(getActivities).toHaveBeenCalledWith({ albumId: 'bali' });
    expect(shared.items.map(({ kind }) => kind)).toEqual(['comments', 'hearts']);
  });

  it('looks for new photos only in the shared albums changed since the last look, and only what came since', async () => {
    const fresh = albumFactory.build({ id: 'fresh', lastModifiedAssetTimestamp: iso(NOW - HOUR), albumUsers: [] });
    const stale = albumFactory.build({ id: 'stale', lastModifiedAssetTimestamp: iso(NOW - 30 * 24 * HOUR) });
    vi.mocked(getAllAlbums).mockResolvedValue([fresh, stale]);
    vi.mocked(searchAssets).mockResolvedValue(
      found([
        { id: 'p1', ownerId: 'me', createdAt: iso(NOW - HOUR), visibility: AssetVisibility.Timeline, isTrashed: false },
        { id: 'v1', ownerId: 'me', createdAt: iso(NOW - HOUR), visibility: AssetVisibility.Hidden, isTrashed: false },
      ]),
    );
    const shared = await feed();

    expect(searchAssets).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchAssets).mock.calls[0][0].metadataSearchDto).toMatchObject({
      albumIds: ['fresh'],
      createdAfter: iso(shared.since),
    });
    // a first look counts the last week as new
    expect(shared.since).toBe(NOW - 7 * 24 * HOUR);
    expect(shared.items).toHaveLength(1);
    expect(shared.items[0]).toMatchObject({ kind: 'added', count: 1, photoIds: ['p1'], person: { id: 'me' } });
  });

  it('reads more of a Space only as the feed is read down to it', async () => {
    const page = Array.from({ length: SPACE_PAGE }, (_, index) =>
      row(`a${index}`, 'member_join', NOW - (index + 1) * HOUR),
    );
    vi.mocked(getSpaceActivities).mockResolvedValueOnce(page).mockResolvedValueOnce([]);
    // older than anything on the Space's first page: it waits until the Space has been read past it
    vi.mocked(getAllSharedLinks).mockResolvedValue([
      sharedLinkFactory.build({
        id: 'old-link',
        type: SharedLinkType.Individual,
        createdAt: iso(NOW - 100 * HOUR),
        assets: [],
      }),
    ]);
    const shared = await feed();

    expect(shared.items).toHaveLength(FEED_PAGE);
    expect(shared.canShowMore).toBe(true);

    await shared.showMore();

    expect(getSpaceActivities).toHaveBeenLastCalledWith({ id: 'family', limit: SPACE_PAGE, offset: SPACE_PAGE });
    expect(shared.items).toHaveLength(SPACE_PAGE + 1);
    expect(shared.items.at(-1)).toMatchObject({ kind: 'link' });
    expect(shared.canShowMore).toBe(false);
  });

  it('takes photos put in the trash out of their items', async () => {
    vi.mocked(getSpaceActivities).mockResolvedValue([
      row('a1', 'asset_add', NOW - HOUR, { count: 2, assetIds: ['p1', 'p2'] }),
    ]);
    const shared = await feed();
    shared.forget(['p1']);

    expect(shared.items[0]).toMatchObject({ count: 1, photoIds: ['p2'] });
    expect(shared.itemWith('p2')?.photoIds).toEqual(['p2']);
    expect(shared.itemWith('p1')).toBeUndefined();
  });

  it('knows when nothing is shared at all', async () => {
    vi.mocked(getAllSpaces).mockResolvedValue([
      library,
      sharedSpaceFactory.build({ name: 'Family', memberCount: 1, albumCount: 0, assetCount: 0 }),
    ]);
    const empty = await feed();
    expect(empty.nothingShared).toBe(true);

    vi.mocked(getAllAlbums).mockResolvedValue([albumFactory.build({ hasSharedLink: true })]);
    const sharing = await feed();
    expect(sharing.nothingShared).toBe(false);
  });

  it('shows the feed without the partners when they cannot be read', async () => {
    vi.mocked(getPartners).mockRejectedValue(new Error('offline'));
    const shared = await feed();

    expect(shared.failures).toBe(0);
    expect(shared.partners).toEqual([]);
  });
});
