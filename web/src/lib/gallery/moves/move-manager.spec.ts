import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import { movePageUrl } from './move-gates';
import { MOVE_KEY_NAME, SOURCE_PERMISSIONS } from './move-keys';
import { ACTIVE_HIDDEN_MS, ACTIVE_VISIBLE_MS, beginMove, moveManager } from './move-manager.svelte';
import { MOVE_ID } from './mover';

// Local Omarchy layer: the moves that involve this library (gallery/moves): the polling and its cadence, the leftover
// keys cleaned up on the first answer and never without one, the page reloading when a move out of it ends, and the
// source's hand-off. A fake receiver answers through fetch. Synthetic libraries, ids and keys only.

const mocks = vi.hoisted(() => ({
  invalidateAll: vi.fn(),
  clear: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getApiKeys: vi.fn(),
}));
vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll, goto: vi.fn() }));
vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({ assetMultiSelectManager: { clear: mocks.clear } }));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  createApiKey: mocks.createApiKey,
  deleteApiKey: mocks.deleteApiKey,
  getApiKeys: mocks.getApiKeys,
}));

const MOVE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = { id: '6a3c3a9e-1f6b-4f53-9b2e-6f0f7f0c1d11', secret: 'SyntheticSecretAbcdefghij0123456789' };

const status = (state: string, overrides: Record<string, unknown> = {}) => ({
  move: MOVE,
  source: 'second',
  destination: 'main',
  state,
  plan: { items: 3, new: 3 },
  progress: {},
  key: 'held-key',
  ...overrides,
});

type Route = { method: string; path: string; body?: Record<string, unknown> };
let routes: (request: Route) => Response | Promise<Response>;
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

const visibility = (state: 'visible' | 'hidden') => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary])));
  moveManager.reset();
  requests = [];
  routes = () => Response.json({ v: 1, moves: [] });
  mocks.getApiKeys.mockResolvedValue([]);
  mocks.deleteApiKey.mockResolvedValue(undefined);
  mocks.createApiKey.mockResolvedValue({ id: KEY.id, secret: KEY.secret, name: MOVE_KEY_NAME });
  localStorage.clear();
});

afterEach(() => {
  moveManager.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetLibraryContext();
});

describe('moveManager polling', () => {
  it('asks every 2 s while a move runs and the tab is visible, every 30 s while hidden', async () => {
    vi.useFakeTimers();
    receiver();
    routes = () => Response.json({ v: 1, moves: [status('running')] });
    moveManager.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(ACTIVE_VISIBLE_MS);
    expect(requests).toHaveLength(2);
    visibility('hidden');
    await vi.advanceTimersByTimeAsync(ACTIVE_VISIBLE_MS * 5);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(ACTIVE_HIDDEN_MS);
    expect(requests).toHaveLength(3);
    // shown again: asks at once
    visibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(4);
    moveManager.stop();
    await vi.advanceTimersByTimeAsync(ACTIVE_HIDDEN_MS * 2);
    expect(requests).toHaveLength(4);
  });

  it('stops asking once the moves have ended', async () => {
    vi.useFakeTimers();
    receiver();
    routes = () => Response.json({ v: 1, moves: [status('done')] });
    moveManager.start();
    await vi.advanceTimersByTimeAsync(ACTIVE_HIDDEN_MS * 3);
    expect(requests).toHaveLength(1);
    expect(moveManager.reachable).toBe(true);
    expect(moveManager.active).toBeUndefined();
  });

  it('counts one poll for every panel that wants it', async () => {
    vi.useFakeTimers();
    receiver();
    moveManager.start();
    moveManager.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
  });
});

describe('moveManager leftovers', () => {
  it('deletes the leftover keys on the first answer, never the one the mover holds', async () => {
    receiver();
    routes = () => Response.json({ v: 1, moves: [status('running', { key: 'held-key' })] });
    const old = new Date(Date.now() - 3_600_000).toISOString();
    mocks.getApiKeys.mockResolvedValue([
      { id: 'held-key', name: MOVE_KEY_NAME, createdAt: old },
      { id: 'leftover', name: MOVE_KEY_NAME, createdAt: old },
    ]);
    await moveManager.refresh();
    await vi.waitFor(() => expect(mocks.deleteApiKey).toHaveBeenCalledWith({ id: 'leftover' }));
    expect(mocks.deleteApiKey).toHaveBeenCalledTimes(1);
    await moveManager.refresh();
    expect(mocks.getApiKeys).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing while the mover does not answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await moveManager.refresh();
    expect(moveManager.reachable).toBe(false);
    expect(mocks.getApiKeys).not.toHaveBeenCalled();
    expect(mocks.deleteApiKey).not.toHaveBeenCalled();
  });
});

describe('moveManager ends', () => {
  it('clears the selection and reloads the page once a move out of this library ends', async () => {
    receiver();
    routes = () => Response.json({ v: 1, moves: [status('running')] });
    await moveManager.refresh();
    expect(mocks.invalidateAll).not.toHaveBeenCalled();
    routes = () => Response.json({ v: 1, moves: [status('done')] });
    await moveManager.refresh();
    await moveManager.refresh();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
    expect(moveManager.shown.map(({ state }) => state)).toEqual(['done']);
    moveManager.dismiss(MOVE);
    expect(moveManager.shown).toEqual([]);
  });

  it('reloads nothing for a move into this library, or one that ended before the page saw it run', async () => {
    receiver();
    routes = () => Response.json({ v: 1, moves: [status('done', { endedAt: '2020-01-01T00:00:00Z' })] });
    await moveManager.refresh();
    routes = () => Response.json({ v: 1, moves: [status('running', { source: 'main', destination: 'second' })] });
    await moveManager.refresh();
    routes = () => Response.json({ v: 1, moves: [status('done', { source: 'main', destination: 'second' })] });
    await moveManager.refresh();
    expect(mocks.invalidateAll).not.toHaveBeenCalled();
  });
});

