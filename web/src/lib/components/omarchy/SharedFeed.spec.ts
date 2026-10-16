import { ReactionType, UserAvatarColor, type ActivityResponseDto, type UserResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '$i18n/en.json';
import { reactionItems, sortItems, spaceItems, type FeedItem } from '$lib/utils/shared-feed';
import { albumFactory } from '@test-data/factories/album-factory';
import SharedFeed from './SharedFeed.svelte';

// Local Omarchy layer: the Shared page's feed (components/omarchy/SharedFeed)
const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3600 * 1000;

const person = (id: string, name: string): UserResponseDto => ({
  id,
  name,
  email: `${id}@example.com`,
  profileImagePath: '',
  avatarColor: UserAvatarColor.Primary,
  profileChangedAt: '',
});
const mom = person('mom', 'Mom');
const dad = person('dad', 'Dad');

const space = { id: 'family', name: 'Family' };
const add = (who: UserResponseDto, at: number, count: number, assetIds: string[]) => ({
  id: `add-${who.id}-${at}`,
  type: 'asset_add',
  createdAt: iso(at),
  data: { count, assetIds },
  userId: who.id,
  userName: who.name,
});
const reaction = (type: ReactionType, at: number, who: UserResponseDto, assetId: string | null, comment?: string) =>
  ({ id: `${type}-${who.id}-${at}`, type, createdAt: iso(at), user: who, assetId, comment }) as ActivityResponseDto;

const album = albumFactory.build({ id: 'bali', albumName: 'Bali' });
const items: FeedItem[] = sortItems([
  ...spaceItems(space, [
    add(mom, NOW - 2 * HOUR, 12, ['p1', 'p2', 'p3', 'p4']),
    add(mom, NOW - 2.5 * HOUR, 4, ['p5', 'p6', 'p7', 'p8']),
    add(person('me', 'Me'), NOW - 5 * HOUR, 4, ['p9']),
  ]),
  ...reactionItems(album, [
    reaction(ReactionType.Comment, NOW - 26 * HOUR, mom, 'p1', 'So cute!'),
    reaction(ReactionType.Like, NOW - 27 * HOUR, mom, 'p1'),
    reaction(ReactionType.Like, NOW - 27 * HOUR, dad, 'p2'),
    reaction(ReactionType.Like, NOW - 28 * HOUR, dad, 'p1'),
  ]),
]);

const renderFeed = (props: Partial<{ canShowMore: boolean; onShowMore: () => void; onOpenPhoto: () => void }> = {}) =>
  render(SharedFeed, {
    items,
    meId: 'me',
    canShowMore: props.canShowMore ?? false,
    onShowMore: props.onShowMore ?? vi.fn(),
    photoHref: (id: string) => `/sharing/photos/${id}`,
    onOpenPhoto: props.onOpenPhoto,
  });

describe('SharedFeed', () => {
  beforeAll(async () => {
    addMessages('en', en);
    await init({ fallbackLocale: 'en', initialLocale: 'en' });
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('groups the items by day, newest first, each with where, who and what, and when', () => {
    renderFeed();
    expect(screen.getAllByRole('heading', { level: 2 }).map(({ textContent }) => textContent)).toEqual([
      'Today',
      'Yesterday',
    ]);
    const rows = screen.getAllByTestId('feed-item');
    expect(rows.map((row) => row.querySelector('.ws-feed-head')?.textContent?.replaceAll(/\s+/g, ' ').trim())).toEqual([
      'Family · Mom added 16 photos',
      'Family · You added 4 photos',
      'Bali · Mom commented',
      'Bali · 3 hearts on 2 photos',
    ]);
    expect(within(rows[0]).getByRole('link', { name: 'Family' })).toHaveAttribute('href', '/spaces/family');
    expect(within(rows[0]).getByText('2h ago')).toHaveAttribute('datetime', iso(NOW - 2 * HOUR));
  });

  it('shows six of the photos as tiles that open in the viewer, then how many more and where', async () => {
    const onOpenPhoto = vi.fn();
    renderFeed({ onOpenPhoto });
    const [first] = screen.getAllByTestId('feed-item');
    const tiles = first.querySelectorAll<HTMLAnchorElement>('.ws-feed-tile');

    expect([...tiles].map((tile) => tile.getAttribute('href'))).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => `/sharing/photos/${id}`),
    );
    expect(first.querySelector('.ws-feed-more-wide')).toHaveTextContent('+10');
    expect(first.querySelector('.ws-feed-more-wide')).toHaveAttribute('href', '/spaces/family');
    expect(first.querySelector('.ws-feed-more-narrow')).toHaveTextContent('+12');

    tiles[2].addEventListener('click', (event) => event.preventDefault());
    await fireEvent.click(tiles[2]);
    expect(onOpenPhoto).toHaveBeenCalledWith(items[0], 'p3');
  });

  it("shows a comment's words beside its photo, and who gave several people's hearts", () => {
    renderFeed();
    const rows = screen.getAllByTestId('feed-item');
    const comments = rows[2];
    const hearts = rows[3];

    expect(within(comments).getByText('“So cute!”')).toBeInTheDocument();
    expect(comments.querySelector('.ws-feed-tile')).toHaveAttribute('href', '/sharing/photos/p1');
    expect(within(hearts).getByText('Mom and Dad')).toBeInTheDocument();
    expect(hearts.querySelectorAll('.ws-feed-tile')).toHaveLength(2);
  });

  it('offers more only when there is more', async () => {
    const onShowMore = vi.fn();
    const { unmount } = renderFeed({ canShowMore: false });
    expect(screen.queryByTestId('feed-show-more')).not.toBeInTheDocument();
    unmount();

    renderFeed({ canShowMore: true, onShowMore });
    await fireEvent.click(screen.getByTestId('feed-show-more'));
    expect(onShowMore).toHaveBeenCalledOnce();
  });
});
