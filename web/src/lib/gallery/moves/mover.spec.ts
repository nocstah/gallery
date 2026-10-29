import {
  askFaces,
  cancelMove,
  confirmMove,
  giveKey,
  isEnded,
  listMoves,
  MOVE_ID,
  MOVER_ORIGIN,
  MoverError,
  moveStatus,
  newMoveId,
  parseStatus,
  POST_TIMEOUT_MS,
  READ_TIMEOUT_MS,
  startMove,
} from './mover';

// Local Omarchy layer: the pages' client for the library mover's receiver on 127.0.0.1:2297 (gallery/moves). No
// credentials, CORS, JSON with "v": 1, a timeout on every call, and each answer of the receiver mapped to its code.
// Synthetic ids and secrets only.

const MOVE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = { id: '6a3c3a9e-1f6b-4f53-9b2e-6f0f7f0c1d11', secret: 'SyntheticSecret0123456789abcdef' };

const status = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  move: MOVE,
  source: 'second',
  destination: 'main',
  person: null,
  state: 'running',
  phase: 'copying',
  reason: null,
  needs: [],
  refusal: null,
  plan: { items: 10, groups: 8, bytes: 1000, new: 7, present: 2, held: 1, sourceShares: null },
  holds: [{ reason: 'another-copy', items: 1, forceable: true }],
  forced: [],
  progress: { moved: 3, present: 1, copied: 4, bothLibraries: 0, bytes: 400 },
  space: { needed: 2200, free: 100_000 },
  trashDays: 30,
  key: null,
  createdAt: '2026-10-29T20:15:03Z',
  updatedAt: '2026-10-29T20:21:40Z',
  endedAt: null,
  ...overrides,
});

const fetchSpy = () => vi.spyOn(globalThis, 'fetch');
const answer = (body: unknown, init: ResponseInit = {}) => Promise.resolve(Response.json(body, init));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the mover client', () => {
  it('asks 127.0.0.1:2297 without credentials, in CORS mode, and a GET carries no body or header', async () => {
    const fetch = fetchSpy().mockImplementation(() => answer({ v: 1, moves: [status()] }));
    const moves = await listMoves();
    expect(moves).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${MOVER_ORIGIN}/v1/moves`);
    expect(MOVER_ORIGIN).toBe('http://127.0.0.1:2297');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error' });
    // CORS, fetch's own mode: never no-cors, which would hide the receiver's answer and its origin check
    expect(init?.mode ?? 'cors').toBe('cors');
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
  });

  it('posts JSON with "v": 1 first, the key in the body only', async () => {
    const fetch = fetchSpy().mockImplementation(() => answer({ v: 1, move: MOVE, state: 'checking' }, { status: 202 }));
    await startMove({ move: MOVE, source: 'second', destination: 'main', assets: ['a'], key: KEY });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${MOVER_ORIGIN}/v1/moves`);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(init?.mode ?? 'cors').toBe('cors');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(Object.keys(JSON.parse(String(init?.body)))[0]).toBe('v');
    expect(JSON.parse(String(init?.body))).toEqual({
      v: 1,
      move: MOVE,
      source: 'second',
      destination: 'main',
      assets: ['a'],
      key: KEY,
    });
    expect(String(url)).not.toContain(KEY.secret);
  });

  it('sends each call to its path', async () => {
    const fetch = fetchSpy().mockImplementation(() => answer({ v: 1 }, { status: 202 }));
    await confirmMove(MOVE, KEY, ['another-copy']);
    await giveKey(MOVE, 'source', KEY);
    await cancelMove(MOVE);
    await askFaces(MOVE);
    expect(fetch.mock.calls.map(([url]) => String(url).replace(MOVER_ORIGIN, ''))).toEqual([
      `/v1/moves/${MOVE}/confirm`,
      `/v1/moves/${MOVE}/keys`,
      `/v1/moves/${MOVE}/cancel`,
      `/v1/moves/${MOVE}/faces`,
    ]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ v: 1, key: KEY, force: ['another-copy'] });
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ v: 1, side: 'source', key: KEY });
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ v: 1 });
  });

  it('never puts an id that is not a move id into a path', async () => {
    const fetch = fetchSpy();
    await expect(moveStatus('../health')).rejects.toMatchObject({ code: 'invalid' });
    await expect(cancelMove('0F8FAD5B-D9CB-469F-A165-70867728950E')).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [400, { error: 'invalid' }, 'invalid'],
    [403, undefined, 'forbidden'],
    [404, { error: 'unknown' }, 'unknown'],
    [405, undefined, 'invalid'],
    [409, { error: 'busy' }, 'busy'],
    [409, { error: 'exists' }, 'exists'],
    [409, { error: 'state' }, 'state'],
    [413, undefined, 'invalid'],
    [415, undefined, 'invalid'],
    [500, undefined, 'failed'],
    [503, { error: 'stopping' }, 'stopping'],
  ])('maps %i %j to %s', async (code, body, expected) => {
    fetchSpy().mockImplementation(() =>
      Promise.resolve(
        body === undefined ? new Response(null, { status: code }) : Response.json(body, { status: code }),
      ),
    );
    await expect(startMove({ move: MOVE, source: 'second', destination: 'main', key: KEY })).rejects.toMatchObject({
      code: expected,
      status: code,
    });
  });

  it('takes only a 202 as a post taken', async () => {
    fetchSpy().mockImplementation(() => answer({ v: 1 }, { status: 200 }));
    await expect(cancelMove(MOVE)).rejects.toMatchObject({ code: 'failed', status: 200 });
  });

  it('calls no answer at all unreachable: refused, blocked or nothing listening', async () => {
    fetchSpy().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(listMoves()).rejects.toEqual(new MoverError('unreachable'));
  });

  it('gives up on a read after its timeout, and on a post after its own', async () => {
    vi.useFakeTimers();
    fetchSpy().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    );
    const read = expect(listMoves()).rejects.toMatchObject({ code: 'unreachable' });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await read;
    const posted = expect(cancelMove(MOVE)).rejects.toMatchObject({ code: 'unreachable' });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    let settled = false;
    void posted.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(POST_TIMEOUT_MS - READ_TIMEOUT_MS);
    await posted;
    expect(READ_TIMEOUT_MS).toBeLessThan(POST_TIMEOUT_MS);
    expect(POST_TIMEOUT_MS).toBeLessThan(10_000);
  });

  it('leaves out of a list what is no status', async () => {
    fetchSpy().mockImplementation(() =>
      answer({ v: 1, moves: [status(), { state: 'running' }, status({ state: 'sleeping' }), 'x'] }),
    );
    expect(await listMoves()).toHaveLength(1);
  });
});

