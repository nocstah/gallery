import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import MovePage from './MovePage.svelte';
import { moveManager } from './move-manager.svelte';
import { MOVER_ORIGIN } from './mover';

// Local Omarchy layer: the move page in the destination library (gallery/moves, D1 to D8): waiting for the hand-off,
// the summary and the confirmation with this library's key, then the move's progress and how it ended. Nothing at all
// where the page conditions fail. A fake receiver answers through fetch. Synthetic libraries, ids and keys only.

const mocks = vi.hoisted(() => ({
  page: { url: new URL('about:blank') },
  auth: { authenticated: true, isSharedLink: false, user: { id: 'owner-id', isAdmin: true } },
  goto: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getApiKeys: vi.fn(),
  getPerson: vi.fn(),
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto, invalidateAll: vi.fn() }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({ assetMultiSelectManager: { clear: vi.fn() } }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  createApiKey: mocks.createApiKey,
  deleteApiKey: mocks.deleteApiKey,
  getApiKeys: mocks.getApiKeys,
  getPerson: mocks.getPerson,
}));

const MOVE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = { id: '6a3c3a9e-1f6b-4f53-9b2e-6f0f7f0c1d11', secret: 'SyntheticSecretAbcdefghij0123456789' };
const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';

const plan = { items: 10, groups: 9, bytes: 9_000_000, new: 6, present: 2, held: 2, gone: 0, remaining: 0 };
const status = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  move: MOVE,
  source: 'second',
  destination: 'main',
  person: null,
  state: 'ready',
  phase: null,
  needs: [],
  refusal: null,
  plan,
  holds: [
    { reason: 'deleted-in-main', items: 1, forceable: true },
    { reason: 'tombstone', items: 1, forceable: false },
  ],
  forced: [],
  progress: { moved: 0, present: 0, copied: 0, bothLibraries: 0, bytes: 0 },
  space: { needed: 20_000_000, free: 2_000_000_000 },
  trashDays: 30,
  key: null,
  unfinished: [],
  faces: null,
  createdAt: '2026-10-29T20:15:03Z',
  endedAt: null,
  ...overrides,
});

type Route = { method: string; path: string; body?: Record<string, unknown> };
let routes: (request: Route) => Response;
let requests: Route[];

const receiver = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(request);
    return Promise.resolve(routes(request));
  });

const serves = (move: Record<string, unknown> | undefined) => (request: Route) => {
  if (request.method === 'POST') {
    return Response.json({ v: 1 }, { status: 202 });
  }
  if (request.path === '/v1/moves') {
    return Response.json({ v: 1, moves: move ? [move] : [] });
  }
  return move ? Response.json(move) : Response.json({ error: 'unknown' }, { status: 404 });
};

const load = (features: Record<string, boolean> = {}) =>
  loadLibraryContext(serving(libraryContextFile(mainLibrary, [mainLibrary, secondLibrary], features)));

const at = (address: string) => (mocks.page.url = new URL(address));
const showMove = () => at(`${mainLibrary.url}/moves?move=${MOVE}&from=second`);

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await load();
  moveManager.reset();
  requests = [];
  routes = serves(status());
  receiver();
  showMove();
  mocks.auth.user = { id: 'owner-id', isAdmin: true };
  mocks.auth.isSharedLink = false;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(desktop);
  mocks.getApiKeys.mockResolvedValue([]);
  mocks.deleteApiKey.mockResolvedValue(undefined);
  mocks.createApiKey.mockResolvedValue({ id: KEY.id, secret: KEY.secret });
  mocks.getPerson.mockImplementation(({ id }: { id: string }) =>
    Promise.resolve({ id, name: id === 'named' ? 'Person A' : '', updatedAt: '' }),
  );
});