describe('the hand-off', () => {
  it('opens the destination’s move page inside the click, with a new move id', () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const move = beginMove(mainLibrary);
    expect(move).toMatch(MOVE_ID);
    expect(open).toHaveBeenCalledWith(`${mainLibrary.url}/moves?move=${move}&from=second`, '_blank', 'noopener');
    expect(movePageUrl(mainLibrary, MOVE, 'second')).toBe(`${mainLibrary.url}/moves?move=${MOVE}&from=second`);
  });

  it('lists the moves, deletes the leftovers, makes the source key and posts the selection with the person', async () => {
    receiver();
    routes = (request) =>
      request.method === 'POST'
        ? Response.json({ v: 1, move: MOVE, state: 'checking' }, { status: 202 })
        : Response.json({ v: 1, moves: [] });
    const outcome = await moveManager.handOff(
      MOVE,
      { kind: 'selection', ids: ['a', 'b'], notOwned: 1, person: { id: 'p', name: 'Person A' } },
      mainLibrary,
    );
    expect(outcome).toEqual({ kind: 'accepted' });
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/v1/moves' });
    expect(mocks.getApiKeys).toHaveBeenCalled();
    expect(mocks.createApiKey).toHaveBeenCalledWith({
      apiKeyCreateDto: { name: MOVE_KEY_NAME, permissions: [...SOURCE_PERMISSIONS] },
    });
    expect(requests[1]).toEqual({
      method: 'POST',
      path: '/v1/moves',
      body: {
        v: 1,
        move: MOVE,
        source: 'second',
        destination: 'main',
        assets: ['a', 'b'],
        person: { id: 'p', name: 'Person A' },
        key: KEY,
      },
    });
    expect(mocks.deleteApiKey).not.toHaveBeenCalled();
  });

  it('sends a person alone without ids, and a person without a name without one', async () => {
    receiver();
    routes = (request) =>
      request.method === 'POST' ? Response.json({ v: 1 }, { status: 202 }) : Response.json({ v: 1, moves: [] });
    await moveManager.handOff(MOVE, { kind: 'person', person: { id: 'p', name: null } }, mainLibrary);
    const posted = requests.find(({ method }) => method === 'POST');
    expect(posted?.body).toEqual({
      v: 1,
      move: MOVE,
      source: 'second',
      destination: 'main',
      person: { id: 'p' },
      key: KEY,
    });
  });

  it('brings a person’s archived photos only when asked, and never with a selection', async () => {
    receiver();
    routes = (request) =>
      request.method === 'POST' ? Response.json({ v: 1 }, { status: 202 }) : Response.json({ v: 1, moves: [] });
    const person = { id: 'p', name: 'Person A' };
    await moveManager.handOff(MOVE, { kind: 'person', person, archived: true }, mainLibrary);
    await moveManager.handOff(MOVE, { kind: 'person', person, archived: false }, mainLibrary);
    await moveManager.handOff(MOVE, { kind: 'selection', ids: ['a'], notOwned: 0, person }, mainLibrary);
    const posted = requests.filter(({ method }) => method === 'POST').map(({ body }) => body?.person);
    expect(posted).toEqual([
      { id: 'p', name: 'Person A', archived: true },
      { id: 'p', name: 'Person A' },
      { id: 'p', name: 'Person A' },
    ]);
  });

  it('makes no key while the mover does not answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const outcome = await moveManager.handOff(MOVE, { kind: 'selection', ids: ['a'], notOwned: 0 }, mainLibrary);
    expect(outcome).toEqual({ kind: 'error', code: 'unreachable' });
    expect(mocks.createApiKey).not.toHaveBeenCalled();
    expect(mocks.getApiKeys).not.toHaveBeenCalled();
  });

  it('says busy and deletes the key when another move got there first', async () => {
    receiver();
    routes = (request) =>
      request.method === 'POST'
        ? Response.json({ error: 'busy' }, { status: 409 })
        : Response.json({ v: 1, moves: [] });
    const outcome = await moveManager.handOff(MOVE, { kind: 'selection', ids: ['a'], notOwned: 0 }, mainLibrary);
    expect(outcome).toEqual({ kind: 'busy' });
    expect(mocks.deleteApiKey).toHaveBeenCalledWith({ id: KEY.id });
  });

  it('confirms with the destination key, and gives a fresh key for a paused move', async () => {
    receiver();
    routes = (request) =>
      request.method === 'POST' ? Response.json({ v: 1 }, { status: 202 }) : Response.json({ v: 1, moves: [] });
    expect(await moveManager.confirm(MOVE, ['deleted-in-main'])).toEqual({ kind: 'accepted' });
    expect(requests.find(({ path }) => path.endsWith('/confirm'))?.body).toEqual({
      v: 1,
      key: KEY,
      force: ['deleted-in-main'],
    });
    expect(await moveManager.giveKey(MOVE, 'source')).toEqual({ kind: 'accepted' });
    expect(requests.find(({ path }) => path.endsWith('/keys'))?.body).toEqual({ v: 1, side: 'source', key: KEY });
  });
});
