import { AlbumUserRole, type AlbumResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import SmartAlbumBadge from '$lib/components/curator/SmartAlbumBadge.svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { getAlbumActions } from '$lib/services/album.service';
import { secondWithout, serving } from '@test-data/factories/library-context-factory';
import { seriesCard, smartAlbum } from '@test-data/factories/series-factory';
import { albumSeriesAction, forgetSmartAlbums, smartAlbumStopped } from './series-album.svelte';

// Local Omarchy layer: A memory a day from this album (gallery/series), on a smart album's page: in the album's ⋮
// menu (its Actions) and in the smart album's note, for whoever has From the beginning, only for a smart album, which
// Curator is asked about once. It asks Curator for the album's series, which opens the one there is or makes it, then
// opens that series' page; what Curator refuses is a toast in its words. A stand-in Curator answers through fetch.
// Synthetic names and ids only.

const mocks = vi.hoisted(() => ({
  auth: { authenticated: true, isSharedLink: false, user: { id: 'owner-id', isAdmin: true }, params: {} },
  goto: vi.fn(),
  danger: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { danger: mocks.danger, success: vi.fn() },
}));

type Asked = { method: string; path: string; body?: unknown };
let asked: Asked[];
/** the smart album behind each album, as the stand-in Curator keeps them */
let smartOf: Record<string, ReturnType<typeof smartAlbum>>;
let planned: () => Response;

const $t = ((key: string) => key) as Parameters<typeof albumSeriesAction>[0];
const album = (id: string) =>
  ({
    id,
    albumName: 'Riverton walks',
    assetCount: 12,
    albumUsers: [{ user: { id: 'owner-id' }, role: AlbumUserRole.Owner }],
  }) as unknown as AlbumResponseDto;

beforeEach(() => {
  forgetSmartAlbums();
  resetLibraryContext();
  asked = [];
  smartOf = { 'album-riverton': smartAlbum() };
  mocks.auth.user = { id: 'owner-id', isAdmin: true };
  mocks.goto.mockResolvedValue(undefined);
  planned = () => Response.json({ series: seriesCard({ id: 12 }), existing: true, job: null });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    asked.push(request);
    const byAlbum = /^\/api\/smart-albums\/by-album\/(.+)$/.exec(url.pathname);
    if (byAlbum) {
      return Promise.resolve(Response.json(smartOf[byAlbum[1]] ?? null));
    }
    if (url.pathname === '/api/series' && request.method === 'POST') {
      return Promise.resolve(planned());
    }
    return Promise.resolve(Response.json({ detail: 'Not Found' }, { status: 404 }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLibraryContext();
});

const lookups = () => asked.filter(({ path }) => path.startsWith('/api/smart-albums/by-album/'));
const offered = (id = 'album-riverton') => albumSeriesAction($t, album(id)).$if?.() ?? true;

describe('A memory a day from this album, in the album’s menu', () => {
  it('is one of the album’s Actions, named as the menu shows it', () => {
    const { MemoryADay } = getAlbumActions($t, album('album-riverton'));
    expect(MemoryADay.title).toBe('memory_series_from_album');
    expect(MemoryADay.icon).toBeTruthy();
  });

  it('is offered for a smart album once Curator has said it is one, asking once', async () => {
    expect(offered()).toBe(false);
    await waitFor(() => expect(offered()).toBe(true));
    expect(lookups()).toEqual([{ method: 'GET', path: '/api/smart-albums/by-album/album-riverton', body: undefined }]);
  });

  it('is not offered for an ordinary album', async () => {
    expect(offered('album-lake')).toBe(false);
    await waitFor(() => expect(lookups()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(offered('album-lake')).toBe(false);
    expect(lookups()).toHaveLength(1);
  });

  it('is not offered, and asks nothing, for a family account', async () => {
    mocks.auth.user = { id: 'family-id', isAdmin: false };
    expect(offered()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).toEqual([]);
  });

  it.each([
    ['memories', 'From the beginning'],
    ['smart', 'smart albums'],
  ] as const)('asks nothing where this library’s Curator does not offer %s (%s)', async (feature, _) => {
    await loadLibraryContext(serving(secondWithout(feature)));
    expect(offered()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lookups()).toEqual([]);
  });

  it('is not offered once the album stops updating', async () => {
    offered();
    await waitFor(() => expect(offered()).toBe(true));
    smartAlbumStopped('album-riverton');
    expect(offered()).toBe(false);
  });

  it('opens the album’s series, as Curator answers with it, on its own page', async () => {
    const action = albumSeriesAction($t, album('album-riverton'));
    await waitFor(() => expect(action.$if?.()).toBe(true));
    action.onAction({ action } as never);
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning/12'));
    expect(asked.filter(({ method }) => method === 'POST')).toEqual([
      { method: 'POST', path: '/api/series', body: { smart_album_id: 4 } },
    ]);
  });

  it('says what Curator refuses, in its words', async () => {
    planned = () => Response.json({ detail: 'No smart album under that id' }, { status: 404 });
    const action = albumSeriesAction($t, album('album-riverton'));
    await waitFor(() => expect(action.$if?.()).toBe(true));
    action.onAction({ action } as never);
    await waitFor(() => expect(mocks.danger).toHaveBeenCalledExactlyOnceWith('No smart album under that id'));
    expect(mocks.goto).not.toHaveBeenCalled();
  });
});

describe('A memory a day from this album, in the smart album’s note', () => {
  it('makes the album’s series and opens it', async () => {
    planned = () => Response.json({ series: seriesCard({ id: 13 }), existing: false, job: 31 }, { status: 201 });
    render(SmartAlbumBadge, { albumId: 'album-riverton' });
    await fireEvent.click(await screen.findByRole('button', { name: 'memory_series_from_album' }));
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning/13'));
    expect(asked.filter(({ method }) => method === 'POST')).toEqual([
      { method: 'POST', path: '/api/series', body: { smart_album_id: 4 } },
    ]);
  });

  it('is not there for a family account', async () => {
    mocks.auth.user = { id: 'family-id', isAdmin: false };
    render(SmartAlbumBadge, { albumId: 'album-riverton' });
    expect(await screen.findByRole('button', { name: 'smart_album_stop' })).toBeInTheDocument();
    expect(screen.queryByTestId('smart-album-series')).not.toBeInTheDocument();
  });

  it('is not there where this library’s Curator does not offer what it adds to memories', async () => {
    await loadLibraryContext(serving(secondWithout('memories')));
    render(SmartAlbumBadge, { albumId: 'album-riverton' });
    expect(await screen.findByRole('button', { name: 'smart_album_stop' })).toBeInTheDocument();
    expect(screen.queryByTestId('smart-album-series')).not.toBeInTheDocument();
  });
});
