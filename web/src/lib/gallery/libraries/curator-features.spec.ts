import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
import { assetFactory } from '@test-data/factories/asset-factory';
import {
  libraryContextFile,
  mainLibrary,
  SECOND_CURATOR_FEATURES,
  secondOffering,
  secondWithout,
  serving,
} from '@test-data/factories/library-context-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import { CURATOR_FEATURES, type CuratorFeature } from './library-file';

// Local Omarchy layer: a library's Curator that runs only some of Main's jobs lists what it offers (curatorFeatures),
// and the tools of anything else are neither offered nor asked about: each tool asks Curator whether it can be offered
// (its kinds, or whether it answers) only where its feature is offered. The second library's Curator, which only
// cleans up, offers the AI inbox and Pick the best. Main lists nothing and offers every tool, as before. Each test is a
// page load of its own (a tool asks once a page load), the owner signed in.

const KINDS = ['book.make', 'film.render', 'live.effect', 'live.adjust', 'frame.save', 'restore.inpaint'].map(
  (kind) => ({ kind, title: kind, heavy: false }),
);
const FACTS = { places: ['Riverton'], people: [], start: '2025-10-13', end: '2025-10-20', count: 9, cover: null };

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
/** the paths Curator was asked for */
const requested = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);

/** A page load in the library this file describes (or none: one library), the owner signed in. */
const pageIn = async (file?: unknown) => {
  vi.resetModules();
  const context = await import('./library-context.svelte');
  if (file !== undefined) {
    await context.loadLibraryContext(serving(file));
  }
  const { authManager } = await import('$lib/managers/auth-manager.svelte');
  authManager.setUser(userAdminFactory.build({ id: 'me', isAdmin: true }));
  authManager.setPreferences(preferencesFactory.build());
};

/** Curator's answers in, whatever they were */
const answered = () => new Promise((resolve) => setTimeout(resolve, 0));

const video = assetFactory.build({
  ownerId: 'me',
  type: AssetTypeEnum.Video,
  isTrashed: false,
  visibility: AssetVisibility.Timeline,
});

type Tool = [name: string, offered: () => Promise<boolean>];

/** Each feature's tools that ask Curator first (or go by its answer), each saying whether it is offered once asked. The
 * pages, the sidebar's and Utilities' rows, the album page's smart badge and story have specs of their own. */
const TOOLS: Record<CuratorFeature, Tool[]> = {
  inbox: [
    [
      "Ctrl+K's AI inbox and command center",
      async () => {
        const { NAVIGATION_ITEMS } = await import('$lib/managers/navigation-items');
        const routes = new Set(NAVIGATION_ITEMS.map(({ route }) => route));
        return routes.has('/inbox') && routes.has('/command');
      },
    ],
  ],
  chat: [
    [
      'Look Up',
      async () => {
        const { lookUp } = await import('$lib/components/curator/look-up.svelte');
        lookUp.check();
        await answered();
        return lookUp.available;
      },
    ],
    [
      "Ctrl+K's chat",
      async () => {
        const { NAVIGATION_ITEMS } = await import('$lib/managers/navigation-items');
        return NAVIGATION_ITEMS.some(({ route }) => route === '/chat');
      },
    ],
  ],
  memories: [
    [
      "a memory's Share and Save as video",
      async () => {
        const { filmVideos } = await import('$lib/managers/film-video-manager.svelte');
        filmVideos.check();
        await answered();
        return filmVideos.available;
      },
    ],
    [
      "a memory's title and cover from Curator's facts",
      async () => {
        const { memoryFacts } = await import('$lib/managers/memory-facts.svelte');
        memoryFacts.request(['memory']);
        await answered();
        return memoryFacts.get('memory') !== undefined;
      },
    ],
  ],
  books: [
    [
      "an album's Make photo book",
      async () => {
        const { photoBooks } = await import('$lib/managers/photo-book-manager.svelte');
        photoBooks.check();
        await answered();
        return photoBooks.available;
      },
    ],
    [
      "Ctrl+K's year book",
      async () => {
        const { photoBooks } = await import('$lib/managers/photo-book-manager.svelte');
        const { COMMAND_ITEMS } = await import('$lib/managers/command-items');
        photoBooks.check();
        await answered();
        const command = COMMAND_ITEMS.find(({ id }) => id === 'cmd:photo_book');
        return !!command?.isAvailable?.({} as never);
      },
    ],
  ],
  restore: [
    [
      'Remove objects',
      async () => {
        const { removeObjects } = await import('$lib/components/curator/remove-objects.svelte');
        removeObjects.check();
        await answered();
        return removeObjects.available;
      },
    ],
  ],
  live: [
    [
      'Live effects',
      async () => {
        const { liveEffects } = await import('$lib/components/curator/live-effects.svelte');
        liveEffects.check();
        await answered();
        return liveEffects.available;
      },
    ],
    [
      'Adjust',
      async () => {
        const { adjustPhoto } = await import('$lib/components/curator/adjust-photo.svelte');
        adjustPhoto.check();
        await answered();
        return adjustPhoto.available;
      },
    ],
    [
      'Save frame as photo',
      async () => {
        const { saveFrame } = await import('$lib/components/curator/save-frame.svelte');
        saveFrame.check();
        await answered();
        return saveFrame.available;
      },
    ],
    [
      'Copy subject',
      async () => {
        const { lookUp } = await import('$lib/components/curator/look-up.svelte');
        lookUp.check();
        await answered();
        return lookUp.answers('live');
      },
    ],
  ],
  share: [
    [
      'Download for WhatsApp or Telegram',
      async () => {
        const { canShareVideo } = await import('$lib/utils/share-video');
        return canShareVideo(video);
      },
    ],
  ],
  picks: [
    [
      'Pick the best',
      async () => {
        const { lookUp } = await import('$lib/components/curator/look-up.svelte');
        lookUp.check();
        await answered();
        return lookUp.answers('picks');
      },
    ],
  ],
  smart: [],
  slips: [],
};

