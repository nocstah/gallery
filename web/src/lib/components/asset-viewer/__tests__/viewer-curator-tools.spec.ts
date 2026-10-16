import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/svelte';
import { getResizeObserverMock } from '$lib/__mocks__/resize-observer.mock';
import AssetViewerNavBar from '$lib/components/asset-viewer/AssetViewerNavBar.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: the photo viewer's bar offers Curator's tools (Adjust, Remove objects, Live effects, Look Up,
// Copy subject) on the owner's own photos, and only while the account signed in is Curator's owner, the server's admin:
// a family member's own photos offer none of them, and the bar asks Curator nothing for that account.

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

const props = {
  preAction: () => {},
  onAction: () => {},
  onClose: () => {},
  isPlayingOriginalVideo: false,
  setPlayOriginalVideo: () => {},
};

const renderBar = (isAdmin: boolean) => {
  authManager.setUser(userAdminFactory.build({ id: 'me', isAdmin }));
  authManager.setPreferences(preferencesFactory.build({ cast: { gCastEnabled: false } }));
  const asset = assetFactory.build({
    ownerId: 'me',
    type: AssetTypeEnum.Image,
    isTrashed: false,
    visibility: AssetVisibility.Timeline,
  });
  return renderWithTooltips(AssetViewerNavBar, { asset, ...props });
};

describe("the viewer's Curator tools", () => {
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
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // first, while nothing has asked Curator yet in this file
  it("are not offered on a family member's own photo, and Curator is not asked", async () => {
    renderBar(false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(kinds).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
    for (const tool of TOOLS) {
      expect(screen.queryByLabelText(tool)).not.toBeInTheDocument();
    }
  });

  it("are offered on the owner's own photo once Curator answers", async () => {
    renderBar(true);

    for (const tool of TOOLS) {
      expect(await screen.findByLabelText(tool)).toBeInTheDocument();
    }
  });

  it("stay away for the next account once the owner's session has had them", async () => {
    renderBar(false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const tool of TOOLS) {
      expect(screen.queryByLabelText(tool)).not.toBeInTheDocument();
    }
  });
});
