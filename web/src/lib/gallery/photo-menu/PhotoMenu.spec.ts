import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';
import { libraryContextFile, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import { resetTileGrid } from '@test-data/mocks/tile-grid';
import PhotoMenuPage from './PhotoMenu.test-wrapper.svelte';
import { photoMenuOffers } from './photo-menu';

// Local Omarchy layer: Kioku's right-click menu on the pages with a photo grid (gallery/photo-menu): a right-click on a
// tile opens it instead of the browser's, with that page's own actions in the Photos menu's order.

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    isSharedLink: false,
    user: { id: 'me', isAdmin: true },
    preferences: { tags: { enabled: true } },
    params: {},
  },
  curatorIsMine: vi.fn(() => false),
  toast: { primary: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() },
  show: vi.fn(),
  showDialog: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({ featureFlagsManager: { value: { trash: true } } }));
vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curatorIsMine: mocks.curatorIsMine,
}));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show, showDialog: mocks.showDialog },
  toastManager: mocks.toast,
}));

const photo = (overrides: Partial<TimelineAsset> = {}) =>
  timelineAssetFactory.build({
    ownerId: 'me',
    isFavorite: false,
    isImage: true,
    isVideo: false,
    livePhotoVideoId: null,
    city: null,
    country: null,
    ...overrides,
  });

/** the state updates a page passes, as its bar gets them */
const handlers = () => ({
  onFavorite: vi.fn(),
  onArchive: vi.fn(),
  onVisibilitySet: vi.fn(),
  onAssetDelete: vi.fn(),
  onUndoDelete: vi.fn(),
});

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

const rightClick = async (id: string) => {
  const shown = await fireEvent.contextMenu(screen.getByRole('button', { name: id }));
  return { browserMenu: shown, menu: await screen.findByRole('menu') };
};

beforeEach(() => {
  assetMultiSelectManager.clear();
  mocks.auth.user = { id: 'me', isAdmin: true };
  mocks.curatorIsMine.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  assetMultiSelectManager.clear();
  resetTileGrid();
  resetLibraryContext();
  vi.unstubAllEnvs();
});

