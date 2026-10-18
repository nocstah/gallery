import { AssetTypeEnum, getAlbumInfo, getAssetInfo, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { curator } from '$lib/utils/curator';
import { assetFactory } from '@test-data/factories/asset-factory';
import RoomPlayer from './RoomPlayer.svelte';
import { memoryReel, type RoomRequest } from './room-reels';
import { loadAlbumAssets, loadToday } from './room-source';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    authenticated: true,
    user: { id: 'me', isAdmin: true },
    params: {},
    preferences: { memories: { enabled: true, duration: 5 } },
  },
}));

vi.mock('$app/navigation', () => ({
  goto: vi.fn(() => Promise.resolve()),
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuth }));

vi.mock('$lib/utils/curator', async (original) => ({
  ...(await original<typeof import('$lib/utils/curator')>()),
  curatorIsMine: () => mockAuth.authenticated && mockAuth.user.isAdmin,
  curator: {
    story: vi.fn(() => Promise.resolve({ story: null })),
    memoryMusic: vi.fn(() => Promise.resolve({ tracks: [] })),
    memoryFacts: vi.fn(() => Promise.resolve({ memories: {} })),
  },
}));

vi.mock('./room-source', () => ({
  loadToday: vi.fn(),
  loadAlbumAssets: vi.fn(),
  loadYear: vi.fn(),
}));

vi.mock('@immich/sdk', async (original) => ({
  ...(await original<typeof import('@immich/sdk')>()),
  getAlbumInfo: vi.fn(),
  getAssetInfo: vi.fn(),
}));

const memory = (id: string, year: number, count = 3): MemoryResponseDto =>
  ({
    id,
    ownerId: 'me',
    type: MemoryType.OnThisDay,
    data: { year },
    isSaved: false,
    memoryAt: '2026-10-18T00:00:00.000Z',
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
    assets: Array.from({ length: count }, (_, index) =>
      assetFactory.build({
        id: `${id}-${index}`,
        type: AssetTypeEnum.Image,
        width: 4000,
        height: 3000,
        localDateTime: `${year}-10-18T10:00:00.000Z`,
      }),
    ),
  }) as MemoryResponseDto;

const today: RoomRequest = { kind: 'today' };

const film = () => screen.getByTestId('memory-film');

const playing = async (title: string) => {
  await waitFor(() => expect(film()).toHaveAttribute('aria-label', title), { timeout: 3000 });
  await waitFor(() => expect(film()).toHaveAttribute('data-playing'));
};

