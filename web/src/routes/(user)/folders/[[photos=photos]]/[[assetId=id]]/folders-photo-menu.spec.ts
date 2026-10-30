import { AssetTypeEnum } from '@immich/sdk';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { TreeNode } from '$lib/utils/tree-utils';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import FoldersPage from './+page.svelte';

// Local Omarchy layer: in a folder's gallery of photos (GalleryViewer), a right-click on a photo opens Kioku's menu
// (gallery/photo-menu) with the folder bar's actions, not the browser's.

const { mockFoldersStore } = vi.hoisted(() => ({
  mockFoldersStore: { folders: undefined as unknown, refreshAssetsByPath: vi.fn() },
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({ featureFlagsManager: { value: { trash: true } } }));

vi.mock('$app/navigation', () => ({
  afterNavigate: vi.fn(),
  beforeNavigate: vi.fn(),
  goto: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock('$app/state', () => ({ page: { url: new URL('https://gallery.test/folders?path=Trips') } }));

vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: vi.fn(), showDialog: vi.fn() },
  toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() },
}));

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent, headerId: 'mock-header' };
});

vi.mock('$lib/components/OnEvents.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/tile-gallery-viewer.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/stores/folders.svelte', () => ({ foldersStore: mockFoldersStore }));

const folderPhoto = (id: string) =>
  assetFactory.build({ id, ownerId: 'current-user-id', type: AssetTypeEnum.Image, livePhotoVideoId: null });
const pathAssets = [folderPhoto('folder-photo-1'), folderPhoto('folder-photo-2')];

const renderPage = () => {
  authManager.setUser(userAdminFactory.build({ id: 'current-user-id' }));
  authManager.setPreferences(preferencesFactory.build({ tags: { enabled: true, sidebarWeb: false } }));
  const root = TreeNode.fromPaths(['Trips']);
  mockFoldersStore.folders = root;
  const props = { data: { meta: { title: 'Trips' }, tree: root.traverse('Trips'), pathAssets } };
  return render(TestWrapper as Component<{ component: typeof FoldersPage; componentProps: typeof props }>, {
    component: FoldersPage,
    componentProps: props,
  });
};

const tile = (id: string) => within(screen.getByTestId('gallery-viewer')).getByRole('button', { name: id });

/** the menu's rows by name (a row's key hint is for the eye only) */
const rows = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => {
      const copy = item.cloneNode(true) as HTMLElement;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
        hidden.remove();
      }
      return copy.textContent?.trim();
    });

beforeEach(() => {
  sdkMock.updateAssetFavorites.mockResolvedValue(undefined as never);
  assetMultiSelectManager.clear();
  for (const asset of pathAssets) {
    asset.isFavorite = false;
  }
});

afterEach(() => {
  cleanup();
  assetMultiSelectManager.clear();
});

describe('the folder page’s photo menu', () => {
  it('opens Kioku’s menu on a right-click in the gallery, with the folder bar’s actions', async () => {
    renderPage();

    const browserMenu = await fireEvent.contextMenu(tile('folder-photo-2'));

    expect(browserMenu).toBe(false);
    expect(rows(await screen.findByRole('menu'))).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'show_in_photos',
      'download',
      'copy_subject',
      'rotate_right',
      'rotate_left',
      'rotate_180',
      'tag',
      'change_date',
      'change_location',
      'change_description',
      'to_archive',
      'move_to_locked_folder',
      'delete',
    ]);
    expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual(['folder-photo-2']);
  });

  it('favourites from the menu, and the folder’s photo shows it', async () => {
    renderPage();

    await fireEvent.contextMenu(tile('folder-photo-1'));
    await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'to_favorite' }));

    await waitFor(() => expect(pathAssets[0].isFavorite).toBe(true));
    expect(pathAssets[1].isFavorite).toBe(false);
    expect(sdkMock.updateAssetFavorites).toHaveBeenCalledWith({
      assetFavoriteUpdateDto: { ids: ['folder-photo-1'], isFavorite: true },
    });
  });
});
