import { loadLibraryContext, resetLibraryContext } from '#lib/gallery/libraries/library-context.svelte.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { curator } from '#lib/utils/curator.ts';
import {
  SECOND_CURATOR_FEATURES,
  libraryContextFile,
  mainLibrary,
  secondOffering,
  serving,
} from '#test/kioku/factories/library-context-factory.ts';
import { preferencesFactory } from '#test/kioku/factories/preferences-factory.ts';
import { userAdminFactory } from '#test/kioku/factories/user-factory.ts';
import { goto } from '$app/navigation';
import { GlobalSearchManager } from './global-search-manager.svelte';

// Local Omarchy layer: the palette's Ask puts the question to Curator's local models (gallery/libraries: chat). A library
// whose Curator has none, as the second library's, which only cleans up, offers no Ask mode, reads an Ask left in this
// browser as a smart search, and never warms a model or opens the answer page; Main, whose file lists nothing, keeps it.
// Each library's context edits Ctrl+K's lists once it is known, so these live in a file of their own.

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('#lib/utils/curator.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/utils/curator.ts')>()),
  curator: { ask: vi.fn(), warmAsk: vi.fn(() => Promise.resolve({ warming: true })) },
}));

const TEXT_MODES = ['smart', 'metadata', 'description', 'ocr'];

beforeEach(() => {
  resetLibraryContext();
  authManager.setUser(userAdminFactory.build({ isAdmin: true }));
  authManager.setPreferences(preferencesFactory.build());
  localStorage.setItem('searchQueryType', 'ask');
});

afterEach(() => {
  authManager.reset();
  resetLibraryContext();
  localStorage.clear();
});

describe("the palette's Ask", () => {
  it("is not offered where this library's Curator has no local models, and an Ask left here reads as a smart search", async () => {
    await loadLibraryContext(serving(secondOffering(SECOND_CURATOR_FEATURES)));
    const palette = new GlobalSearchManager();

    expect(palette.modes).toEqual(TEXT_MODES);
    expect(palette.mode).toBe('smart');
    palette.setMode('ask');
    expect(palette.mode).toBe('smart');
    // the owner's choice, kept for a library that has Ask
    expect(localStorage.getItem('searchQueryType')).toBe('ask');

    expect(curator.warmAsk).not.toHaveBeenCalled();
    expect(curator.ask).not.toHaveBeenCalled();
  });

  it.each([
    ['without a library context', () => Promise.resolve()],
    ['in Main, whose file lists nothing', () => loadLibraryContext(serving(libraryContextFile(mainLibrary)))],
    ['where its Curator has its local models', () => loadLibraryContext(serving(secondOffering(['chat'])))],
  ])('is offered last of the modes %s, and opens the answer page', async (_, load) => {
    await load();
    const palette = new GlobalSearchManager();

    expect(palette.modes).toEqual([...TEXT_MODES, 'ask']);
    expect(palette.mode).toBe('ask');
    await palette.activateSearch('when were we last at the sea?');

    expect(goto).toHaveBeenCalledWith('/ask?q=when%20were%20we%20last%20at%20the%20sea%3F');
  });
});
