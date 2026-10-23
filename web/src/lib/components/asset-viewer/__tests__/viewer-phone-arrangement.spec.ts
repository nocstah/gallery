import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, screen, within } from '@testing-library/svelte';
import { getResizeObserverMock } from '$lib/__mocks__/resize-observer.mock';
import AssetViewerNavBar from '$lib/components/asset-viewer/AssetViewerNavBar.svelte';
import { viewerTaken } from '$lib/components/asset-viewer/viewer-taken';
import { saveFrame } from '$lib/components/curator/save-frame.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { setSharedLink } from '$lib/utils';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: where the viewer's actions sit. A desktop or a tablet keeps the one row at the top; a phone
// (below 768px, mediaQueryManager.maxMd) splits it as a phone's photo app does: back, when the photo was taken and the
// ⋮ at the top, share, favourite, info, adjust (or the editor) and delete along the bottom, everything else in the ⋮.
// Either way it is the same actions, each rendered once, and none of them goes missing.

const { media, kinds, health, trash } = vi.hoisted(() => ({
  media: { maxMd: false, pointerCoarse: false, reducedMotion: false, isFullSidebar: true, minLg: true },
  kinds: vi.fn(),
  health: vi.fn(),
  trash: vi.fn(),
}));

vi.mock('$lib/stores/media-query-manager.svelte', () => ({ mediaQueryManager: media }));

vi.mock('$lib/utils/curator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/utils/curator')>();
  return { ...actual, curator: { ...actual.curator, kinds, health } };
});

// Delete's own key, without trashing anything
vi.mock('$lib/utils/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/actions')>()),
  deleteAssets: trash,
}));

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), function () {
  return {
    featureFlagsManager: {
      init: vi.fn(),
      loadFeatureFlags: vi.fn(),
      value: { smartSearch: true, trash: true },
    } as never,
  };
});

const props = {
  preAction: () => {},
  onAction: () => {},
  onClose: () => {},
  isPlayingOriginalVideo: false,
  setPlayOriginalVideo: () => {},
};

/** the account signed in: the owner of the photos below; a family member's unless `admin` (Curator's owner) */
const signIn = (admin = false) => {
  authManager.setUser(userAdminFactory.build({ id: 'me', isAdmin: admin }));
  authManager.setPreferences(preferencesFactory.build({ cast: { gCastEnabled: false } }));
};

const photo = (fields: Partial<AssetResponseDto> = {}) =>
  assetFactory.build({
    id: 'photo-1',
    ownerId: 'me',
    type: AssetTypeEnum.Image,
    originalPath: '/photos/IMG_0001.jpg',
    livePhotoVideoId: null,
    isFavorite: false,
    isOffline: false,
    hasMetadata: true,
    isTrashed: false,
    visibility: AssetVisibility.Timeline,
    localDateTime: '2026-10-11T09:23:13.000Z',
    exifInfo: { dateTimeOriginal: '2026-10-11T02:23:13.000Z', timeZone: 'Asia/Bangkok' },
    ...fields,
  });

const render = (asset: AssetResponseDto, { phone }: { phone: boolean }) => {
  media.maxMd = phone;
  return renderWithTooltips(AssetViewerNavBar, { asset, ...props });
};

/** an action's name as a person hears it: a button's label, a menu row's words without the key hint after them */
const nameOf = (element: Element) => {
  const label = element.getAttribute('aria-label');
  if (label) {
    return label;
  }
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return copy.textContent?.trim() ?? '';
};

const bottomBar = () => screen.getByTestId('asset-viewer-bottom-bar');
const topActions = () => screen.getByTestId('asset-viewer-navbar-actions');
const buttonsIn = (element: HTMLElement) =>
  within(element)
    .queryAllByRole('button')
    .map((button) => nameOf(button));
// a closed menu keeps its rows, hidden and inert (ContextMenu), so what it offers is read with the hidden ones
const menuRows = () => screen.queryAllByRole('menuitem', { hidden: true }).map((row) => nameOf(row));