describe('RoomPlayer', () => {
  let requested: ReturnType<typeof vi.fn>;
  let released: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.user.isAdmin = true;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    released = vi.fn(() => Promise.resolve());
    requested = vi.fn(() => Promise.resolve({ released: false, release: released }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request: requested }, configurable: true });
    vi.mocked(getAssetInfo).mockImplementation(({ id }) =>
      Promise.resolve({
        id,
        localDateTime: '2025-10-18T10:00:00.000Z',
        people: [{ id: 'p', name: 'Anna', isHidden: false }],
        exifInfo: { city: 'Siem Reap', country: 'Cambodia' },
      } as never),
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("plays today's memories one after another, ↓ to the next and round again", async () => {
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025)), memoryReel(memory('m2', 2019))]);
    render(RoomPlayer, { request: today });

    await playing('October 2025');
    expect(film()).toHaveAttribute('data-dress', 'room');

    await fireEvent.keyDown(document, { key: 'ArrowDown' });
    await playing('October 2019');
    await fireEvent.keyDown(document, { key: 'ArrowDown' });
    await playing('October 2025');
    await fireEvent.keyDown(document, { key: 'ArrowUp' });
    await playing('October 2019');
  });

  it('says what comes next, and goes there on a press', async () => {
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025)), memoryReel(memory('m2', 2019))]);
    render(RoomPlayer, { request: today });
    await playing('October 2025');

    const next = screen.getByTestId('room-next');
    expect(next).toHaveTextContent('October 2019');
    await fireEvent.click(next);
    await playing('October 2019');
  });

  it('captions the photo on screen with who, where and when', async () => {
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025))]);
    render(RoomPlayer, { request: today });
    await playing('October 2025');

    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(await screen.findByTestId('memory-film-caption')).toHaveTextContent(
      'Anna · Siem Reap, Cambodia · October 18, 2025',
    );
  });

  it('never captions what the story line over it already says', async () => {
    vi.mocked(curator.story).mockResolvedValue({
      story: { text: 'Anna was in Siem Reap, Cambodia on 18 October 2025. The rain stopped by noon.', model: 'text' },
    } as never);
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025, 4))]);
    render(RoomPlayer, { request: today });
    await playing('October 2025');

    // the newest of each: one on its way out may still be fading
    const story = () => [...document.querySelectorAll('.film-story')].at(-1)?.textContent?.trim();
    const caption = () => screen.queryAllByTestId('memory-film-caption').at(-1)?.textContent?.trim();
    // the first sentence says who, where and when: the caption holds
    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => expect(story()).toBe('Anna was in Siem Reap, Cambodia on 18 October 2025.'));
    await waitFor(() => expect(caption()).toBeUndefined());
    // the next one says none of it: the caption says it all
    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => expect(story()).toBe('The rain stopped by noon.'));
    await waitFor(() => expect(caption()).toBe('Anna · Siem Reap, Cambodia · October 18, 2025'));
  });

  it("asks Curator for a memory's story and songs for its owner, and nothing for a family account", async () => {
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025))]);
    const { unmount } = render(RoomPlayer, { request: today });
    await playing('October 2025');
    expect(curator.story).toHaveBeenCalledWith({ memory: 'm1' });
    expect(curator.memoryMusic).toHaveBeenCalledWith('m1', 3);
    unmount();

    vi.clearAllMocks();
    mockAuth.user.isAdmin = false;
    render(RoomPlayer, { request: today });
    await playing('October 2025');
    expect(curator.story).not.toHaveBeenCalled();
    expect(curator.memoryMusic).not.toHaveBeenCalled();
  });

  it('keeps the screen awake while it plays, and lets it sleep while paused', async () => {
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025))]);
    render(RoomPlayer, { request: today });
    await playing('October 2025');
    expect(requested).toHaveBeenCalledWith('screen');

    await fireEvent.keyDown(document, { key: ' ' });
    await waitFor(() => expect(released).toHaveBeenCalled());
  });

  it("says so when there is nothing to play today, and offers last year's film", async () => {
    vi.mocked(loadToday).mockResolvedValue([]);
    render(RoomPlayer, { request: today });

    expect(await screen.findByRole('heading', { name: 'room_empty_title' })).toBeInTheDocument();
    const year = String(new Date().getFullYear() - 1);
    const play = screen.getByRole('link', { name: 'room_play_year_short' });
    expect(play).toHaveAttribute('href', `/room?year=${year}`);
    await waitFor(() => expect(play).toHaveFocus());
  });

  it('plays an album, and says so when it holds nothing to play', async () => {
    vi.mocked(getAlbumInfo).mockResolvedValue({ id: 'a1', albumName: 'Bali', assetCount: 2 } as never);
    vi.mocked(loadAlbumAssets).mockResolvedValue([]);
    render(RoomPlayer, { request: { kind: 'album', albumId: 'a1' } });

    expect(await screen.findByRole('heading', { name: 'room_album_empty_title' })).toBeInTheDocument();
    expect(loadAlbumAssets).toHaveBeenCalledWith('a1');
  });

  it("says when Gallery isn't answering, with a way to try again", async () => {
    vi.mocked(loadToday)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([memoryReel(memory('m1', 2025))]);
    render(RoomPlayer, { request: today });

    await fireEvent.click(await screen.findByRole('button', { name: 'retry' }));
    await playing('October 2025');
  });

  it("takes a remote's media keys for the films, which would otherwise pause the song alone", async () => {
    const handlers = new Map<string, (() => void) | null>();
    Object.defineProperty(navigator, 'mediaSession', {
      value: { setActionHandler: (action: string, handler: (() => void) | null) => handlers.set(action, handler) },
      configurable: true,
    });
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025)), memoryReel(memory('m2', 2019))]);
    const { unmount } = render(RoomPlayer, { request: today });
    await playing('October 2025');

    handlers.get('pause')?.();
    await waitFor(() => expect(film()).not.toHaveAttribute('data-playing'));
    handlers.get('play')?.();
    await waitFor(() => expect(film()).toHaveAttribute('data-playing'));
    handlers.get('nexttrack')?.();
    await playing('October 2019');

    unmount();
    expect(handlers.get('nexttrack')).toBeNull();
    Reflect.deleteProperty(navigator, 'mediaSession');
  });

  it('goes full screen, leaves when the browser takes it out of full screen, and stays when Room does', async () => {
    let element: Element | null = null;
    const changed = () => document.dispatchEvent(new Event('fullscreenchange'));
    const enter = vi.fn(() => {
      element = document.documentElement;
      changed();
      return Promise.resolve();
    });
    const exit = vi.fn(() => {
      element = null;
      changed();
      return Promise.resolve();
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: enter, configurable: true });
    Object.defineProperties(document, {
      fullscreenEnabled: { value: true, configurable: true },
      fullscreenElement: { get: () => element, configurable: true },
      exitFullscreen: { value: exit, configurable: true },
    });
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025))]);

    render(RoomPlayer, { request: today });
    await playing('October 2025');
    expect(enter).toHaveBeenCalledOnce();

    // Room's own F: out of full screen and back, still in Room
    await fireEvent.keyDown(document, { key: 'f' });
    expect(exit).toHaveBeenCalledOnce();
    await fireEvent.keyDown(document, { key: 'f' });
    await waitFor(() => expect(enter).toHaveBeenCalledTimes(2));
    expect(goto).not.toHaveBeenCalled();

    // the browser's own Escape ends full screen before the page hears the key: that is leaving Room, once
    element = null;
    changed();
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(goto).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith('/photos', { replaceState: true });

    for (const [target, key] of [
      [document, 'fullscreenEnabled'],
      [document, 'fullscreenElement'],
      [document, 'exitFullscreen'],
      [document.documentElement, 'requestFullscreen'],
    ] as const) {
      Reflect.deleteProperty(target, key);
    }
  });

  it('leaves with Escape, for what it played when opened cold', async () => {
    vi.mocked(loadToday).mockResolvedValue([memoryReel(memory('m1', 2025))]);
    render(RoomPlayer, { request: today });
    await playing('October 2025');

    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(goto).toHaveBeenCalledWith('/photos', { replaceState: true });
  });
});
