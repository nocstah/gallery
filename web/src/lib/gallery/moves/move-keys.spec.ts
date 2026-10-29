import { Permission } from '@immich/sdk';
import {
  deleteLeftoverMoveKeys,
  DESTINATION_PERMISSIONS,
  handOverMoveKey,
  keysInUse,
  LEFTOVER_AGE_MS,
  MOVE_KEY_NAME,
  SOURCE_PERMISSIONS,
} from './move-keys';
import { MoverError, startMove } from './mover';

// Local Omarchy layer: the keys of Move to <library> (gallery/moves). Exact permission lists, the secret only in the
// hand-off's body, the page's rule for deleting a key it handed over, and the leftover clean-up. Synthetic keys only.

const sdk = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getApiKeys: vi.fn(),
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  ...sdk,
}));

const MOVE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY_ID = '6a3c3a9e-1f6b-4f53-9b2e-6f0f7f0c1d11';
const SECRET = 'SyntheticSecretAbcdefghij0123456789';

const created = { id: KEY_ID, name: MOVE_KEY_NAME, secret: SECRET, permissions: [], createdAt: '', updatedAt: '' };
const handOff = () => (key: { id: string; secret: string }) =>
  startMove({ move: MOVE, source: 'second', destination: 'main', assets: ['a'], key });

beforeEach(() => {
  vi.clearAllMocks();
  sdk.createApiKey.mockResolvedValue(created);
  sdk.deleteApiKey.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the move keys', () => {
  it('are named so, and hold exactly each side’s permissions', () => {
    expect(MOVE_KEY_NAME).toBe('Kioku move (temporary)');
    expect([...SOURCE_PERMISSIONS].sort()).toEqual(
      ['asset.read', 'asset.download', 'asset.edit.get', 'asset.delete', 'user.read', 'apiKey.delete'].sort(),
    );
    expect([...DESTINATION_PERMISSIONS].sort()).toEqual(
      [
        'asset.upload',
        'asset.read',
        'asset.update',
        'asset.download',
        'asset.edit.get',
        'asset.edit.create',
        'stack.create',
        'queue.read',
        'user.read',
        'apiKey.delete',
      ].sort(),
    );
  });

  it('can never queue a job, read a stack, or touch people and faces', () => {
    for (const permission of [...SOURCE_PERMISSIONS, ...DESTINATION_PERMISSIONS]) {
      expect(permission).not.toBe(Permission.JobCreate);
      expect(permission).not.toBe(Permission.All);
      expect(permission).not.toBe(Permission.StackRead);
      expect(permission).not.toMatch(/^(person|face)\./);
    }
  });

  it('are made under the owner’s session with that name and list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ v: 1 }, { status: 202 }));
    await handOverMoveKey('destination', MOVE, handOff());
    expect(sdk.createApiKey).toHaveBeenCalledWith({
      apiKeyCreateDto: { name: MOVE_KEY_NAME, permissions: [...DESTINATION_PERMISSIONS] },
    });
  });
});

describe('handOverMoveKey', () => {
  it('puts the secret in the request body and nowhere else: no address, header or log', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ v: 1 }, { status: 202 }));
    await handOverMoveKey('source', MOVE, handOff());
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).not.toContain(SECRET);
    expect(JSON.stringify(init?.headers ?? {})).not.toContain(SECRET);
    expect(JSON.parse(String(init?.body)).key).toEqual({ id: KEY_ID, secret: SECRET });
    for (const spy of consoles) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    }
  });

  it('leaves the key with the mover after its 202', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ v: 1 }, { status: 202 }));
    await handOverMoveKey('source', MOVE, handOff());
    expect(sdk.deleteApiKey).not.toHaveBeenCalled();
  });

  it.each([
    [409, { error: 'busy' }],
    [400, { error: 'invalid' }],
    [403, undefined],
    [200, { v: 1 }],
  ])('deletes the key at once on any other answer: %i', async (code, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      body === undefined ? new Response(null, { status: code }) : Response.json(body, { status: code }),
    );
    await expect(handOverMoveKey('source', MOVE, handOff())).rejects.toBeInstanceOf(MoverError);
    expect(sdk.deleteApiKey).toHaveBeenCalledWith({ id: KEY_ID });
  });

  it('on no answer, asks for the move, and deletes the key when the mover does not know it', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ error: 'unknown' }, { status: 404 }));
    await expect(handOverMoveKey('source', MOVE, handOff())).rejects.toMatchObject({ code: 'unreachable' });
    expect(String(fetch.mock.calls[1][0])).toBe(`http://127.0.0.1:2297/v1/moves/${MOVE}`);
    expect(sdk.deleteApiKey).toHaveBeenCalledWith({ id: KEY_ID });
  });

  it('on no answer, deletes the key when the mover does not answer the question either', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(handOverMoveKey('source', MOVE, handOff())).rejects.toMatchObject({ code: 'unreachable' });
    expect(sdk.deleteApiKey).toHaveBeenCalledWith({ id: KEY_ID });
  });

  it('on no answer, keeps the key when the mover reports it holds that very key', async () => {
    const known = { move: MOVE, source: 'second', destination: 'main', state: 'checking', key: KEY_ID };
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(known));
    await expect(handOverMoveKey('source', MOVE, handOff())).rejects.toMatchObject({ code: 'unreachable' });
    expect(sdk.deleteApiKey).not.toHaveBeenCalled();
  });

  it('on no answer, deletes the key when the mover holds another key for the move', async () => {
    const other = { move: MOVE, source: 'second', destination: 'main', state: 'paused', key: 'another-key' };
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(other));
    await expect(handOverMoveKey('source', MOVE, handOff())).rejects.toMatchObject({ code: 'unreachable' });
    expect(sdk.deleteApiKey).toHaveBeenCalledWith({ id: KEY_ID });
  });
});

describe('deleteLeftoverMoveKeys', () => {
  const now = Date.parse('2026-10-29T20:00:00Z');
  const key = (id: string, name: string, minutesOld: number) => ({
    id,
    name,
    permissions: [],
    createdAt: new Date(now - minutesOld * 60_000).toISOString(),
    updatedAt: '',
  });

  it('deletes move keys older than 10 minutes that the mover does not hold, and nothing else', async () => {
    sdk.getApiKeys.mockResolvedValue([
      key('old', MOVE_KEY_NAME, 30),
      key('in-use', MOVE_KEY_NAME, 30),
      key('young', MOVE_KEY_NAME, 9),
      key('curator', 'curator', 300),
      key('similar', `${MOVE_KEY_NAME} 2`, 300),
    ]);
    expect(await deleteLeftoverMoveKeys(['in-use'], now)).toBe(1);
    expect(sdk.deleteApiKey).toHaveBeenCalledTimes(1);
    expect(sdk.deleteApiKey).toHaveBeenCalledWith({ id: 'old' });
    expect(LEFTOVER_AGE_MS).toBe(600_000);
  });

  it('reads the keys in use from the mover’s list', () => {
    expect(keysInUse([{ key: 'a' }, { key: null }, { key: 'b' }] as never)).toEqual(['a', 'b']);
  });
});
