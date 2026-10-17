import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import UserSidebar from '$lib/components/shared-components/side-bar/UserSidebar.svelte';

const mockPage = vi.hoisted(() => ({ url: new URL('https://gallery.test/photos') }));
vi.mock('$app/state', () => ({ page: mockPage }));

const mocks = vi.hoisted(() => ({
  authManager: {
    authenticated: true,
    user: { isAdmin: true },
    preferences: {
      folders: { enabled: false, sidebarWeb: false },
      memories: { enabled: true, sidebarWeb: true },
      people: { enabled: false, sidebarWeb: false },
      recentlyAdded: { sidebarWeb: false },
      sharedLinks: { enabled: false, sidebarWeb: false },
      tags: { enabled: false, sidebarWeb: false },
    },
  },
  featureFlagsManager: {
    value: {
      map: false,
      search: false,
      trash: false,
    },
  },
}));

vi.mock('$lib/components/sidebar/sidebar-shell.svelte', async () => {
  const module = await import('@test-data/mocks/sidebar-shell.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/BottomInfo.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/rail-storage.svelte', async () => {
  const module = await import('@test-data/mocks/rail-storage.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/RecentAlbums.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/recent-spaces.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/shared-links-row.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/sidebar/albums-tree.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: mocks.authManager,
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: mocks.featureFlagsManager,
}));

vi.mock('$lib/components/sidebar/sidebar-nav-item.svelte', async () => {
  const module = await import('@test-data/mocks/sidebar-nav-item.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/sidebar/sidebar-nav-group.svelte', async () => {
  const module = await import('@test-data/mocks/navbar-group.stub.svelte');
  return { default: module.default };
});

const sidebarMocks = vi.hoisted(() => ({
  sidebarModeStore: {
    layout: 'expanded' as 'overlay' | 'rail' | 'expanded',
    hoverExpanded: false,
    railExpanded: false,
  },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: sidebarMocks.sidebarModeStore }));

describe('UserSidebar', () => {
  beforeEach(() => {
    mocks.authManager.user.isAdmin = true;
    mocks.authManager.preferences.memories.enabled = true;
    mocks.authManager.preferences.memories.sidebarWeb = true;
    mockPage.url = new URL('https://gallery.test/photos');
    sidebarMocks.sidebarModeStore.layout = 'expanded';
    sidebarMocks.sidebarModeStore.hoverExpanded = false;
    sidebarMocks.sidebarModeStore.railExpanded = false;
  });

  // Local Omarchy layer (plan A): one Shared row, beside Albums, in place of Spaces, Sharing and Shared links. It
  // expands into the Spaces and the links, which highlight themselves, so it is lit only on its own page and on the
  // list of Spaces, never alongside one of its rows.
  describe('Shared selected state', () => {
    const sharedLink = () => screen.getByRole('link', { name: /^shared$/i });

    it('replaces the separate Spaces and Sharing rows', () => {
      render(UserSidebar);

      expect(screen.queryByRole('link', { name: /^spaces$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^sharing$/i })).not.toBeInTheDocument();
      expect(sharedLink()).toHaveAttribute('href', '/sharing');
    });

    it('marks Shared selected on its own page and on the list of Spaces', () => {
      mockPage.url = new URL('https://gallery.test/sharing');
      const { unmount } = render(UserSidebar);
      expect(sharedLink()).toHaveAttribute('data-active', 'true');
      unmount();

      mockPage.url = new URL('https://gallery.test/spaces');
      render(UserSidebar);
      expect(sharedLink()).toHaveAttribute('data-active', 'true');
    });

    it('does not mark Shared selected once a space or the links are open', () => {
      mockPage.url = new URL('https://gallery.test/spaces/space-1');
      const { unmount } = render(UserSidebar);
      expect(sharedLink()).toHaveAttribute('data-active', 'false');
      unmount();

      mockPage.url = new URL('https://gallery.test/shared-links');
      render(UserSidebar);
      expect(sharedLink()).toHaveAttribute('data-active', 'false');
    });
  });

  // Local Omarchy layer: the owner's tools are the owner's only ("Owner tools only for me"): a family account (not the
  // server's admin) sees the library and what is shared
  describe('owner tools', () => {
    const tools = ['/command', '/inbox', '/chat', '/utilities', '/import'];
    const link = (href: string) => document.querySelector(`a[href="${CSS.escape(href)}"]`);

    it('shows the command center, AI inbox, chat, Utilities and Import to the owner', () => {
      render(UserSidebar);

      for (const href of tools) {
        expect(link(href), href).toBeInTheDocument();
      }
    });

    it('hides them from a family account, which keeps Photos, Albums and Shared', () => {
      mocks.authManager.user.isAdmin = false;

      render(UserSidebar);

      for (const href of tools) {
        expect(link(href), href).not.toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: /^photos$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^albums$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^shared$/i })).toBeInTheDocument();
      // Room is for everyone: a family account's plays without Curator's music
      expect(screen.getByRole('link', { name: /^room$/i })).toBeInTheDocument();
    });
  });

  it('shows a memories link under Library when memories are enabled and the sidebar is on', () => {
    mocks.authManager.preferences.memories.enabled = true;
    mocks.authManager.preferences.memories.sidebarWeb = true;

    render(UserSidebar);

    expect(screen.getByRole('link', { name: /^memories$/i })).toHaveAttribute('href', '/memories');
  });

  it('hides the memories link when memories are disabled, even with the sidebar on', () => {
    mocks.authManager.preferences.memories.enabled = false;
    mocks.authManager.preferences.memories.sidebarWeb = true;

    render(UserSidebar);

    expect(screen.queryByRole('link', { name: /^memories$/i })).not.toBeInTheDocument();
  });

  it('hides the memories link when the sidebar preference is off, even with memories enabled', () => {
    mocks.authManager.preferences.memories.enabled = true;
    mocks.authManager.preferences.memories.sidebarWeb = false;

    render(UserSidebar);

    expect(screen.queryByRole('link', { name: /^memories$/i })).not.toBeInTheDocument();
  });

  // Local Omarchy layer: Room plays memories, albums and years, so it is there with memories off too
  it('opens Room from its own row, memories or not', () => {
    mocks.authManager.preferences.memories.enabled = false;

    render(UserSidebar);

    expect(screen.getByRole('link', { name: /^room$/i })).toHaveAttribute('href', '/room');
  });

  // Rail mode collapses to icons only, so BottomInfo's full storage bar is swapped for the
  // compact RailStorage indicator; hovering/focusing floats the rail back open first.
  //
  // RecentAlbums and RecentSpaces are mocked to the same generic noop-component stub as
  // BottomInfo (they're always rendered by sidebar-nav-item.stub.svelte's unconditional
  // `{#if items}`), so their two instances are a fixed baseline in every case below;
  // BottomInfo's presence is read off the count on top of that baseline, not off `getBy`,
  // which would throw on the pre-existing multiple matches.
  describe('bottom storage indicator', () => {
    it('renders the compact rail storage indicator when collapsed to a rail', () => {
      sidebarMocks.sidebarModeStore.layout = 'rail';
      sidebarMocks.sidebarModeStore.hoverExpanded = false;
      sidebarMocks.sidebarModeStore.railExpanded = false;

      render(UserSidebar);

      expect(screen.getByTestId('rail-storage-stub')).toBeInTheDocument();
      // the sub-trees' stand-ins: the Albums tree, the Spaces and the links under Shared
      expect(screen.getAllByTestId('noop-component')).toHaveLength(3);
    });

    it('renders BottomInfo when the rail is hover-expanded', () => {
      sidebarMocks.sidebarModeStore.layout = 'rail';
      sidebarMocks.sidebarModeStore.hoverExpanded = true;
      sidebarMocks.sidebarModeStore.railExpanded = true;

      render(UserSidebar);

      expect(screen.queryByTestId('rail-storage-stub')).not.toBeInTheDocument();
      // the three sub-trees' stand-ins, and BottomInfo's
      expect(screen.getAllByTestId('noop-component')).toHaveLength(4);
    });

    it('renders BottomInfo in the expanded layout', () => {
      sidebarMocks.sidebarModeStore.layout = 'expanded';

      render(UserSidebar);

      expect(screen.queryByTestId('rail-storage-stub')).not.toBeInTheDocument();
      // the three sub-trees' stand-ins, and BottomInfo's
      expect(screen.getAllByTestId('noop-component')).toHaveLength(4);
    });
  });
});