describe('PhotoMenu', () => {
  it('opens on a right-click instead of the browser menu, with the page’s actions in the Photos menu’s order', async () => {
    const own = photo({ id: 'own-photo' });
    resetTileGrid([own]);
    render(PhotoMenuPage, { page: 'person', reveal: true, onFixMatch: vi.fn(), ...handlers() });

    const { browserMenu, menu } = await rightClick(own.id);

    expect(browserMenu).toBe(false);
    expect(rows(menu)).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'show_in_photos',
      'download',
      'tag',
      'change_date',
      'change_location',
      'change_description',
      'fix_incorrect_match',
      'to_archive',
      'move_to_locked_folder',
      'delete',
    ]);
    expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual([own.id]);
  });

  it('runs the page’s own action with the right-clicked photo still selected', async () => {
    const own = photo({ id: 'wrong-match' });
    resetTileGrid([own]);
    const onFixMatch = vi.fn(() => expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual([own.id]));
    render(PhotoMenuPage, { page: 'person', onFixMatch });

    const { menu } = await rightClick(own.id);
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'fix_incorrect_match' }));

    expect(onFixMatch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('acts on the whole selection when the photo right-clicked is part of it', async () => {
    const [first, second] = [photo({ id: 'first' }), photo({ id: 'second' })];
    resetTileGrid([first, second]);
    assetMultiSelectManager.selectAssets([first, second]);
    render(PhotoMenuPage, { page: 'person', reveal: true });

    const { menu } = await rightClick(second.id);

    expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual([first.id, second.id]);
    // Show in Photos is for one photo
    expect(within(menu).queryByRole('menuitem', { name: 'show_in_photos' })).not.toBeInTheDocument();
  });

  it('keeps the owner-only part of a page’s menu for the viewer’s own photos, as its bar does', async () => {
    const [theirs, own] = [photo({ id: 'theirs', ownerId: 'partner' }), photo({ id: 'own' })];
    resetTileGrid([theirs, own]);
    render(PhotoMenuPage, { page: 'recentlyAdded', reveal: true, ...handlers() });

    let { menu } = await rightClick(theirs.id);
    expect(rows(menu)).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'download',
    ]);

    // the menu goes with the selection
    assetMultiSelectManager.clear();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    ({ menu } = await rightClick(own.id));
    expect(rows(menu)).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'show_in_photos',
      'download',
      'tag',
      'change_date',
      'change_location',
      'change_description',
      'to_archive',
      'move_to_locked_folder',
      'delete',
    ]);
  });

  it('offers a partner’s photos for download only', async () => {
    const theirs = photo({ id: 'partner-photo', ownerId: 'partner' });
    resetTileGrid([theirs]);
    mocks.curatorIsMine.mockReturnValue(true);
    render(PhotoMenuPage, { page: 'partner' });

    const { menu } = await rightClick(theirs.id);

    expect(rows(menu)).toEqual(['download']);
  });

  it('leaves a click outside the grid to the browser', async () => {
    resetTileGrid([photo({ id: 'in-the-grid' })]);
    render(PhotoMenuPage, { page: 'person' });

    expect(await fireEvent.contextMenu(screen.getByRole('button', { name: 'not-in-the-grid' }))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('the pages’ own actions', () => {
  it('unfavourites on the favourites page, which then drops the photos', async () => {
    const favourite = photo({ id: 'favourite', isFavorite: true });
    resetTileGrid([favourite]);
    sdkMock.updateAssetFavorites.mockResolvedValue(undefined as never);
    const onFavorite = vi.fn();
    render(PhotoMenuPage, { page: 'favorites', ...handlers(), onFavorite });

    const { menu } = await rightClick(favourite.id);
    expect(rows(menu)[0]).toBe('remove_from_favorites');
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'remove_from_favorites' }));

    await waitFor(() => expect(onFavorite).toHaveBeenCalledWith([favourite.id], false));
    expect(sdkMock.updateAssetFavorites).toHaveBeenCalledWith({
      assetFavoriteUpdateDto: { ids: [favourite.id], isFavorite: false },
    });
  });

  it('unarchives in the archive', async () => {
    const archived = photo({ id: 'archived', visibility: AssetVisibility.Archive });
    resetTileGrid([archived]);
    render(PhotoMenuPage, { page: 'archive', ...handlers() });

    const { menu } = await rightClick(archived.id);

    expect(rows(menu)).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'download',
      'rotate_right',
      'rotate_left',
      'rotate_180',
      'unarchive',
      'move_to_locked_folder',
      'delete',
    ]);
  });

  it('restores from the trash or deletes permanently there, and copies nothing out of it', async () => {
    const trashed = photo({ id: 'trashed', isTrashed: true });
    resetTileGrid([trashed]);
    mocks.curatorIsMine.mockReturnValue(true);
    sdkMock.restoreAssets.mockResolvedValue(undefined as never);
    const onRestore = vi.fn();
    render(PhotoMenuPage, { page: 'trash', reveal: true, onRestore, onAssetDelete: vi.fn() });

    const { menu } = await rightClick(trashed.id);
    expect(rows(menu)).toEqual(['restore', 'permanently_delete']);

    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'restore' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith([trashed.id]));
    expect(sdkMock.restoreAssets).toHaveBeenCalledWith({ bulkIdsDto: { ids: [trashed.id] } });
    expect(mocks.toast.primary).toHaveBeenCalledWith('assets_restored_count');
    expect(assetMultiSelectManager.selectionActive).toBe(false);
  });

  it('copies the subject of a photo outside the trash, for Curator’s owner', async () => {
    const own = photo({ id: 'in-photos' });
    resetTileGrid([own]);
    mocks.curatorIsMine.mockReturnValue(true);
    render(PhotoMenuPage, { page: 'tags' });

    const { menu } = await rightClick(own.id);

    expect(rows(menu)).toContain('copy_subject');
  });
});

