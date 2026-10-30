import type { PersonResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import { resetTileGrid, tileGrid } from '@test-data/mocks/tile-grid';
import PersonDetailPage from './+page.svelte';

// Local Omarchy layer: viewing a person's photos, a right-click on a photo opens Kioku's menu (gallery/photo-menu), not
// the browser's: the actions of the page's own selection bar, Fix incorrect match among them.

const { mockPage } = vi.hoisted(() => ({
  mockPage: {
    url: new URL('https://gallery.test/people/person-1'),
    route: { id: '/(user)/people/[personId]/[[photos=photos]]/[[assetId=id]]' },
    params: { personId: 'person-1' },
  },
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: { value: { peopleStatistics: true, trash: true } },
}));

vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn(), goto: vi.fn(), invalidateAll: vi.fn() }));

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (run: (value: typeof mockPage) => void) => {
      run(mockPage);
      return () => {};
    },
  },
  navigating: {
    subscribe: (run: (value: null) => void) => {
      run(null);
      return () => {};
    },
  },
}));

vi.mock('$app/state', () => ({ page: mockPage }));

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  const { default: MockContextMenuButton } = await import('@test-data/mocks/action-context-menu.stub.svelte');
  return {
    ...original,
    ContextMenuButton: MockContextMenuButton,
    modalManager: { show: vi.fn(), showDialog: vi.fn() },
    toastManager: { primary: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() },
  };
});

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/OnEvents.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/Timeline.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/tile-timeline.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/assets/thumbnail/ImageThumbnail.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/image-thumbnail.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/people/people-merge-selector.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/people-merge-selector.stub.svelte');
  return { default: MockComponent };
});

vi.mock('./UnmergeFaceSelector.svelte', async () => {
  const { default: MockComponent } = await import('./mock-unmerge-face-selector.test-wrapper.svelte');
  return { default: MockComponent };
});

const person: PersonResponseDto = {
  otherPeople: [],
  sharedBy: [],
  sharedWith: [],
  id: 'person-1',
  name: 'Person One',
  birthDate: null,
  thumbnailPath: '/thumb.jpg',
  isHidden: false,
  isFavorite: false,
  color: undefined,
  updatedAt: '2026-01-02T00:00:00.000Z',
  type: 'person',
  species: null,
};

const photo = (id: string) =>
  timelineAssetFactory.build({
    id,
    ownerId: 'current-user-id',
    isFavorite: false,
    isImage: true,
    isVideo: false,
    livePhotoVideoId: null,
    city: null,
    country: null,
  });

const renderPage = () => {
  authManager.setUser(userAdminFactory.build({ id: 'current-user-id' }));
  authManager.setPreferences(preferencesFactory.build({ tags: { enabled: true, sidebarWeb: false } }));
  const props = { data: { person, statistics: { assets: 1, faces: 1 }, meta: { title: person.name } } };
  return render(TestWrapper as Component<{ component: typeof PersonDetailPage; componentProps: typeof props }>, {
    component: PersonDetailPage,
    componentProps: props,
  });
};

const tile = (id: string) => within(screen.getByTestId('tile-timeline')).getByRole('button', { name: id });

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
  sdkMock.getPersonFaceSuggestions.mockResolvedValue({ total: 0, items: [] });
  sdkMock.updateAssetFavorites.mockResolvedValue(undefined as never);
  assetMultiSelectManager.clear();
  resetTileGrid([photo('person-photo-1'), photo('person-photo-2')]);
});

afterEach(() => {
  cleanup();
  assetMultiSelectManager.clear();
  resetTileGrid();
});

describe('the person page’s photo menu', () => {
  it('opens Kioku’s menu on a right-click instead of the browser’s, with the selection bar’s actions', async () => {
    renderPage();

    const browserMenu = await fireEvent.contextMenu(tile('person-photo-2'));

    expect(browserMenu).toBe(false);
    expect(rows(await screen.findByRole('menu'))).toEqual([
      'to_favorite',
      'add_to_album_or_space',
      'new_album_from_selection',
      'share',
      'show_in_photos',
      'download',
      // the menu's own copies ride with Download: Curator's subject lift, for its owner
      'copy_subject',
      'tag',
      'change_date',
      'change_location',
      'change_description',
      'fix_incorrect_match',
      'to_archive',
      'move_to_locked_folder',
      'delete',
    ]);
    // the photo is the selection the menu acts on, so the bar shows too
    expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual(['person-photo-2']);
  });

  it('fixes an incorrect match from the menu with the right-clicked photo', async () => {
    renderPage();

    await fireEvent.contextMenu(tile('person-photo-1'));
    await fireEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'fix_incorrect_match' }),
    );

    expect(await screen.findByTestId('unmerge-face-selector')).toHaveAttribute('data-asset-ids', 'person-photo-1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('favourites from the menu, and the person’s timeline follows', async () => {
    renderPage();

    await fireEvent.contextMenu(tile('person-photo-1'));
    await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'to_favorite' }));

    await waitFor(() => expect(tileGrid.calls).toContainEqual(['update', ['person-photo-1']]));
    expect(sdkMock.updateAssetFavorites).toHaveBeenCalledWith({
      assetFavoriteUpdateDto: { ids: ['person-photo-1'], isFavorite: true },
    });
  });

  it('leaves a right-click to the browser while people are being merged', async () => {
    renderPage();

    await fireEvent.click(screen.getByText('merge_people'));
    await screen.findByTestId('people-merge-selector');

    expect(await fireEvent.contextMenu(tile('person-photo-1'))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
