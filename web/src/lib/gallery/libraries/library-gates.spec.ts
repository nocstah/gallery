import { AssetVisibility } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { canLaunchVaultChooser } from '$lib/gallery/vaults/launcher';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { offeredSpecialAlbums, qrManager, todoManager, villaManager } from '$lib/managers/special-albums.svelte';
import { bookFileUrl, curator, CuratorError, curatorIsMine, filmFileUrl, musicUrl } from '$lib/utils/curator';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';
import { leaveOutOfThisLibrary, notInThisLibrary, pageInThisLibrary } from './library-gates';

// Local Omarchy layer: a library other than Main reaches nothing of Main's. Curator listens on this host's port 2290,
// which from any local address is Main's Curator, so there the client never makes that address; the special albums
// and the Vaults launcher are Main's too. Main, and a Kioku without a library context, keep all of them.

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';

const inSecond = () => loadLibraryContext(serving(libraryContextFile(secondLibrary)));
const inMain = () => loadLibraryContext(serving(libraryContextFile(mainLibrary)));
const at = (path: string) => new URL(path, secondLibrary.url);

const signInOwner = () => {
  authManager.setUser(userAdminFactory.build({ isAdmin: true }));
  authManager.setPreferences(preferencesFactory.build());
};

const thrown = (build: () => unknown) => {
  try {
    build();
  } catch (error) {
    return error;
  }
};

beforeEach(() => {
  resetLibraryContext();
  signInOwner();
});

afterEach(() => {
  vi.restoreAllMocks();
  authManager.reset();
  resetLibraryContext();
});

describe('Curator, in a library without one of its own', () => {
  it("is nobody's, not even the owner's", async () => {
    await inSecond();
    expect(curatorIsMine()).toBe(false);
  });

  it('fails every call before any request, as when Curator is not answering, and never asks port 2290', async () => {
    await inSecond();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(curator.health()).rejects.toMatchObject({ status: 0 });
    await expect(curator.inbox()).rejects.toBeInstanceOf(CuratorError);
    await expect(curator.personStacks('person')).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no address for its files either', async () => {
    await inSecond();

    for (const build of [() => musicUrl('/api/music/a'), () => bookFileUrl(41, 'book'), () => filmFileUrl(41)]) {
      const error = thrown(build);
      expect(error).toBeInstanceOf(CuratorError);
      expect(error).toMatchObject({ status: 0 });
    }
  });

  it("is the owner's in Main, at this host's Curator port as before", async () => {
    await inMain();
    expect(curatorIsMine()).toBe(true);
    expect(musicUrl('/api/music/a')).toBe(`${location.protocol}//${location.hostname}:2290/api/music/a`);
  });

  it("is the owner's without a library context, exactly as before libraries", () => {
    expect(curatorIsMine()).toBe(true);
    expect(filmFileUrl(41)).toBe(`${location.protocol}//${location.hostname}:2290/api/films/41/film.mp4`);
  });
});

describe('the special albums, in a library whose context leaves them out', () => {
  it('offers none of To do, Villa and QR, to the owner too, and asks Gallery nothing about them', async () => {
    await inSecond();
    sdkMock.getAllAlbums.mockClear();

    expect(offeredSpecialAlbums()).toEqual([]);
    expect(todoManager.offered).toBe(false);
    await todoManager.lookUp();
    await expect(todoManager.move([{ id: 'photo', visibility: AssetVisibility.Timeline }])).resolves.toBeUndefined();
    expect(sdkMock.getAllAlbums).not.toHaveBeenCalled();
    expect(sdkMock.addAssetsToAlbum).not.toHaveBeenCalled();
  });

  it('offers all three in Main', async () => {
    await inMain();
    expect(offeredSpecialAlbums()).toEqual([todoManager, villaManager, qrManager]);
  });
});

describe('the Vaults launcher, in a library whose context leaves it out', () => {
  const kioku = new URL('/photos', mainLibrary.url);

  it('is never offered, even at an address where Main would offer it', async () => {
    await inSecond();
    expect(canLaunchVaultChooser(kioku, desktop, true)).toBe(false);
  });

  it('is offered in Main, and without a library context, as before', async () => {
    expect(canLaunchVaultChooser(kioku, desktop, true)).toBe(true);
    await inMain();
    expect(canLaunchVaultChooser(kioku, desktop, true)).toBe(true);
  });
});

