import { sdkMock } from '#lib/gallery/__mocks__/sdk.mock.ts';
import { getAnimateMock } from '#test/kioku/mocks/animate.mock.ts';
import { getIntersectionObserverMock } from '#test/kioku/mocks/intersection-observer.mock.ts';
import { getVisualViewportMock } from '#test/kioku/mocks/visual-viewport.mock.ts';
import { render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import AlbumPickerModal from './AlbumPickerModal.svelte';

describe('AlbumPickerModal component', () => {
  const onClose = vi.fn();

  beforeAll(async () => {
    await init({ fallbackLocale: 'en-US' });
    register('en-US', () => import('#i18n/en.json'));
    await waitLocale('en-US');
  });

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    vi.stubGlobal('visualViewport', getVisualViewportMock());
    vi.resetAllMocks();
    Element.prototype.animate = getAnimateMock();
  });

  afterAll(async () => {
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe('none');
    });
  });

  it('shows the singular selection count title when selectedItemsCount is 1', async () => {
    // Called by onMount()
    sdkMock.getAllAlbums.mockResolvedValueOnce([]);

    render(AlbumPickerModal, { props: { onClose, selectedItemsCount: 1 } });

    expect(await screen.findByText('Add 1 photo to album')).toBeInTheDocument();
    expect(screen.queryByText('Select albums')).not.toBeInTheDocument();
  });

  it('shows the plural selection count title when selectedItemsCount is greater than 1', async () => {
    sdkMock.getAllAlbums.mockResolvedValueOnce([]);

    render(AlbumPickerModal, { props: { onClose, selectedItemsCount: 3 } });

    expect(await screen.findByText('Add 3 photos to album')).toBeInTheDocument();
    expect(screen.queryByText('Select albums')).not.toBeInTheDocument();
  });

  it('shows the generic title when selectedItemsCount is not provided', async () => {
    sdkMock.getAllAlbums.mockResolvedValueOnce([]);

    render(AlbumPickerModal, { props: { onClose } });

    expect(await screen.findByText('Select albums')).toBeInTheDocument();
    expect(screen.queryByText('Add 1 photo to album')).not.toBeInTheDocument();
  });
});
