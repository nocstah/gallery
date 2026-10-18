import { mdiPlayCircleOutline } from '@mdi/js';
import { render } from '@testing-library/svelte';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import Thumbnail from '$lib/components/assets/thumbnail/Thumbnail.svelte';
import { getTabbable } from '$lib/utils/focus-util';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';

vi.mock('$lib/utils/navigation', () => ({
  currentUrlReplaceAssetId: vi.fn(),
  isSharedLinkRoute: vi.fn().mockReturnValue(false),
}));

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    enumerable: true,
    value: vi.fn().mockImplementation(function (query) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
});

describe('Thumbnail component', () => {
  beforeAll(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
  });

  it('should only contain a single tabbable element (the container)', () => {
    const asset = assetFactory.build({ originalPath: 'image.jpg', originalMimeType: 'image/jpeg' });
    const { baseElement } = render(Thumbnail, {
      asset,
      selected: true,
    });

    const container = baseElement.querySelector('[data-thumbnail-focus-container]');
    expect(container).not.toBeNull();
    expect(container!.getAttribute('tabindex')).toBe('0');

    // Guarding against inserting extra tabbable elements in future in <Thumbnail/>
    const tabbables = getTabbable(container!);
    expect(tabbables.length).toBe(0);
  });

  it('shows thumbhash while image is loading', () => {
    const asset = assetFactory.build({ originalPath: 'image.jpg', originalMimeType: 'image/jpeg' });
    const sut = render(Thumbnail, {
      asset,
      selected: true,
    });

    const thumbhash = sut.getByTestId('thumbhash');
    expect(thumbhash).not.toBeFalsy();
  });

  it('carries the month mark it is given, in the corner while no check is there', () => {
    const asset = assetFactory.build({ originalPath: 'image.jpg', originalMimeType: 'image/jpeg' });
    const { baseElement } = render(Thumbnail, { asset, monthMark: 'SEP' });

    const mark = baseElement.querySelector('.ws-month-mark');
    expect(mark?.textContent).toBe('SEP');
    expect(mark?.hasAttribute('data-aside')).toBe(false);
  });

  it('moves the month mark aside for the selection check', () => {
    const asset = assetFactory.build({ originalPath: 'image.jpg', originalMimeType: 'image/jpeg' });
    const { baseElement } = render(Thumbnail, { asset, monthMark: 'SEP', selected: true });

    expect(baseElement.querySelector('[role="checkbox"]')).not.toBeNull();
    expect(baseElement.querySelector('.ws-month-mark')?.hasAttribute('data-aside')).toBe(true);
  });

  it('shows no month mark on other photos', () => {
    const asset = assetFactory.build({ originalPath: 'image.jpg', originalMimeType: 'image/jpeg' });
    const { baseElement } = render(Thumbnail, { asset });

    expect(baseElement.querySelector('.ws-month-mark')).toBeNull();
  });

  // Local Omarchy layer: a grid of favourites only (Favorites, the favourites filter) gives no tile its heart
  it('draws the heart on a favourite, and none where every tile is one', () => {
    const asset = timelineAssetFactory.build({ isFavorite: true, city: 'Riverton', country: 'Thailand' });
    const shown = render(Thumbnail, { asset });
    expect(shown.baseElement.querySelector('[data-icon-favorite]')).not.toBeNull();
    expect(shown.baseElement.querySelector('.ws-place')?.classList.contains('ws-place-fav')).toBe(true);
    shown.unmount();

    const { baseElement } = render(Thumbnail, { asset, showFavoriteIcon: false });
    expect(baseElement.querySelector('[data-icon-favorite]')).toBeNull();
    // the caption no longer steps past a heart that is not there
    expect(baseElement.querySelector('.ws-place')?.classList.contains('ws-place-fav')).toBe(false);
  });

  // Local Omarchy layer: on a tile too narrow for both (under 5rem, omarchy-world.css), what sits at the top corner
  // gives way to the month mark. The hook has to be on exactly those badges: a video's stack sits lower and stays.
  describe('the top corner beside a month mark', () => {
    const stack = { id: 'stack-1', assetCount: 3, primaryAssetId: 'cover' };

    it("marks a video's play icon", () => {
      const asset = timelineAssetFactory.build({ isImage: false, isVideo: true, duration: 15_000 });
      const { baseElement } = render(Thumbnail, { asset, monthMark: 'SEP' });

      const tile = baseElement.querySelector('[data-month-start]');
      expect(tile?.querySelector('.ws-tile-corner')?.querySelector('svg')).not.toBeNull();
    });

    it("marks a photo stack's badge", () => {
      const asset = timelineAssetFactory.build({ livePhotoVideoId: null, stack });
      const { baseElement } = render(Thumbnail, { asset, monthMark: 'SEP' });

      expect(baseElement.querySelector('.ws-stack-badge')?.classList.contains('ws-tile-corner')).toBe(true);
    });

    it("leaves a video's stack badge, which sits under the play icon, where it is", () => {
      const asset = timelineAssetFactory.build({ isImage: false, isVideo: true, duration: 15_000, stack });
      const { baseElement } = render(Thumbnail, { asset, monthMark: 'SEP' });

      const badge = baseElement.querySelector('.ws-stack-badge');
      expect(badge?.classList.contains('ws-tile-corner')).toBe(false);
      expect(badge?.classList.contains('ws-tile-badge-low')).toBe(true);
    });
  });

  // Local Omarchy layer: every corner badge is one chip (ws-tile-badge, omarchy-world.css)
  describe('the corner badges', () => {
    it("keeps a video's time and play mark on its chip, at rest", () => {
      const asset = timelineAssetFactory.build({
        isImage: false,
        isVideo: true,
        duration: 15_000,
        livePhotoVideoId: null,
      });
      const { baseElement } = render(Thumbnail, { asset });

      const badge = baseElement.querySelector('.ws-tile-corner')?.querySelector('.ws-tile-badge');
      expect(badge?.textContent).toContain('0:15');
      expect(badge?.classList.contains('ws-live-badge')).toBe(false);
      expect(badge?.querySelector('path')?.getAttribute('d')).toBe(mdiPlayCircleOutline);
    });

    it("puts a stack's count on the chip", () => {
      const asset = timelineAssetFactory.build({
        livePhotoVideoId: null,
        stack: { id: 'stack-1', assetCount: 12, primaryAssetId: 'cover' },
      });
      const { baseElement } = render(Thumbnail, { asset });

      const badge = baseElement.querySelector('.ws-stack-badge');
      expect(badge?.classList.contains('ws-tile-badge')).toBe(true);
      expect(badge?.textContent).toContain('12');
    });
  });
});
