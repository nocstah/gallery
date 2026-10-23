// Local Omarchy layer: the Shared page's feed (utils/shared-feed is its shape). Every source is asked at once, each
// with a cap, and one that fails leaves the others standing: the Spaces' activity (Library left out: its rows are the
// album folders' bookkeeping, managers/album-folders), the comments and hearts on shared albums, the photos new in
// them since this browser last looked, and the links I made. A Space with more activity than its first page is asked
// for the next one only as the feed is read down to it.
import {
  AssetOrder,
  AssetVisibility,
  getActivities,
  getAllAlbums,
  getAllSharedLinks,
  getAllSpaces,
  getPartners,
  getSpaceActivities,
  PartnerDirection,
  searchAssets,
  type AlbumResponseDto,
  type PartnerResponseDto,
  type SharedLinkResponseDto,
  type SharedSpaceActivityResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import { SvelteSet } from 'svelte/reactivity';
import { isLibrarySpace } from '$lib/managers/album-folders.svelte';
import { appendUniqueById } from '$lib/utils/people-utils';
import {
  freshItems,
  isoOf,
  linkItems,
  reactionItems,
  sortItems,
  spaceItems,
  takeSharedVisit,
  withoutPhotos,
  type FeedItem,
  type FeedPerson,
} from '$lib/utils/shared-feed';

/** the Spaces whose activity is read (the most recently active first) */
export const SPACES_MAX = 12;
/** a Space's activity rows per request */
export const SPACE_PAGE = 30;
/** the shared albums whose comments and hearts are read (the most recently changed first) */
export const REACTION_ALBUMS_MAX = 24;
/** the shared albums whose new photos are looked up */
export const FRESH_ALBUMS_MAX = 8;
/** new photos looked up per album */
export const FRESH_PHOTOS_MAX = 1000;
/** the links I made, newest first */
export const LINKS_MAX = 40;
/** items shown at first, and added by each Show more */
export const FEED_PAGE = 20;
/** requests in flight at once, per fan-out */
const PARALLEL = 6;

type SpaceFeed = {
  space: SharedSpaceResponseDto;
  activities: SharedSpaceActivityResponseDto[];
  /** where the next page starts on the server (rows a page repeats count too) */
  offset: number;
  hasMore: boolean;
  failed: boolean;
};

/** Each item through `run`, at most `limit` at a time, every outcome kept (one failing request fails nothing else). */
const settleLimited = async <T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) => {
  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await run(items[index]) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const rejected = (results: PromiseSettledResult<unknown>[]) =>
  results.filter(({ status }) => status === 'rejected').length;
const time = (iso?: string | null) => (iso ? Date.parse(iso) : 0);

export class SharedFeed {
  /** the first look is still on its way */
  loading = $state(true);
  /** the requests that failed: the page says part of the feed is missing, and offers to try again */
  failures = $state(0);
  /** the Spaces (Library left out), shared albums, links and partners, for the page's quiet ways to them */
  spaces = $state.raw<SharedSpaceResponseDto[]>([]);
  sharedAlbums = $state.raw<AlbumResponseDto[]>([]);
  links = $state.raw<SharedLinkResponseDto[]>([]);
  partners = $state.raw<PartnerResponseDto[]>([]);
  /** since when photos in a shared album count as new: this browser's last look */
  readonly since: number;

  #me!: FeedPerson;
  #feeds = $state.raw<SpaceFeed[]>([]);
  #reactions = $state.raw<FeedItem[]>([]);
  #fresh = $state.raw<FeedItem[]>([]);
  #gone = new SvelteSet<string>();
  #shown = $state(FEED_PAGE);
  #reading = false;

  #all = $derived(
    sortItems(
      withoutPhotos(
        [
          ...this.#feeds.flatMap(({ space, activities }) => spaceItems(space, activities)),
          ...this.#reactions,
          ...this.#fresh,
          ...linkItems(this.links, this.#me),
        ],
        this.#gone,
      ),
    ),
  );
  /** Space activity comes a page at a time: nothing older than the last row read from a Space with more to read shows
   * yet, or that Space's next page could slip in above it */
  #horizon = $derived(
    Math.max(
      -Infinity,
      ...this.#feeds
        .filter(({ hasMore, failed }) => hasMore && !failed)
        .map(({ activities }) => Math.min(...activities.map(({ createdAt }) => time(createdAt)))),
    ),
  );
  #ready = $derived(this.#all.filter(({ at }) => time(at) >= this.#horizon));

  /** what the page shows, newest first */
  items = $derived(this.#ready.slice(0, this.#shown));
  /** there is more below: shown already, or still to read from a Space */
  canShowMore = $derived(
    this.#ready.length > this.#shown || this.#feeds.some(({ hasMore, failed }) => hasMore && !failed),
  );
  /** nothing is shared at all yet (a Space of one with nothing in it, no shared album, no link) */
  nothingShared = $derived(
    this.sharedAlbums.length === 0 &&
      this.links.length === 0 &&
      this.spaces.every((space) => !space.assetCount && !space.albumCount && (space.memberCount ?? 1) <= 1),
  );

  constructor(me: FeedPerson, now = Date.now()) {
    this.#me = me;
    this.since = takeSharedVisit(now);
  }

  /** Every source at once; the feed shows when all have answered (or failed). */
  async load() {
    this.loading = true;
    const failures = await Promise.all([
      this.#loadSpaces(),
      this.#loadAlbums(),
      this.#loadLinks(),
      this.#loadPartners(),
    ]);
    this.failures = failures.reduce((sum, count) => sum + count, 0);
    this.loading = false;
  }

  /** The next items; reads the next page of the Spaces that hold the feed back once the ones read are all shown. */
  async showMore() {
    this.#shown += FEED_PAGE;
    if (this.#reading) {
      return;
    }
    this.#reading = true;
    try {
      while (this.#ready.length < this.#shown) {
        const pending = this.#feeds.filter(({ hasMore, failed }) => hasMore && !failed);
        if (pending.length === 0) {
          break;
        }
        this.failures += await this.#readMore(pending);
      }
    } finally {
      this.#reading = false;
    }
  }

  /** Photos put in the trash from the viewer leave their items. */
  forget(assetIds: string[]) {
    for (const id of assetIds) {
      this.#gone.add(id);
    }
  }

  /** The item a photo in the viewer belongs to, for the viewer to step through its photos: the one it was opened from
   * while that still holds it, else the first that does (a photo opened from a link). */
  itemWith(assetId: string, key?: string) {
    const holds = ({ photoIds }: FeedItem) => photoIds.includes(assetId);
    return this.#all.find((item) => item.key === key && holds(item)) ?? this.#all.find((item) => holds(item));
  }

  async #loadSpaces() {
    let all: SharedSpaceResponseDto[];
    try {
      all = await getAllSpaces();
    } catch {
      return 1;
    }
    this.spaces = all.filter((space) => !isLibrarySpace(space));
    const asked = [...this.spaces].sort((a, b) => time(b.lastActivityAt) - time(a.lastActivityAt)).slice(0, SPACES_MAX);
    const results = await settleLimited(asked, PARALLEL, (space) =>
      getSpaceActivities({ id: space.id, limit: SPACE_PAGE, offset: 0 }),
    );
    this.#feeds = asked.map((space, index) => {
      const result = results[index];
      return result.status === 'fulfilled'
        ? {
            space,
            activities: result.value,
            offset: result.value.length,
            hasMore: result.value.length === SPACE_PAGE,
            failed: false,
          }
        : { space, activities: [], offset: 0, hasMore: false, failed: true };
    });
    return rejected(results);
  }

  async #readMore(feeds: SpaceFeed[]) {
    const results = await settleLimited(feeds, PARALLEL, ({ space, offset }) =>
      getSpaceActivities({ id: space.id, limit: SPACE_PAGE, offset }),
    );
    this.#feeds = this.#feeds.map((feed) => {
      const index = feeds.findIndex(({ space }) => space.id === feed.space.id);
      if (index === -1) {
        return feed;
      }
      const result = results[index];
      // merged by id: anything done in the Space meanwhile pushes the offset down and re-sends a row already read
      return result.status === 'fulfilled'
        ? {
            ...feed,
            activities: appendUniqueById(feed.activities, result.value),
            offset: feed.offset + result.value.length,
            hasMore: result.value.length === SPACE_PAGE,
          }
        : { ...feed, failed: true };
    });
    return rejected(results);
  }

  async #loadAlbums() {
    let albums: AlbumResponseDto[];
    try {
      albums = await getAllAlbums({ isShared: true });
    } catch {
      return 1;
    }
    this.sharedAlbums = albums;
    const changed = (album: AlbumResponseDto) =>
      Math.max(time(album.updatedAt), time(album.lastModifiedAssetTimestamp));
    const reacting = albums
      .filter(({ isActivityEnabled }) => isActivityEnabled)
      .sort((a, b) => changed(b) - changed(a))
      .slice(0, REACTION_ALBUMS_MAX);
    // the album's newest change to a photo is after the last look: what of it was uploaded since then is new
    const fresh = albums
      .filter(({ lastModifiedAssetTimestamp }) => time(lastModifiedAssetTimestamp) > this.since)
      .sort((a, b) => time(b.lastModifiedAssetTimestamp) - time(a.lastModifiedAssetTimestamp))
      .slice(0, FRESH_ALBUMS_MAX);
    const createdAfter = isoOf(this.since);
    const [reactions, news] = await Promise.all([
      settleLimited(reacting, PARALLEL, (album) => getActivities({ albumId: album.id })),
      settleLimited(fresh, PARALLEL, (album) =>
        searchAssets({
          metadataSearchDto: { albumIds: [album.id], createdAfter, size: FRESH_PHOTOS_MAX, order: AssetOrder.Desc },
        }),
      ),
    ]);
    this.#reactions = reacting.flatMap((album, index) => {
      const result = reactions[index];
      return result.status === 'fulfilled' ? reactionItems(album, result.value) : [];
    });
    this.#fresh = fresh.flatMap((album, index) => {
      const result = news[index];
      // a live photo's video half is hidden, and is not a photo of its own
      const assets =
        result.status === 'fulfilled'
          ? result.value.assets.items.filter(
              ({ visibility, isTrashed }) => visibility !== AssetVisibility.Hidden && !isTrashed,
            )
          : [];
      return freshItems(album, assets, this.#me);
    });
    return rejected(reactions) + rejected(news);
  }

  async #loadLinks() {
    try {
      const links = await getAllSharedLinks({});
      this.links = [...links].sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, LINKS_MAX);
      return 0;
    } catch {
      return 1;
    }
  }

  async #loadPartners() {
    try {
      this.partners = await getPartners({ direction: PartnerDirection.SharedWith });
    } catch {
      // only the bar's way to a partner's photos waits for them
    }
    return 0;
  }
}