/** the tools that ask Curator's kinds before they are offered */
const ASKS_KINDS = new Set<CuratorFeature>(['memories', 'books', 'restore', 'live']);

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/api/kinds')) {
      return Promise.resolve(Response.json(KINDS));
    }
    if (path.endsWith('/api/memories/facts')) {
      return Promise.resolve(Response.json({ memories: { memory: FACTS } }));
    }
    return Promise.resolve(Response.json({}));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const FEATURES_WITH_TOOLS = CURATOR_FEATURES.filter((feature) => TOOLS[feature].length > 0);

describe.each(FEATURES_WITH_TOOLS)("Curator's %s", (feature) => {
  it.each([
    ['without a library context', undefined],
    ['in Main, whose file lists nothing', libraryContextFile(mainLibrary)],
  ])('is offered %s, once Curator says so', async (_, file) => {
    await pageIn(file);

    for (const [tool, offered] of TOOLS[feature]) {
      expect(await offered(), tool).toBe(true);
    }
  });

  it("is not offered, and not asked about, where the library's Curator does not offer it", async () => {
    await pageIn(secondWithout(feature));

    for (const [tool, offered] of TOOLS[feature]) {
      expect(await offered(), tool).toBe(false);
    }
    if (ASKS_KINDS.has(feature)) {
      expect(requested()).not.toContain('/api/kinds');
    }
    // what is asked is for the tools of another feature, never of this one: Look Up's check asks whether Curator
    // answers for Copy subject and Pick the best too
    expect(requested().every((path) => path === '/api/health')).toBe(true);
  });
});

describe("Curator's tools, in a library whose Curator offers nothing on its list", () => {
  it('offers none of them and asks Curator nothing', async () => {
    await pageIn(secondOffering([]));

    for (const feature of FEATURES_WITH_TOOLS) {
      for (const [tool, offered] of TOOLS[feature]) {
        expect(await offered(), tool).toBe(false);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Curator's tools, in the second library, whose Curator offers the AI inbox and Pick the best", () => {
  it('offers those alone, asking Curator only whether it answers', async () => {
    await pageIn(secondOffering(SECOND_CURATOR_FEATURES));

    for (const feature of FEATURES_WITH_TOOLS) {
      for (const [tool, offered] of TOOLS[feature]) {
        expect(await offered(), tool).toBe(SECOND_CURATOR_FEATURES.includes(feature));
      }
    }
    expect(new Set(requested())).toEqual(new Set(['/api/health']));
    expect(fetchMock.mock.calls.every(([input]) => String(input).startsWith('http://localhost:2291/'))).toBe(true);
  });
});