afterEach(async () => {
  moveManager.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetLibraryContext();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

const asked = () => requests.filter(({ path }) => path.startsWith('/v1/'));

describe('MovePage where the page conditions fail', () => {
  it.each([
    ['another address', () => at(`http://127.0.0.1:2283/moves?move=${MOVE}`)],
    ['off this computer', () => at(`http://100.64.0.1:2283/moves?move=${MOVE}`)],
    [
      'a phone',
      () => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 16) Mobile'),
    ],
    ['a family account', () => (mocks.auth.user = { id: 'family', isAdmin: false })],
    ['a vault’s Gallery', () => vi.stubEnv('VITE_KIOKU_EDITION', 'vault')],
  ])('sends %s to Photos and asks the mover nothing', async (_case, arrange) => {
    arrange();
    render(MovePage);
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledWith('/photos', { replaceState: true }));
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getApiKeys).not.toHaveBeenCalled();
    expect(screen.queryByText(/moves_/)).not.toBeInTheDocument();
  });
});

describe('MovePage', () => {
  // the receiver answers a move this library has no side in with 404, as one it does not know at all
  it('waits for the source, then says nothing arrived after a minute: an unknown move, or another library’s', async () => {
    vi.useFakeTimers();
    routes = serves(undefined);
    render(MovePage);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText('moves_waiting_for')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(asked().length).toBeGreaterThan(30);
    expect(asked().every(({ path }) => path === `/v1/moves/${MOVE}`)).toBe(true);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(screen.getByText('moves_nothing_arrived')).toBeInTheDocument();
    const settled = asked().length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(asked()).toHaveLength(settled);
  });

  it('says it reads what the source sends while the mover checks and plans', async () => {
    routes = serves(status({ state: 'planning', plan: null }));
    render(MovePage);
    expect(await screen.findByText('moves_reading')).toBeInTheDocument();
  });

  it('says a refused hand-off in its words', async () => {
    routes = serves(status({ state: 'refused', reason: 'time-zone', endedAt: '2026-10-29T20:16:00Z' }));
    render(MovePage);
    expect(await screen.findByText('moves_error_time_zone')).toBeInTheDocument();
  });

  it('shows the summary, with a tick for the holds the owner may move anyway', async () => {
    render(MovePage);
    expect(await screen.findByText(/moves_summary$/)).toBeInTheDocument();
    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-title', 'moves_page_title');
    expect(screen.getByText('moves_summary_new')).toBeInTheDocument();
    expect(screen.getByText(/moves_summary_present/)).toHaveTextContent('moves_summary_present_kept');
    expect(screen.getByText('moves_summary_held')).toBeInTheDocument();
    expect(screen.getByText('moves_hold_deleted_in_main')).toBeInTheDocument();
    expect(screen.getByText('moves_hold_tombstone')).toBeInTheDocument();
    expect(screen.getByTestId('move-force-deleted-in-main')).not.toBeChecked();
    expect(screen.queryByTestId('move-force-tombstone')).not.toBeInTheDocument();
    expect(screen.getByText('moves_summary_space')).toBeInTheDocument();
    expect(screen.getByText('moves_summary_trash')).toBeInTheDocument();
    expect(screen.getByTestId('move-busy-note')).toHaveTextContent(
      'moves_busy_after moves_busy_curator moves_quiet_hours',
    );
    expect(screen.queryByTestId('move-source-shares')).not.toBeInTheDocument();
    expect(screen.getByTestId('move-confirm')).toHaveTextContent('moves_confirm');
  });

  it('says when a person’s archived photos come too', async () => {
    routes = serves(status({ person: { id: 'p', name: 'Person A', archived: true } }));
    const { unmount } = render(MovePage);
    expect(await screen.findByTestId('move-archived-note')).toHaveTextContent('moves_summary_archived');
    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-title', 'moves_page_title_person');
    unmount();

    routes = serves(status({ person: { id: 'p', name: 'Person A' } }));
    render(MovePage);
    await screen.findByTestId('move-confirm');
    expect(screen.queryByTestId('move-archived-note')).not.toBeInTheDocument();
  });

  it('leaves Curator out of the busy note where this library has none', async () => {
    resetLibraryContext();
    await load({ curator: false });
    render(MovePage);
    expect(await screen.findByTestId('move-busy-note')).toHaveTextContent('moves_busy_after moves_quiet_hours');
    expect(screen.getByTestId('move-busy-note')).not.toHaveTextContent('moves_busy_curator');
  });

  it('counts where the photos are shared when the source is Main', async () => {
    resetLibraryContext();
    await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary])));
    at(`${secondLibrary.url}/moves?move=${MOVE}&from=main`);
    routes = serves(
      status({
        source: 'main',
        destination: 'second',
        plan: { ...plan, sourceShares: { sharedLinks: 12, spaces: 3, sharedAlbums: 5, memories: 40 } },
      }),
    );
    render(MovePage);
    expect(await screen.findByTestId('move-source-shares')).toHaveTextContent('moves_source_shares');
    // only a move into Main waits out Main's nightly backup
    expect(screen.getByTestId('move-busy-note')).not.toHaveTextContent('moves_quiet_hours');
  });

  it('keeps the quiet hours the mover reports, and none when it reports none', async () => {
    routes = serves(status({ quiet: null }));
    const { unmount } = render(MovePage);
    expect(await screen.findByTestId('move-busy-note')).toHaveTextContent('moves_busy_after moves_busy_curator');
    expect(screen.getByTestId('move-busy-note')).not.toHaveTextContent('moves_quiet_hours');
    unmount();

    routes = serves(status({ quiet: { from: '02:00', to: '04:00' } }));
    render(MovePage);
    expect(await screen.findByTestId('move-busy-note')).toHaveTextContent('moves_quiet_hours');
  });

  it('confirms with this library’s key and the holds ticked, says Checking…, then shows a refusal', async () => {
    render(MovePage);
    await screen.findByTestId('move-confirm');
    await fireEvent.click(screen.getByTestId('move-force-deleted-in-main'));
    routes = serves(status({ state: 'starting' }));
    await fireEvent.click(screen.getByTestId('move-confirm'));
    await waitFor(() => expect(requests.some(({ path }) => path.endsWith('/confirm'))).toBe(true));
    const confirm = requests.find(({ path }) => path.endsWith('/confirm'));
    expect(confirm?.body).toEqual({ v: 1, key: KEY, force: ['deleted-in-main'] });
    expect(mocks.createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyCreateDto: expect.objectContaining({ name: 'Kioku move (temporary)' }) }),
    );
    expect(await screen.findByText('moves_checking')).toBeInTheDocument();
    routes = serves(status({ state: 'ready', refusal: { side: 'destination', code: 'space' } }));
    expect(await screen.findByText('moves_error_space', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTestId('move-confirm')).toHaveTextContent('moves_confirm');
  });

  it('cancels the move with Not now', async () => {
    render(MovePage);
    await screen.findByTestId('move-confirm');
    routes = serves(status({ state: 'cancelled', endedAt: '2026-10-29T20:16:00Z' }));
    await fireEvent.click(screen.getByText('moves_not_now'));
    expect(await screen.findByText('moves_cancelled')).toBeInTheDocument();
    expect(requests.some(({ method, path }) => method === 'POST' && path.endsWith('/cancel'))).toBe(true);
  });

  it('shows the move running, with Cancel', async () => {
    routes = serves(status({ state: 'running', phase: 'reading', progress: { moved: 3, present: 1, bytes: 10 } }));
    render(MovePage);
    expect(await screen.findByText('moves_progress_from')).toBeInTheDocument();
    expect(screen.getByText('moves_phase_reading')).toBeInTheDocument();
    expect(screen.getByText('moves_cancel')).toBeInTheDocument();
  });

  it('gives a fresh key to a paused move that needs this library’s', async () => {
    routes = serves(status({ state: 'paused', reason: 'restarted', needs: ['source', 'destination'] }));
    render(MovePage);
    expect(await screen.findByText('moves_paused')).toBeInTheDocument();
    expect(screen.getByText('moves_needs_key')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('move-continue-key'));
    await waitFor(() => expect(requests.some(({ path }) => path.endsWith('/keys'))).toBe(true));
    expect(requests.find(({ path }) => path.endsWith('/keys'))?.body).toEqual({ v: 1, side: 'destination', key: KEY });
  });

  it('says how it ended, with Recently added and the copies left unfinished here', async () => {
    routes = serves(
      status({
        state: 'done',
        endedAt: '2026-10-29T21:00:00Z',
        progress: { moved: 6, present: 2, bothLibraries: 1 },
        unfinished: ['3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10'],
      }),
    );
    render(MovePage);
    expect(await screen.findByText('moves_done_from')).toBeInTheDocument();
    expect(screen.getByText('moves_done_from_held')).toBeInTheDocument();
    expect(screen.getByText('moves_recently_added')).toHaveAttribute('href', '/recently-added');
    expect(screen.getByTestId('move-unfinished')).toHaveTextContent('moves_unfinished_title');
  });

  it('says an expired move moved nothing', async () => {
    routes = serves(status({ state: 'expired', endedAt: '2026-10-29T21:00:00Z' }));
    render(MovePage);
    expect(await screen.findByText('moves_expired')).toBeInTheDocument();
  });

  it('after a person’s move, asks where the faces went and shows the report', async () => {
    routes = serves(
      status({
        state: 'done',
        endedAt: new Date().toISOString(),
        person: { id: 'p', name: 'Person A' },
        faces: {
          photos: 6,
          waiting: 2,
          unmatched: 1,
          unassigned: 0,
          people: [{ id: 'unnamed', named: false, faces: 3 }],
          proposals: [{ merge: 'unnamed', into: 'named' }],
        },
      }),
    );
    render(MovePage);
    expect(await screen.findByTestId('move-faces')).toBeInTheDocument();
    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-title', 'moves_page_title_person');
    await waitFor(() => expect(requests.some(({ path }) => path.endsWith('/faces'))).toBe(true));
  });

  it('keeps asking while the faces are read but not on anyone yet', async () => {
    routes = serves(
      status({
        state: 'done',
        endedAt: new Date().toISOString(),
        person: { id: 'p', name: 'Person A' },
        faces: { photos: 6, waiting: 0, unmatched: 0, unassigned: 2, people: [], proposals: [] },
      }),
    );
    render(MovePage);
    expect(await screen.findByTestId('move-faces')).toBeInTheDocument();
    await waitFor(() => expect(requests.some(({ path }) => path.endsWith('/faces'))).toBe(true));
  });

  it('asks no more once every face is placed', async () => {
    routes = serves(
      status({
        state: 'done',
        endedAt: new Date().toISOString(),
        person: { id: 'p', name: 'Person A' },
        faces: {
          photos: 6,
          waiting: 0,
          unmatched: 0,
          unassigned: 0,
          people: [{ id: 'named', named: true, faces: 6 }],
          proposals: [],
        },
      }),
    );
    render(MovePage);
    expect(await screen.findByTestId('move-faces')).toBeInTheDocument();
    expect(requests.some(({ path }) => path.endsWith('/faces'))).toBe(false);
  });

  it('lists the moves that involve this library without ?move=', async () => {
    at(`${mainLibrary.url}/moves`);
    routes = serves(status({ state: 'done', endedAt: '2026-10-29T21:00:00Z', progress: { moved: 8 } }));
    render(MovePage);
    expect(await screen.findByRole('link', { name: /moves_done_from/ })).toHaveAttribute('href', `/moves?move=${MOVE}`);
    expect(screen.getByTestId('move-list')).toHaveTextContent('moves_done_from');
    expect(requests.map(({ path }) => path)).toEqual(['/v1/moves']);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(`${MOVER_ORIGIN}/v1/moves`);
  });
});
