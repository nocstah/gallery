import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import MoveHeldModal from './MoveHeldModal.svelte';
import MoveProgress from './MoveProgress.svelte';
import { ACTIVE_VISIBLE_MS, moveManager } from './move-manager.svelte';

// Local Omarchy layer: the move's progress panel on every page (gallery/moves, S4 to S7). It mounts, polls and cleans
// up leftover keys only where the page conditions hold, shows how far the move has got, the photos that stayed once it
// ended, and reloads the page when a move out of this library ends. A fake receiver answers through fetch.

const mocks = vi.hoisted(() => ({
  page: { url: new URL('about:blank') },
  auth: { authenticated: true, isSharedLink: false, user: { id: 'owner-id', isAdmin: true } },
  invalidateAll: vi.fn(),
  clear: vi.fn(),
  show: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getApiKeys: vi.fn(),
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll, goto: vi.fn() }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({ assetMultiSelectManager: { clear: mocks.clear } }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show },
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  createApiKey: mocks.createApiKey,
  deleteApiKey: mocks.deleteApiKey,
  getApiKeys: mocks.getApiKeys,
}));

const MOVE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = { id: '6a3c3a9e-1f6b-4f53-9b2e-6f0f7f0c1d11', secret: 'SyntheticSecretAbcdefghij0123456789' };
const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';

const status = (state: string, overrides: Record<string, unknown> = {}) => ({
  move: MOVE,
  source: 'second',
  destination: 'main',
  state,
  phase: 'copying',
  plan: { items: 10, bytes: 1000, new: 8, present: 2 },
  progress: { moved: 3, present: 1, bytes: 500 },
  ...overrides,
});

let moves: Record<string, unknown>[];
let posts: { path: string; body: Record<string, unknown> }[];

const receiver = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (init?.method === 'POST') {
      posts.push({ path: url.pathname, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return Promise.resolve(Response.json({ v: 1 }, { status: 202 }));
    }
    return Promise.resolve(Response.json({ v: 1, moves }));
  });

const useAgent = (agent: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary])));
  moveManager.reset();
  localStorage.clear();
  moves = [status('running')];
  posts = [];
  receiver();
  vi.spyOn(globalThis, 'open').mockReturnValue(null);
  mocks.page.url = new URL('/photos', secondLibrary.url);
  mocks.auth.user = { id: 'owner-id', isAdmin: true };
  mocks.auth.isSharedLink = false;
  mocks.getApiKeys.mockResolvedValue([]);
  mocks.deleteApiKey.mockResolvedValue(undefined);
  mocks.createApiKey.mockResolvedValue({ id: KEY.id, secret: KEY.secret });
  useAgent(desktop);
});

afterEach(() => {
  moveManager.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetLibraryContext();
});

describe('MoveProgress where the page conditions fail', () => {
  it.each([
    ['the library’s address not its registered one', () => (mocks.page.url = new URL('http://127.0.0.1:2286/photos'))],
    ['a host off this computer', () => (mocks.page.url = new URL('http://100.64.0.1:2286/photos'))],
    ['a phone', () => useAgent('Mozilla/5.0 (Linux; Android 16) Mobile')],
    ['a family account', () => (mocks.auth.user = { id: 'family', isAdmin: false })],
    ['a vault’s Gallery', () => vi.stubEnv('VITE_KIOKU_EDITION', 'vault')],
  ])('mounts nothing and asks nothing for %s', async (_case, arrange) => {
    arrange();
    render(MoveProgress);
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByTestId('move-progress')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getApiKeys).not.toHaveBeenCalled();
  });
});

describe('MoveProgress', () => {
  it('shows the move under way, what it is doing and Cancel, and cleans up leftovers once', async () => {
    render(MoveProgress);
    expect(await screen.findByText('moves_progress')).toBeInTheDocument();
    expect(screen.getByText('moves_phase_copying')).toBeInTheDocument();
    expect(screen.getByText('moves_cancel')).toBeInTheDocument();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('http://127.0.0.1:2297/v1/moves');
    await waitFor(() => expect(mocks.getApiKeys).toHaveBeenCalledTimes(1));
    await fireEvent.click(screen.getByText('moves_cancel'));
    await waitFor(() => expect(posts.map(({ path }) => path)).toEqual([`/v1/moves/${MOVE}/cancel`]));
  });

  it('asks again every 2 s while the move runs', async () => {
    vi.useFakeTimers();
    render(MoveProgress);
    await vi.advanceTimersByTimeAsync(0);
    const first = vi.mocked(fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(ACTIVE_VISIBLE_MS);
    expect(vi.mocked(fetch).mock.calls.length).toBe(first + 1);
  });

  it('steps aside on the move page, which asks the mover for its own move', async () => {
    mocks.page.url = new URL(`/moves?move=${MOVE}`, secondLibrary.url);
    render(MoveProgress);
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByTestId('move-progress')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('when the move ends: how it went, the ones that stay, and the page reloaded', async () => {
    vi.useFakeTimers();
    render(MoveProgress);
    await vi.advanceTimersByTimeAsync(0);
    moves = [status('done', { progress: { moved: 6, present: 1 }, endedAt: new Date().toISOString() })];
    await vi.advanceTimersByTimeAsync(ACTIVE_VISIBLE_MS);
    vi.useRealTimers();
    expect(await screen.findByText('moves_done')).toBeInTheDocument();
    expect(screen.getByText('moves_done_held')).toBeInTheDocument();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByText('moves_show_held'));
    expect(mocks.show).toHaveBeenCalledWith(MoveHeldModal, { move: expect.objectContaining({ move: MOVE }) });
    await fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByTestId('move-progress')).not.toBeInTheDocument();
  });

  it('continues a paused move: the source’s fresh key, and the destination’s move page in the same click', async () => {
    moves = [status('paused', { reason: 'restarted', needs: ['source', 'destination'] })];
    render(MoveProgress);
    expect(await screen.findByText('moves_paused')).toBeInTheDocument();
    await fireEvent.click(screen.getByText('moves_continue'));
    expect(open).toHaveBeenCalledWith(`${mainLibrary.url}/moves?move=${MOVE}&from=second`, '_blank', 'noopener');
    await waitFor(() => expect(posts.map(({ path }) => path)).toEqual([`/v1/moves/${MOVE}/keys`]));
    expect(posts[0].body).toEqual({ v: 1, side: 'source', key: KEY });
  });

  it('asks the owner to confirm in the destination while the move waits there', async () => {
    moves = [status('ready')];
    render(MoveProgress);
    expect(await screen.findByText('moves_confirm_there')).toBeInTheDocument();
    expect(screen.getByText('moves_open')).toHaveAttribute('href', `${mainLibrary.url}/moves?move=${MOVE}&from=second`);
  });
});
