import { render, screen } from '@testing-library/svelte';
import ErrorLayout from './ErrorLayout.svelte';

// Local Omarchy layer: the error page in the Empty State's grammar (DESIGN.md, Error pages): what failed in plain
// words, a way back or Retry, and the technical details for the admin only

type Navigation = { type: string; from: { url: URL } | null; to: { url: URL } | null };

const { pageMock, authManagerMock, navigation } = vi.hoisted(() => ({
  pageMock: {
    url: new URL('https://gallery.test/'),
    route: { id: null as string | null },
    params: {} as Record<string, string>,
    error: null as { message: string; code?: number; stack?: string } | null,
    status: 200,
  },
  authManagerMock: { authenticated: true, user: { isAdmin: true } },
  navigation: { current: { type: 'enter', from: null, to: null } as Navigation },
}));

vi.mock('$app/state', () => ({ page: pageMock }));
vi.mock('$app/navigation', () => ({
  afterNavigate: (callback: (navigation: Navigation) => void) => callback(navigation.current),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: authManagerMock }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

const ALBUM_ROUTE = '/(user)/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]';

const failAt = (
  path: string,
  routeId: string | null,
  error: { message: string; code?: number; stack?: string },
  params: Record<string, string> = {},
) => {
  pageMock.url = new URL(`https://gallery.test${path}`);
  pageMock.route = { id: routeId };
  pageMock.params = params;
  pageMock.error = error;
  pageMock.status = error.code ?? 500;
  return render(ErrorLayout, { error });
};

beforeEach(() => {
  authManagerMock.authenticated = true;
  authManagerMock.user = { isAdmin: true };
  navigation.current = { type: 'enter', from: null, to: null };
});

describe('ErrorLayout', () => {
  it('says what is missing inside the shell, with Photos as the way back and the details behind Details', () => {
    failAt(
      '/albums/a',
      ALBUM_ROUTE,
      { message: 'Not found or no album.read access', code: 400, stack: 'at load' },
      {
        albumId: 'a',
      },
    );

    expect(screen.getByTestId('user-page-layout')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('error_page_album_title');
    expect(screen.getByRole('link', { name: 'error_page_go_to_photos' })).toHaveAttribute('href', '/photos');
    expect(screen.queryByRole('button', { name: 'go_back' })).not.toBeInTheDocument();
    expect(screen.getByTestId('error-details')).toHaveTextContent('HTTP 400 · Not found or no album.read access');
    expect(screen.getByTestId('error-details')).not.toHaveAttribute('open');
  });

  it('keeps the details from anyone but the admin, and never links outside Gallery', () => {
    authManagerMock.user = { isAdmin: false };
    const { container } = failAt(
      '/albums/a',
      ALBUM_ROUTE,
      { message: 'Not found or no album.read access', code: 400 },
      {
        albumId: 'a',
      },
    );

    expect(screen.queryByTestId('error-details')).not.toBeInTheDocument();
    for (const link of container.querySelectorAll('a')) {
      expect(link.getAttribute('href')).toMatch(/^\//);
    }
  });

  it('offers Back when Gallery itself led here', () => {
    navigation.current = {
      type: 'link',
      from: { url: new URL('https://gallery.test/albums') },
      to: { url: new URL('https://gallery.test/albums/a') },
    };
    failAt('/albums/a', ALBUM_ROUTE, { message: 'Not found or no album.read access', code: 400 }, { albumId: 'a' });

    expect(screen.getByRole('button', { name: 'go_back' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'error_page_go_to_photos' })).toBeInTheDocument();
  });

  it('offers Retry for something that failed, on its own page', () => {
    failAt('/albums/a', ALBUM_ROUTE, { message: 'Internal server error', code: 500 }, { albumId: 'a' });

    expect(screen.queryByTestId('user-page-layout')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('error_page_failed_title');
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
  });

  it('gives someone not signed in the page on its own', () => {
    authManagerMock.authenticated = false;
    failAt('/nothing-here', null, { message: 'Not Found', code: 404 });

    expect(screen.queryByTestId('user-page-layout')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('error_page_missing_title');
    expect(screen.queryByTestId('error-details')).not.toBeInTheDocument();
  });

  it("says a shared link's own words for a link that no longer opens", () => {
    authManagerMock.authenticated = false;
    failAt('/share/abc/photos/x', '/(user)/share/[key]/[[photos=photos]]/[[assetId=id]]', {
      message: 'Invalid share key',
      code: 401,
    });

    expect(screen.getByTestId('shared-link-error')).toHaveAttribute('data-kind', 'link');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('shared_link_ended_title');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