describe('where the photos are', () => {
  it('finds the photo among the search results a page shows instead of its timeline, without the stack rows', async () => {
    const [first, second] = [photo({ id: 'result-one' }), photo({ id: 'result-two' })];
    const results = [
      assetFactory.build({ id: first.id, ownerId: 'me' }),
      assetFactory.build({ id: second.id, ownerId: 'me' }),
    ];
    render(PhotoMenuPage, { page: 'recentlyAdded', results });
    assetMultiSelectManager.selectAssets([first, second]);

    const { menu } = await rightClick(second.id);

    expect(rows(menu)).not.toContain('stack');
    expect(screen.getByTestId('gallery-viewer')).toContainElement(screen.getByRole('button', { name: second.id }));
  });

  it('stacks on the timeline itself', async () => {
    const [first, second] = [photo({ id: 'frame-one' }), photo({ id: 'frame-two' })];
    resetTileGrid([first, second]);
    assetMultiSelectManager.selectAssets([first, second]);
    render(PhotoMenuPage, { page: 'map' });

    const { menu } = await rightClick(first.id);

    expect(rows(menu)).toContain('stack');
  });

  it('finds the photo in a gallery of photos', async () => {
    const shown = assetFactory.build({ id: 'in-the-folder', ownerId: 'me', isFavorite: false });
    render(PhotoMenuPage, { page: 'folders', gallery: [shown] });

    const { menu } = await rightClick(shown.id);

    expect(within(menu).getByRole('menuitem', { name: 'to_favorite' })).toBeInTheDocument();
    expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual([shown.id]);
  });

  it('leaves the stack rows to the timelines that offer them', () => {
    for (const [page, offer] of Object.entries(photoMenuOffers)) {
      const actions: readonly string[] = [...offer.actions, ...('whenOwned' in offer ? offer.whenOwned : [])];
      expect({ page, stacks: actions.includes('stack') }).toEqual({
        page,
        stacks: page === 'recentlyAdded' || page === 'map',
      });
    }
  });
});

describe('the gates', () => {
  const found = () => [
    assetFactory.build({
      id: 'found',
      ownerId: 'me',
      type: AssetTypeEnum.Image,
      livePhotoVideoId: null,
      isFavorite: false,
    }),
  ];

  it('offers the special albums in the search for the viewer’s own photos, where this library has them', async () => {
    render(PhotoMenuPage, { page: 'search', gallery: found(), reveal: true, ...handlers() });

    const { menu } = await rightClick('found');

    expect(rows(menu)).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'todo_move',
      'villa_move',
      'qr_move',
      'show_in_photos',
      'download',
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
  });

  it('leaves the special albums out of a library without them', async () => {
    await loadLibraryContext(serving(libraryContextFile(secondLibrary)));
    render(PhotoMenuPage, { page: 'search', gallery: found(), ...handlers() });

    const { menu } = await rightClick('found');

    expect(rows(menu)).not.toEqual(expect.arrayContaining(['todo_move']));
    expect(rows(menu)).toContain('delete');
  });

  it('leaves out what a vault’s Gallery has none of: sharing, the map’s place picker and the Locked Folder', async () => {
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    resetTileGrid([photo({ id: 'in-the-vault' })]);
    render(PhotoMenuPage, { page: 'person', onFixMatch: vi.fn(), ...handlers() });

    const { menu } = await rightClick('in-the-vault');

    expect(rows(menu)).toEqual([
      'to_favorite',
      'add_to_album',
      'new_album_from_selection',
      'download',
      'tag',
      'change_date',
      'change_description',
      'fix_incorrect_match',
      'to_archive',
      'delete',
    ]);
  });
});
