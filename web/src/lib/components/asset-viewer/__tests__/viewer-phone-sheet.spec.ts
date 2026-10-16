import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { getResizeObserverMock } from '$lib/__mocks__/resize-observer.mock';
import AssetViewer from '$lib/components/asset-viewer/AssetViewer.svelte';
import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { userPreferencesManager } from '$lib/managers/user-preferences-manager.svelte';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: on a phone (mediaQueryManager.maxMd) a panel of the viewer (Info, the editor, an album's
// comments) is a sheet under the photo with none of the viewer's chrome over it, and a photo opens on its own there
// whatever the Info panel was left at; a desktop keeps its side panel, and keeps it open from one visit to the next.

const { media } = vi.hoisted(() => ({
  media: { maxMd: false, pointerCoarse: false, reducedMotion: true, isFullSidebar: true, minLg: true },
}));

vi.mock('$lib/stores/media-query-manager.svelte', () => ({ mediaQueryManager: media }));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: {
    init: vi.fn(),
    loadFeatureFlags: vi.fn(),
    value: { smartSearch: true, trash: true },
  } as never,
}));

vi.mock('$lib/stores/ocr.svelte', () => ({
  ocrManager: { clear: vi.fn(), getAssetOcr: vi.fn(), hasOcrData: false, showOverlay: false, data: [] },
}));

vi.mock('$lib/stores/face.svelte', () => ({
  faceManager: { clear: vi.fn(), getAssetFaces: vi.fn(), data: [], people: [], facesByPersonId: new Map() },
}));

vi.mock('@immich/sdk', async () => {
  const sdk = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return { ...sdk, getAllAlbums: vi.fn().mockResolvedValue([]), getStack: vi.fn() };
});

const asset = () =>
  assetFactory.build({
    ownerId: 'me',
    type: AssetTypeEnum.Image,
    originalPath: '/photos/IMG_0001.jpg',
    livePhotoVideoId: null,
    hasMetadata: true,
    isOffline: false,
    isTrashed: false,
    visibility: AssetVisibility.Timeline,
  });

const open = (phone: boolean) => {
  media.maxMd = phone;
  authManager.setUser(userAdminFactory.build({ id: 'me', isAdmin: false }));
  authManager.setPreferences(preferencesFactory.build({ cast: { gCastEnabled: false } }));
  renderWithTooltips(AssetViewer, { cursor: { current: asset() }, showNavigation: false, onClose: () => {} });
  return document.querySelector('#immich-asset-viewer')!;
};

describe('a panel of the viewer on a phone', () => {
  beforeAll(() => {
    Element.prototype.animate = getAnimateMock();
    vi.stubGlobal('ResizeObserver', getResizeObserverMock());
  });

  afterEach(() => {
    assetViewerManager.closeDetailPanel();
    authManager.reset();
    media.maxMd = false;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('opens the photo on its own, though Info was left open', () => {
    userPreferencesManager.showDetailPanel = true;
    const viewer = open(true);

    expect(viewer).toHaveAttribute('data-phone');
    expect(assetViewerManager.isShowDetailPanel).toBe(false);
    expect(viewer).not.toHaveAttribute('data-sheet');
    expect(document.querySelector('#detail-panel')).toBeNull();
  });

  it('shows Info as a sheet, the bars kept off it but still there for their keys', async () => {
    const viewer = open(true);
    await fireEvent.click(screen.getByLabelText('info'));
    await tick();

    expect(viewer).toHaveAttribute('data-sheet');
    expect(document.querySelector('#detail-panel')).toBeInTheDocument();
    // the chrome the sheet hides is marked, and stays mounted: Delete's key and the others still work
    expect(screen.getByTestId('asset-viewer-bottom-bar').closest('[data-viewer-chrome]')).not.toBeNull();
    expect(screen.getByLabelText('go_back').closest('[data-viewer-chrome]')).not.toBeNull();

    await fireEvent.click(screen.getByLabelText('close'));
    await tick();
    expect(viewer).not.toHaveAttribute('data-sheet');
  });

  it('keeps the side panel on a desktop, open from one visit to the next', async () => {
    userPreferencesManager.showDetailPanel = true;
    const viewer = open(false);
    await tick();

    expect(viewer).not.toHaveAttribute('data-phone');
    expect(viewer).not.toHaveAttribute('data-sheet');
    expect(assetViewerManager.isShowDetailPanel).toBe(true);
    expect(document.querySelector('#detail-panel')).toBeInTheDocument();
  });
});
