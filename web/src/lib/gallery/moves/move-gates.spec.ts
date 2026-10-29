import { AssetVisibility } from '@immich/sdk';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import {
  cleanupLibrary,
  libraryContextFile,
  mainLibrary,
  secondLibrary,
  serving,
} from '@test-data/factories/library-context-factory';
import { personFactory } from '@test-data/factories/person-factory';
import { canMoveFrom, canMovePerson, movePerson, moverPageAllowed, moveTargets } from './move-gates';

// Local Omarchy layer: where Move to <library> is offered (gallery/moves). The page conditions (not a vault's Gallery,
// another library listed, this library's own registered address on this computer, this desktop's browser, the owner),
// then what a selection or a person can move. Synthetic libraries, people and ids only.

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';
const owner = { id: 'owner-id', isAdmin: true };
const here = new URL('/photos', secondLibrary.url);

const load = (libraries: unknown[] = [mainLibrary, secondLibrary], current = secondLibrary) =>
  loadLibraryContext(serving(libraryContextFile(current, libraries)));

const asset = (id: string, overrides: Partial<{ ownerId: string; isTrashed: boolean }> = {}) => ({
  id,
  ownerId: owner.id,
  isTrashed: false,
  ...overrides,
});

beforeEach(() => {
  resetLibraryContext();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetLibraryContext();
});

describe('moverPageAllowed', () => {
  it('holds on this library’s own address, in this desktop’s browser, for the owner', async () => {
    await load();
    expect(moverPageAllowed(here, desktop, owner)).toBe(true);
    expect(moverPageAllowed(new URL('/people/x?y=1', secondLibrary.url), desktop, owner)).toBe(true);
  });

  it('does not hold without another library, or without a context at all', async () => {
    expect(moverPageAllowed(here, desktop, owner)).toBe(false);
    await load([secondLibrary]);
    expect(moverPageAllowed(here, desktop, owner)).toBe(false);
  });

  it.each([
    // the same library through another of this computer's names: not its registered address
    'http://127.0.0.1:2286/photos',
    'http://localhost:2286/photos',
    // another library's address
    `${mainLibrary.url}/photos`,
    // off this computer: the tailnet, another device on the network
    'http://100.64.0.1:2286/photos',
    'https://photos.example.com/photos',
  ])('does not hold away from this library’s registered address: %s', async (url) => {
    await load();
    expect(moverPageAllowed(new URL(url), desktop, owner)).toBe(false);
  });

  it.each([
    'Mozilla/5.0 (Linux; Android 16) Mobile',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)',
    '',
  ])('does not hold in a browser that is not this desktop’s: %s', async (agent) => {
    await load();
    expect(moverPageAllowed(here, agent, owner)).toBe(false);
  });

  it('does not hold for anyone but the owner', async () => {
    await load();
    expect(moverPageAllowed(here, desktop, { id: 'family', isAdmin: false })).toBe(false);
    expect(moverPageAllowed(here, desktop, undefined)).toBe(false);
  });

  it('does not hold in a vault’s Gallery', async () => {
    await load();
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(moverPageAllowed(here, desktop, owner)).toBe(false);
  });
});

describe('moveTargets', () => {
  it('offers every other library, in the context’s order', async () => {
    await load([mainLibrary, secondLibrary, cleanupLibrary]);
    expect(moveTargets().map(({ id }) => id)).toEqual(['main', 'my-cleanup']);
  });
});

describe('canMoveFrom', () => {
  beforeEach(async () => {
    await load();
  });

  it('takes the owner’s own photos of a selection and counts the others', () => {
    const chosen = [asset('a'), asset('b', { ownerId: 'partner' }), asset('c')];
    expect(canMoveFrom(here, desktop, owner, chosen)).toEqual({ ids: ['a', 'c'], notOwned: 1 });
  });

  it('refuses a selection with a photo in the trash, or none of the owner’s own', () => {
    expect(canMoveFrom(here, desktop, owner, [asset('a'), asset('b', { isTrashed: true })])).toBeUndefined();
    expect(canMoveFrom(here, desktop, owner, [asset('b', { ownerId: 'partner' })])).toBeUndefined();
    expect(canMoveFrom(here, desktop, owner, [])).toBeUndefined();
  });

  it('refuses a selection from the Locked Folder, which the mover’s key cannot read', () => {
    const locked = { ...asset('l'), visibility: AssetVisibility.Locked };
    expect(canMoveFrom(here, desktop, owner, [asset('a'), locked])).toBeUndefined();
    const archived = { ...asset('r'), visibility: AssetVisibility.Archive };
    expect(canMoveFrom(here, desktop, owner, [asset('a'), archived])).toEqual({ ids: ['a', 'r'], notOwned: 0 });
  });

  it('refuses wherever the page conditions do', () => {
    const chosen = [asset('a')];
    expect(canMoveFrom(new URL('http://127.0.0.1:2286/photos'), desktop, owner, chosen)).toBeUndefined();
    expect(canMoveFrom(here, 'Mozilla/5.0 (Linux; Android 16) Mobile', owner, chosen)).toBeUndefined();
    expect(canMoveFrom(here, desktop, { id: owner.id, isAdmin: false }, chosen)).toBeUndefined();
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(canMoveFrom(here, desktop, owner, chosen)).toBeUndefined();
  });

  it('refuses with one library only', async () => {
    resetLibraryContext();
    await load([secondLibrary]);
    expect(canMoveFrom(here, desktop, owner, [asset('a')])).toBeUndefined();
  });
});

describe('canMovePerson', () => {
  const own = personFactory.build({ name: 'Person A', id: '3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10' });

  beforeEach(async () => {
    await load();
  });

  it('offers the owner’s own person', () => {
    expect(canMovePerson(here, desktop, owner, own)).toBe(true);
  });

  it('refuses a grouped person, a Space’s person and no person', () => {
    expect(canMovePerson(here, desktop, owner, { ...own, filterId: `person:${own.id}` })).toBe(false);
    expect(
      canMovePerson(here, desktop, owner, {
        ...own,
        primaryProfile: { id: 'space-person', type: 'space-person' as never, spaceId: 'space' },
      }),
    ).toBe(false);
    expect(canMovePerson(here, desktop, owner, { ...own, spacePersonId: 'space-person' })).toBe(false);
    expect(canMovePerson(here, desktop, owner, undefined)).toBe(false);
  });

  it('refuses in a vault’s Gallery and for anyone but the owner', () => {
    expect(canMovePerson(here, desktop, { id: 'family', isAdmin: false }, own)).toBe(false);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(canMovePerson(here, desktop, owner, own)).toBe(false);
  });
});

describe('movePerson', () => {
  it('names the person as the page shows them, at most 200 characters, none for no name', () => {
    expect(movePerson(personFactory.build({ id: 'p', name: '  Person A ' }))).toEqual({ id: 'p', name: 'Person A' });
    expect(movePerson(personFactory.build({ id: 'p', name: '' }))).toEqual({ id: 'p', name: null });
    const long = movePerson(personFactory.build({ id: 'p', name: '🙂'.repeat(250) }));
    expect([...(long.name ?? '')]).toHaveLength(200);
  });
});