describe('parseStatus', () => {
  it('reads a status as the receiver sends it', () => {
    const parsed = parseStatus(
      status({
        person: { id: 'p', name: 'Person A' },
        held: [{ asset: 'a', reason: 'tombstone' }, { asset: 1 }],
        unfinished: ['d1', 2],
        faces: { photos: 4, waiting: 1, people: [{ id: 'x', named: true, faces: 3 }], proposals: [{ name: 'x' }, {}] },
      }),
    );
    expect(parsed).toMatchObject({
      move: MOVE,
      state: 'running',
      person: { id: 'p', name: 'Person A' },
      plan: { items: 10, new: 7, present: 2, held: 1, gone: 0, remaining: 0, sourceShares: null },
      holds: [{ reason: 'another-copy', items: 1, forceable: true }],
      progress: { moved: 3, present: 1, bytes: 400 },
      held: [{ asset: 'a', reason: 'tombstone' }],
      unfinished: ['d1'],
      faces: {
        photos: 4,
        waiting: 1,
        people: [{ id: 'x', named: true, hidden: false, faces: 3 }],
        proposals: [{ name: 'x' }],
      },
    });
  });

  it('refuses what is no status, and keeps no count that is not one', () => {
    expect(parseStatus(null)).toBeUndefined();
    expect(parseStatus(status({ state: 'unknown' }))).toBeUndefined();
    expect(parseStatus(status({ move: 7 }))).toBeUndefined();
    expect(parseStatus(status({ progress: { moved: -4, bytes: 'many' } }))?.progress).toEqual({
      moved: 0,
      present: 0,
      copied: 0,
      bothLibraries: 0,
      bytes: 0,
    });
    expect(parseStatus(status({ person: { id: 'p', name: '' } }))?.person).toEqual({
      id: 'p',
      name: null,
      archived: false,
    });
    expect(parseStatus(status({ person: { id: 'p', name: 'A', archived: true } }))?.person?.archived).toBe(true);
    expect(parseStatus(status({ person: { id: 'p', archived: 'yes' } }))?.person?.archived).toBe(false);
  });

  it('reads the quiet hours when the receiver reports them, and says so when it does not', () => {
    expect(parseStatus(status({ quiet: { from: '01:45', to: '03:30' } }))?.quiet).toEqual({
      from: '01:45',
      to: '03:30',
    });
    expect(parseStatus(status({ quiet: null }))?.quiet).toBeNull();
    expect(parseStatus(status())?.quiet).toBeUndefined();
    for (const quiet of [{ from: '1:45', to: '03:30' }, { from: '01:45', to: '24:00' }, { from: '01:45' }, 'night']) {
      expect(parseStatus(status({ quiet }))?.quiet, JSON.stringify(quiet)).toBeNull();
    }
  });

  it('knows the ended states', () => {
    expect(['done', 'cancelled', 'expired', 'failed', 'refused'].every((state) => isEnded(state as never))).toBe(true);
    expect(['checking', 'planning', 'ready', 'starting', 'running', 'paused'].some((s) => isEnded(s as never))).toBe(
      false,
    );
  });
});

describe('newMoveId', () => {
  it('makes a lower-case version 4 UUID, with crypto.randomUUID or without', () => {
    expect(newMoveId()).toMatch(MOVE_ID);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      for (let index = 0; index < 20; index++) {
        expect(newMoveId()).toMatch(MOVE_ID);
      }
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
