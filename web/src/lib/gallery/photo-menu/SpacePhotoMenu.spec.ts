import { AlbumUserRole, type AlbumResponseDto } from '@immich/sdk';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { resetTileGrid } from '@test-data/mocks/tile-grid';
import SpacePage from './SpacePhotoMenu.test-wrapper.svelte';

// Local Omarchy layer: on a Space's photos the right-click menu offers what the Space's selection bar offers for the
// selection (gallery/photo-menu): the bar works it out from the viewer's role and the photos they may edit (#734).

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    isSharedLink: false,
    user: { id: 'me', isAdmin: false },
    preferences: { tags: { enabled: true } },
    params: {},
  },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({ featureFlagsManager: { value: { trash: true } } }));

const photo = (id: string, ownerId: string, overrides: Partial<TimelineAsset> = {}) =>
  timelineAssetFactory.build({
    id,
    ownerId,
    isFavorite: false,
    isImage: true,
    isVideo: false,
    livePhotoVideoId: null,
    city: null,
    country: null,
    ...overrides,
  });

/** the right-click menu's rows by name (a row's key hint is for the eye only) */
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
  await fireEvent.contextMenu(within(screen.getByTestId('tile-timeline')).getByRole('button', { name: id }));
  return screen.findByRole('menu');
};

const handlers = () => ({ onSetCover: vi.fn(), onRemove: vi.fn(), onAssetDelete: vi.fn(), onVisibilitySet: vi.fn() });

beforeEach(() => {
  assetMultiSelectManager.clear();
  resetTileGrid([photo('mine', 'me'), photo('theirs', 'member')]);
});

afterEach(() => {
  cleanup();
  assetMultiSelectManager.clear();
  resetTileGrid();
});

describe('SpacePhotoMenu', () => {
  it('offers a Space viewer what their bar does for another member’s photo: Favorite and Download', async () => {
    sdkMock.getEditableAssets.mockResolvedValue({ editableAssetIds: [] });
    render(SpacePage, { space: { id: 'space-1', canWrite: false }, ...handlers() });

    const menu = await rightClick('theirs');

    await waitFor(() => expect(rows(menu)).toEqual(['to_favorite', 'download']));
  });

  it('offers a Space editor everything their bar does for their own photo, in the Photos menu’s order', async () => {
    render(SpacePage, { space: { id: 'space-1', canWrite: true }, ...handlers() });

    const menu = await rightClick('mine');

    await waitFor(() =>
      expect(rows(menu)).toEqual([
        'to_favorite',
        'add_to_album_or_space',
        'new_album_from_selection',
        'share',
        'show_in_photos',
        'download',
        'set_as_space_cover',
        'rotate_right',
        'rotate_left',
        'rotate_180',
        'tag',
        'change_date',
        'change_location',
        'change_description',
        'remove_from_space',
        'to_archive',
        'move_to_locked_folder',
        'delete',
      ]),
    );
  });

  it('offers an editor the edits of another member’s photo once the server says they may (#734), never its visibility', async () => {
    sdkMock.getEditableAssets.mockResolvedValue({ editableAssetIds: ['theirs'] });
    render(SpacePage, { space: { id: 'space-1', canWrite: true }, ...handlers() });

    const menu = await rightClick('theirs');

    await waitFor(() => expect(rows(menu)).toContain('change_date'));
    expect(sdkMock.getEditableAssets).toHaveBeenCalledWith({ assetEditableDto: { assetIds: ['theirs'] } });
    expect(rows(menu)).not.toContain('to_archive');
    expect(rows(menu)).not.toContain('delete');
    expect(rows(menu)).not.toContain('show_in_photos');
  });

  it('offers a Space album’s manager Remove from album and the album’s cover', async () => {
    const album = {
      id: 'album-1',
      albumName: 'An album',
      albumUsers: [{ user: { id: 'me' }, role: AlbumUserRole.Owner }],
    } as unknown as AlbumResponseDto;
    const onSetCover = vi.fn();
    render(SpacePage, { space: { id: 'space-1', canWrite: true }, album, ...handlers(), onSetCover });

    const menu = await rightClick('mine');

    await waitFor(() => expect(rows(menu)).toContain('remove_from_album'));
    expect(rows(menu)).not.toContain('remove_from_space');
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'set_as_album_cover' }));
    expect(onSetCover).toHaveBeenCalledOnce();
  });
});
