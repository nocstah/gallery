import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/svelte';
import { getResizeObserverMock } from '$lib/__mocks__/resize-observer.mock';
import AssetViewerNavBar from '$lib/components/asset-viewer/AssetViewerNavBar.svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import {
  libraryContextFile,
  mainLibrary,
  SECOND_CURATOR_FEATURES,
  secondOffering,
  serving,
} from '@test-data/factories/library-context-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: the photo viewer's bar offers each of Curator's tools only where this library's Curator offers
// what it is for (gallery/libraries): Adjust, Live effects and Copy subject its live tools, Remove objects the restorer,
// Look Up its local models. The second library's Curator, which only cleans up, offers none of them, and the bar asks
// it nothing about them. Each tool asks Curator once a page load, so the tests run in order.

const { kinds, health } = vi.hoisted(() => ({ kinds: vi.fn(), health: vi.fn() }));

vi.mock('$lib/utils/curator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/utils/curator')>();
  return { ...actual, curator: { ...actual.curator, kinds, health } };
});

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), function () {
  return {
    featureFlagsManager: {
      init: vi.fn(),
      loadFeatureFlags: vi.fn(),
      value: { smartSearch: true, trash: true },
    } as never,
  };
});

const TOOLS = ['adjust', 'remove_objects', 'live_effects', 'look_up', 'copy_subject'];

const renderBar = () => {
  authManager.setUser(userAdminFactory.build({ id: 'me', isAdmin: true }));
  authManager.setPreferences(preferencesFactory.build({ cast: { gCastEnabled: false } }));
  const asset = assetFactory.build({
    ownerId: 'me',
    type: AssetTypeEnum.Image,
    isTrashed: false,
    visibility: AssetVisibility.Timeline,
  });
  return renderWithTooltips(AssetViewerNavBar, {
    asset,
    preAction: () => {},
    onAction: () => {},
    onClose: () => {},
    isPlayingOriginalVideo: false,
    setPlayOriginalVideo: () => {},
  });
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the viewer's Curator tools, by what this library's Curator offers", () => {
  beforeAll(() => {
    Element.prototype.animate = vi.fn().mockImplementation(() => ({ cancel: () => {} }));
    vi.stubGlobal('ResizeObserver', getResizeObserverMock());
  });

  beforeEach(() => {
    kinds.mockResolvedValue([
      { kind: 'restore.inpaint', title: 'Remove what was painted over', heavy: false },
      { kind: 'live.adjust', title: 'Adjust', heavy: false },
      { kind: 'live.effect', title: 'Live Photo effect', heavy: false },
    ]);
    health.mockResolvedValue({});
  });

  afterEach(() => {
    authManager.reset();
    resetLibraryContext();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // first, while nothing has asked Curator yet in this file
  it('are none of them in the second library, whose Curator offers the AI inbox and picks, and asks no kinds', async () => {
    await loadLibraryContext(serving(secondOffering(SECOND_CURATOR_FEATURES)));
    renderBar();
    await settled();

    expect(kinds).not.toHaveBeenCalled();
    // whether Curator answers is asked for Pick the best, which the stack strip offers
    expect(health).toHaveBeenCalledTimes(1);
    for (const tool of TOOLS) {
      expect(screen.queryByLabelText(tool), tool).not.toBeInTheDocument();
    }
  });

  it('are Adjust, Live effects and Copy subject where its Curator offers its live tools alone', async () => {
    await loadLibraryContext(serving(secondOffering(['live'])));
    renderBar();

    for (const tool of ['adjust', 'live_effects', 'copy_subject']) {
      expect(await screen.findByLabelText(tool), tool).toBeInTheDocument();
    }
    for (const tool of ['remove_objects', 'look_up']) {
      expect(screen.queryByLabelText(tool), tool).not.toBeInTheDocument();
    }
  });

  it('are every one of them in Main, whose file lists nothing', async () => {
    await loadLibraryContext(serving(libraryContextFile(mainLibrary)));
    renderBar();

    for (const tool of TOOLS) {
      expect(await screen.findByLabelText(tool), tool).toBeInTheDocument();
    }
  });
});