describe("the pages of Main's services", () => {
  const curatorPages = [
    '/command',
    '/inbox',
    '/inbox?tab=jobs',
    '/chat',
    '/chat/conversation-1',
    '/ask',
    '/utilities/slips',
  ];
  const specialPages = ['/todo', '/villa', '/qr'];
  const shared = [
    '/photos',
    '/albums',
    '/utilities',
    '/utilities/duplicates',
    '/inboxes',
    '/room',
    '/trash',
    '/memories',
  ];

  it("leaves out Curator's pages and the special albums' in a library without them", async () => {
    await inSecond();
    for (const route of [...curatorPages, ...specialPages]) {
      expect(pageInThisLibrary(route), route).toBe(false);
    }
    for (const route of shared) {
      expect(pageInThisLibrary(route), route).toBe(true);
    }
  });

  it('keeps every page in Main and without a library context', async () => {
    for (const route of [...curatorPages, ...specialPages, ...shared]) {
      expect(pageInThisLibrary(route), route).toBe(true);
    }
    await inMain();
    for (const route of [...curatorPages, ...specialPages, ...shared]) {
      expect(pageInThisLibrary(route), route).toBe(true);
    }
  });

  it('sends a page this library does not offer to Photos from the root load, and nothing else', async () => {
    await inSecond();
    await expect(notInThisLibrary(at('/inbox?tab=history'))).rejects.toMatchObject({
      status: 307,
      location: '/photos',
    });
    await expect(notInThisLibrary(at('/albums'))).resolves.toBeUndefined();
  });

  it("waits for the context in the root load, and reads it only once (hooks.client's init reads it first)", async () => {
    const fetchMock = serving(libraryContextFile(secondLibrary));
    const first = loadLibraryContext(fetchMock);
    await expect(notInThisLibrary(at('/chat'), fetchMock)).rejects.toMatchObject({
      status: 307,
    });
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("takes them out of Ctrl+K's pages once the context is known", async () => {
    const pages = [{ route: '/photos' }, { route: '/inbox' }, { route: '/inbox?tab=jobs' }, { route: '/villa' }];
    leaveOutOfThisLibrary(pages);
    expect(pages).toHaveLength(4);

    await inSecond();
    expect(pages).toEqual([{ route: '/photos' }]);

    const later = [{ route: '/chat' }, { route: '/albums' }];
    leaveOutOfThisLibrary(later);
    expect(later).toEqual([{ route: '/albums' }]);
  });

  it("keeps Ctrl+K's pages in Main", async () => {
    const pages = [{ route: '/photos' }, { route: '/inbox' }, { route: '/qr' }];
    leaveOutOfThisLibrary(pages);
    await inMain();
    expect(pages).toHaveLength(3);
  });
});

describe("Ctrl+K's lists, built after the context as the app builds them", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("drop Curator's pages and the special albums', and add Switch to Main, in a library without them", async () => {
    vi.resetModules();
    const fresh = await import('./library-context.svelte');
    await fresh.loadLibraryContext(serving(libraryContextFile(secondLibrary)));
    const { NAVIGATION_ITEMS } = await import('$lib/managers/navigation-items');
    const { COMMAND_ITEMS } = await import('$lib/managers/command-items');

    const routes = NAVIGATION_ITEMS.map(({ route }) => route);
    for (const left of ['/command', '/inbox', '/inbox?tab=jobs', '/inbox?tab=history', '/inbox?tab=health', '/chat']) {
      expect(routes).not.toContain(left);
    }
    for (const left of ['/todo', '/villa', '/qr']) {
      expect(routes).not.toContain(left);
    }
    expect(routes).toContain('/photos');
    expect(COMMAND_ITEMS.filter(({ id }) => id.startsWith('cmd:library_')).map(({ id }) => id)).toEqual([
      'cmd:library_main',
    ]);
  });

  it('keep every page, and add Switch to Second, in Main', async () => {
    vi.resetModules();
    const fresh = await import('./library-context.svelte');
    await fresh.loadLibraryContext(serving(libraryContextFile(mainLibrary)));
    const { NAVIGATION_ITEMS } = await import('$lib/managers/navigation-items');
    const { COMMAND_ITEMS } = await import('$lib/managers/command-items');

    const routes = NAVIGATION_ITEMS.map(({ route }) => route);
    for (const kept of ['/command', '/inbox', '/chat', '/todo', '/villa', '/qr']) {
      expect(routes).toContain(kept);
    }
    expect(COMMAND_ITEMS.filter(({ id }) => id.startsWith('cmd:library_')).map(({ id }) => id)).toEqual([
      'cmd:library_second',
    ]);
  });
});
