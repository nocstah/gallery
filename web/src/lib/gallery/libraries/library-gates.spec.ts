import { AssetVisibility } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { canLaunchVaultChooser } from '$lib/gallery/vaults/launcher';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { offeredSpecialAlbums, qrManager, todoManager, villaManager } from '$lib/managers/special-albums.svelte';
import { bookFileUrl, curator, CuratorError, curatorIsMine, filmFileUrl, musicUrl } from '$lib/utils/curator';
import {
  libraryContextFile,
  mainLibrary,
  SECOND_CURATOR_FEATURES,
  secondLibrary,
  secondOffering,
  secondWithout,
  serving,
} from '@test-data/factories/library-context-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';
import { CURATOR_FEATURES, type CuratorFeature } from './library-file';
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
    '/from-the-beginning',
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

// Local Omarchy layer: a library's Curator that runs only some of Main's jobs lists what it offers (curatorFeatures),
// and the pages of anything else go, as all of Curator's do in a library without one: the second library's Curator,
// which only cleans up, offers the AI inbox (and the command center) and Pick the best, and none of chat, Ask or the
// bank slips. Main's file lists nothing, so Main keeps every page.
describe("Curator's pages, in a library whose Curator offers only some of what Main's does", () => {
  /** each feature's pages; the features without one have none to leave out */
  const PAGES_OF: Record<CuratorFeature, string[]> = {
    inbox: ['/command', '/inbox', '/inbox?tab=jobs', '/inbox?tab=history', '/inbox?tab=health', '/inbox?tab=calibrate'],
    chat: ['/chat', '/chat/conversation-1', '/ask', '/ask?q=when'],
    slips: ['/utilities/slips'],
    memories: ['/from-the-beginning'],
    books: [],
    restore: [],
    live: [],
    share: [],
    picks: [],
    smart: [],
  };
  const everyCuratorPage = Object.values(PAGES_OF).flat();
  const shared = ['/photos', '/albums', '/utilities', '/utilities/duplicates', '/inboxes', '/memories', '/room'];
  const inLibrary = (file: unknown) => loadLibraryContext(serving(file));

  it.each(CURATOR_FEATURES)(
    'leaves out the pages of %s where its Curator does not offer it, and keeps the rest',
    async (left) => {
      await inLibrary(secondWithout(left));

      for (const route of PAGES_OF[left]) {
        expect(pageInThisLibrary(route), route).toBe(false);
        await expect(notInThisLibrary(at(route))).rejects.toMatchObject({ status: 307, location: '/photos' });
      }
      for (const route of [...everyCuratorPage.filter((page) => !PAGES_OF[left].includes(page)), ...shared]) {
        expect(pageInThisLibrary(route), route).toBe(true);
      }
    },
  );

  it('keeps the AI inbox and the command center in the second library, and leaves out chat, Ask and the bank slips', async () => {
    await inLibrary(secondOffering(SECOND_CURATOR_FEATURES));

    for (const route of [...PAGES_OF.inbox, ...shared]) {
      expect(pageInThisLibrary(route), route).toBe(true);
      await expect(notInThisLibrary(at(route))).resolves.toBeUndefined();
    }
    for (const route of [...PAGES_OF.chat, ...PAGES_OF.slips]) {
      expect(pageInThisLibrary(route), route).toBe(false);
    }
  });

  it('leaves out every one of them where its Curator offers nothing on the list, as without a Curator', async () => {
    await inLibrary(secondOffering([]));

    for (const route of everyCuratorPage) {
      expect(pageInThisLibrary(route), route).toBe(false);
    }
    for (const route of shared) {
      expect(pageInThisLibrary(route), route).toBe(true);
    }
  });

  it('keeps every one of them in Main, and with a list naming everything', async () => {
    await inMain();
    for (const route of everyCuratorPage) {
      expect(pageInThisLibrary(route), route).toBe(true);
    }

    resetLibraryContext();
    await inLibrary(secondOffering(CURATOR_FEATURES));
    for (const route of everyCuratorPage) {
      expect(pageInThisLibrary(route), route).toBe(true);
    }
  });

  it("takes them out of Ctrl+K's pages once the context is known", async () => {
    const pages = [{ route: '/command' }, { route: '/inbox?tab=jobs' }, { route: '/chat' }, { route: '/photos' }];
    leaveOutOfThisLibrary(pages);

    await inLibrary(secondOffering(SECOND_CURATOR_FEATURES));
    expect(pages).toEqual([{ route: '/command' }, { route: '/inbox?tab=jobs' }, { route: '/photos' }]);
  });
});

describe("Ctrl+K's lists, in a library whose Curator offers only some of what Main's does", () => {
  afterEach(() => {
    vi.resetModules();
  });

  const routesIn = async (file: unknown) => {
    vi.resetModules();
    const fresh = await import('./library-context.svelte');
    await fresh.loadLibraryContext(serving(file));
    const { NAVIGATION_ITEMS } = await import('$lib/managers/navigation-items');
    return NAVIGATION_ITEMS.map(({ route }) => route);
  };
  const inboxPages = ['/command', '/inbox', '/inbox?tab=jobs', '/inbox?tab=history', '/inbox?tab=health'];

  it("keep the AI inbox's pages and drop the chat in the second library", async () => {
    const routes = await routesIn(secondOffering(SECOND_CURATOR_FEATURES));

    for (const kept of [...inboxPages, '/photos', '/memories']) {
      expect(routes).toContain(kept);
    }
    expect(routes).not.toContain('/chat');
  });

  it("drop the AI inbox's pages where its Curator offers only the chat", async () => {
    const routes = await routesIn(secondOffering(['chat']));

    for (const left of inboxPages) {
      expect(routes).not.toContain(left);
    }
    expect(routes).toContain('/chat');
  });
});
