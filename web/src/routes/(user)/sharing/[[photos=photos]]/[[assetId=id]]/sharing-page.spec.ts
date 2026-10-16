import {
  getActivities,
  getAllAlbums,
  getAllSharedLinks,
  getAllSpaces,
  getPartners,
  getSpaceActivities,
  searchAssets,
  type SearchResponseDto,
  type SharedSpaceActivityResponseDto,
} from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '$i18n/en.json';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { albumFactory } from '@test-data/factories/album-factory';
import { sharedSpaceFactory } from '@test-data/factories/shared-space-factory';
import SharingPage from './+page.svelte';

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getActivities: vi.fn(),
  getAllAlbums: vi.fn(),
  getAllSharedLinks: vi.fn(),
  getAllSpaces: vi.fn(),
  getPartners: vi.fn(),
  getSpaceActivities: vi.fn(),
  searchAssets: vi.fn(),
}));

// the owner's archive today: the Library Space (the album folders' engine) and a Family Space of one, empty
const library = sharedSpaceFactory.build({ id: 'library', name: 'Library', createdById: '', albumCount: 448 });
const family = sharedSpaceFactory.build({
  id: 'family',
  name: 'Family',
  memberCount: 1,
  albumCount: 0,
  assetCount: 0,
  lastActivityAt: null,
});

const renderPage = () => {
  const props = { data: { meta: { title: 'Shared' }, asset: undefined } };
  return render(TestWrapper as Component<{ component: typeof SharingPage; componentProps: typeof props }>, {
    component: SharingPage,
    componentProps: props,
  });
};

describe('Shared page', () => {
  beforeAll(async () => {
    addMessages('en', en);
    await init({ fallbackLocale: 'en', initialLocale: 'en' });
  });

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getAllSpaces).mockResolvedValue([library, family]);
    vi.mocked(getSpaceActivities).mockResolvedValue([]);
    vi.mocked(getAllAlbums).mockResolvedValue([]);
    vi.mocked(getActivities).mockResolvedValue([]);
    vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [] } } as unknown as SearchResponseDto);
    vi.mocked(getAllSharedLinks).mockResolvedValue([]);
    vi.mocked(getPartners).mockResolvedValue([]);
  });

  it('with nothing shared, leads to sharing an album with the family Space', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Nothing shared yet' })).toBeInTheDocument();
    expect(screen.getByText(/Albums you put in Family show up here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Share an album with Family' })).toHaveAttribute(
      'href',
      '/spaces/family/albums',
    );
    expect(getSpaceActivities).toHaveBeenCalledTimes(1);
  });

  it('with things shared and nothing happening, says only that', async () => {
    vi.mocked(getAllAlbums).mockResolvedValue([albumFactory.build({ hasSharedLink: true, isActivityEnabled: false })]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Nothing new yet' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Share an album/ })).not.toBeInTheDocument();
  });

  it('shows what happened, and what part could not load with a way to try again', async () => {
    vi.mocked(getAllAlbums).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(getSpaceActivities).mockResolvedValue([
      {
        id: 'a1',
        type: 'asset_add',
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        data: { count: 3, assetIds: ['p1', 'p2', 'p3'] },
        userId: 'mom',
        userName: 'Mom',
      } as SharedSpaceActivityResponseDto,
    ]);
    renderPage();

    expect(await screen.findByText('Part of the feed could not load.')).toBeInTheDocument();
    expect(screen.getByText('Mom added 3 photos')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nothing shared yet' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Part of the feed could not load.')).not.toBeInTheDocument());
    expect(getAllAlbums).toHaveBeenCalledTimes(2);
  });
});