/** every action the bar offers, wherever it sits (the ⋮'s rows are in the page whether it is open or not) */
const everyAction = () => new Set([...screen.queryAllByRole('button').map((button) => nameOf(button)), ...menuRows()]);

describe("the viewer's actions on a phone and on a desktop", () => {
  beforeAll(() => {
    Element.prototype.animate = vi.fn().mockImplementation(() => ({ cancel: () => {} }));
    vi.stubGlobal('ResizeObserver', getResizeObserverMock());
  });

  beforeEach(() => {
    kinds.mockResolvedValue([
      { kind: 'restore.inpaint', title: 'Remove what was painted over', heavy: false },
      { kind: 'live.adjust', title: 'Adjust', heavy: false },
      { kind: 'live.effect', title: 'Live Photo effect', heavy: false },
      { kind: 'frame.save', title: 'Save a video frame as a photo', heavy: false },
    ]);
    health.mockResolvedValue({});
    trash.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setSharedLink(undefined);
    saveFrame.reset();
    authManager.reset();
    media.maxMd = false;
    trash.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('on a desktop or a tablet', () => {
    it('keeps every everyday action in the one row at the top, and no bar at the bottom', () => {
      signIn();
      render(photo(), { phone: false });

      expect(buttonsIn(topActions())).toEqual(
        expect.arrayContaining(['share', 'download', 'info', 'to_favorite', 'editor', 'delete', 'more']),
      );
      expect(screen.queryByTestId('asset-viewer-bottom-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('asset-viewer-taken')).not.toBeInTheDocument();
    });
  });

  describe('on a phone', () => {
    it('runs share, favourite, info, edit and delete along the bottom, in that order', () => {
      signIn();
      render(photo(), { phone: true });

      expect(buttonsIn(bottomBar())).toEqual(['share', 'to_favorite', 'info', 'editor', 'delete']);
    });

    it('keeps back, when the photo was taken and the ⋮ at the top', () => {
      signIn();
      render(photo(), { phone: true });

      expect(screen.getByLabelText('go_back')).toBeInTheDocument();
      expect(screen.getByLabelText('go_back').closest('[data-testid="asset-viewer-bottom-bar"]')).toBeNull();
      // the camera's own clock, in its own time zone (Bangkok, UTC+7), in the reader's own way (viewer-taken.spec)
      const taken = viewerTaken(photo())!;
      expect(screen.getByTestId('asset-viewer-taken')).toHaveTextContent(`${taken.date} ${taken.time}`);
      expect(buttonsIn(topActions())).toEqual(['more']);
    });

    it('opens everything else from the ⋮, and nothing of the bottom bar twice', async () => {
      signIn();
      render(photo(), { phone: true });
      await fireEvent.click(screen.getByLabelText('more'));

      const rows = menuRows();
      expect(rows).toEqual(
        expect.arrayContaining(['download', 'rotate_right', 'rotate_left', 'add_to_album_or_space', 'slideshow']),
      );
      for (const inTheBar of ['share', 'to_favorite', 'info', 'editor', 'delete']) {
        expect(rows).not.toContain(inTheBar);
      }
      // the bar's own download is the ⋮'s Download: once is enough
      expect(rows.filter((row) => row === 'download')).toHaveLength(1);
    });

    it("leads the ⋮ with a Live Photo's motion", async () => {
      signIn();
      render(photo({ livePhotoVideoId: 'clip-1' }), { phone: true });
      await fireEvent.click(screen.getByLabelText('more'));

      expect(menuRows()[0]).toBe('play_motion_photo');
      expect(buttonsIn(topActions())).toEqual(['more']);
    });

    it('keeps the heart in its place once the photo is a favourite', () => {
      signIn();
      render(photo({ isFavorite: true }), { phone: true });

      expect(buttonsIn(bottomBar())).toEqual(['share', 'unfavorite', 'info', 'editor', 'delete']);
    });

    it("gives a video's trim the edit place", () => {
      signIn();
      render(photo({ type: AssetTypeEnum.Video, duration: 12_000, originalPath: '/v/clip.mp4' }), {
        phone: true,
      });

      expect(buttonsIn(bottomBar())).toContain('editor');
    });

    it("leaves out what is not offered on someone else's photo", async () => {
      signIn();
      render(photo({ ownerId: 'someone-else' }), { phone: true });

      expect(buttonsIn(bottomBar())).toEqual(['to_favorite', 'info']);
      await fireEvent.click(screen.getByLabelText('more'));
      expect(menuRows()).not.toContain('to_archive');
    });

    it('renders Delete once, so its key trashes the photo once', async () => {
      signIn();
      render(photo(), { phone: true });

      expect(screen.getAllByLabelText('delete')).toHaveLength(1);
      await fireEvent.keyDown(document, { key: 'Delete' });
      await vi.waitFor(() => expect(trash).toHaveBeenCalledTimes(1));
    });

    it('on a shared link keeps its download and motion as icons, with no ⋮', () => {
      setSharedLink(sharedLinkFactory.build({ allowDownload: true, showMetadata: true }));
      render(photo({ ownerId: 'the-sharer', livePhotoVideoId: 'clip-1' }), { phone: true });

      expect(buttonsIn(topActions())).toEqual(['play_motion_photo', 'download']);
      expect(screen.queryByLabelText('more')).not.toBeInTheDocument();
      expect(buttonsIn(bottomBar())).toEqual(['info']);
    });
  });

  describe('every action stays reachable', () => {
    it.each([
      ['a photo', photo()],
      ['a Live Photo', photo({ livePhotoVideoId: 'clip-1' })],
      ['a favourite', photo({ isFavorite: true })],
      ['a video', photo({ type: AssetTypeEnum.Video, duration: 12_000, originalPath: '/v/clip.mp4' })],
      ['a photo in the trash', photo({ isTrashed: true })],
      ["someone else's photo", photo({ ownerId: 'someone-else' })],
    ])('on %s, the phone offers what the desktop does', (_, asset) => {
      signIn();
      const desktop = render(asset, { phone: false });
      const onDesktop = everyAction();
      desktop.unmount();

      render(asset, { phone: true });
      expect(everyAction()).toEqual(onDesktop);
    });
  });

  // last: once Curator has answered the owner's session, its tools are known for the rest of the file
  describe("Curator's tools", () => {
    it("are offered to a family member's account nowhere, phone or desktop, and Curator is not asked", async () => {
      signIn(false);
      render(photo(), { phone: true });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(kinds).not.toHaveBeenCalled();
      for (const tool of ['adjust', 'remove_objects', 'live_effects', 'look_up', 'copy_subject']) {
        expect(everyAction()).not.toContain(tool);
      }
    });

    it("put Adjust in the bottom bar for Curator's owner, the editor and the rest of them in the ⋮", async () => {
      signIn(true);
      render(photo(), { phone: true });

      await vi.waitFor(() =>
        expect(buttonsIn(bottomBar())).toEqual(['share', 'to_favorite', 'info', 'adjust', 'delete']),
      );
      expect(menuRows()).toEqual(
        expect.arrayContaining(['editor', 'remove_objects', 'live_effects', 'look_up', 'copy_subject']),
      );
    });

    it('offer the same tools on a phone as on a desktop', async () => {
      signIn(true);
      const desktop = render(photo(), { phone: false });
      await screen.findByLabelText('adjust');
      const onDesktop = everyAction();
      desktop.unmount();

      render(photo(), { phone: true });
      await within(bottomBar()).findByLabelText('adjust');
      expect(everyAction()).toEqual(onDesktop);
    });

    it("save a video's frame from the phone's ⋮", async () => {
      signIn(true);
      const save = vi.spyOn(saveFrame, 'save').mockResolvedValue();
      const video = photo({ id: 'video-1', type: AssetTypeEnum.Video, duration: 12_000 });
      saveFrame.show({ pause: vi.fn(), currentTime: 3 } as unknown as HTMLVideoElement, 'video-1');
      render(video, { phone: true });
      await fireEvent.click(screen.getByLabelText('more'));

      const row = await screen.findByRole('menuitem', { name: 'save_frame_as_photo' });
      await fireEvent.click(row);
      expect(save).toHaveBeenCalledTimes(1);
    });
  });
});
