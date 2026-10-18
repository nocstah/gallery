import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SidebarNavGroup from '$lib/components/sidebar/sidebar-nav-group.svelte';

const mocks = vi.hoisted(() => ({
  sidebarModeStore: {
    layout: 'expanded' as 'overlay' | 'rail' | 'expanded',
    hoverExpanded: false,
    railExpanded: false,
  },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('@immich/ui', async () => {
  const navbarGroup = await import('@test-data/mocks/navbar-group.stub.svelte');
  return { NavbarGroup: navbarGroup.default };
});

describe('sidebar-nav-group', () => {
  beforeEach(() => {
    mocks.sidebarModeStore.layout = 'expanded';
    mocks.sidebarModeStore.hoverExpanded = false;
    mocks.sidebarModeStore.railExpanded = false;
  });

  it('renders the text header when expanded', () => {
    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-group-divider')).not.toBeInTheDocument();
  });

  // A bare rule is 47px shorter than the header it replaced, so every row below a group jumped
  // that far the moment the rail collapsed - and back again on hover. The header stays mounted
  // to hold the group's height; only its ink is swapped for a rule.
  it('renders a divider instead of the header in rail mode', () => {
    mocks.sidebarModeStore.layout = 'rail';

    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByTestId('sidebar-group-divider')).toBeInTheDocument();
    const reserved = screen
      .getAllByText('Library')
      .map((text) => text.closest('[aria-hidden="true"]'))
      .find(Boolean);
    // Hidden from sight and from assistive tech, but still occupying its box.
    expect(reserved).toHaveClass('invisible');
  });

  // Local Omarchy layer: the group's title is a heading, so a screen reader moves by the sidebar's groups
  it('names its group as a level 2 heading', () => {
    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByRole('heading', { level: 2, name: 'Library' })).toBeInTheDocument();
  });

  it('keeps the heading for a screen reader in the rail, where the words give way to a rule', () => {
    mocks.sidebarModeStore.layout = 'rail';

    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByRole('heading', { level: 2, name: 'Library' })).toHaveClass('sr-only');
  });

  it('restores the header while hover-expanded', () => {
    mocks.sidebarModeStore.layout = 'rail';
    mocks.sidebarModeStore.hoverExpanded = true;
    mocks.sidebarModeStore.railExpanded = true;

    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-group-divider')).not.toBeInTheDocument();
  });
});
