import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { addMessages } from 'svelte-i18n';
import { get } from 'svelte/store';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import SidebarNavGroup from '$lib/components/sidebar/sidebar-nav-group.svelte';
import { sidebarGroupsClosed } from '$lib/stores/preferences.store';
import { reactivePageMock as mockPage } from '@test-data/mocks/reactive-page.mock.svelte';

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
  const noop = await import('@test-data/mocks/noop-component.svelte');
  return { NavbarGroup: navbarGroup.default, Icon: noop.default };
});
vi.mock('$app/state', async () => {
  const { reactivePageMock } = await import('@test-data/mocks/reactive-page.mock.svelte');
  return { page: reactivePageMock };
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

// Local Omarchy layer: Manage and Hidden and deleted fold away under their heading, remembered per browser
describe('sidebar-nav-group that folds', () => {
  const rows = createRawSnippet(() => ({ render: () => `<a href="/trash">Trash</a>` }));
  const group = { title: 'Hidden and deleted', collapse: 'hidden-deleted', holds: ['/trash'], children: rows };

  beforeAll(() => addMessages('dev', { expand_named: 'Expand {name}', collapse_named: 'Collapse {name}' }));
  beforeEach(() => {
    mocks.sidebarModeStore.layout = 'expanded';
    mocks.sidebarModeStore.railExpanded = false;
    sidebarGroupsClosed.set({});
    mockPage.reset('https://gallery.test/photos');
  });

  it('is open until folded, its heading a level 2 heading around the button', () => {
    render(SidebarNavGroup, group);
    const heading = screen.getByRole('heading', { level: 2, name: 'Hidden and deleted' });
    const toggle = screen.getByRole('button', { name: 'Hidden and deleted' });
    expect(heading).toContainElement(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByTestId('sidebar-group-rows-hidden-deleted').id);
    expect(screen.getByRole('link', { name: 'Trash' })).toBeInTheDocument();
  });

  it('folds and unfolds on its heading, and remembers it', async () => {
    render(SidebarNavGroup, group);
    const toggle = screen.getByRole('button', { name: 'Hidden and deleted' });
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('title', 'Expand Hidden and deleted');
    expect(screen.queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument();
    expect(get(sidebarGroupsClosed)).toEqual({ 'hidden-deleted': true });
    await fireEvent.click(toggle);
    expect(screen.getByRole('link', { name: 'Trash' })).toBeInTheDocument();
    expect(get(sidebarGroupsClosed)).toEqual({ 'hidden-deleted': false });
  });

  it('starts folded where it was folded before', () => {
    sidebarGroupsClosed.set({ 'hidden-deleted': true });
    render(SidebarNavGroup, group);
    expect(screen.getByRole('button', { name: 'Hidden and deleted' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument();
  });

  it('shows its rows while one of its pages is on screen, until folded there too', async () => {
    sidebarGroupsClosed.set({ 'hidden-deleted': true });
    mockPage.reset('https://gallery.test/trash');
    render(SidebarNavGroup, group);
    expect(screen.getByRole('link', { name: 'Trash' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Hidden and deleted' }));
    expect(screen.queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument();
    expect(get(sidebarGroupsClosed)).toEqual({ 'hidden-deleted': true });
  });

  it('keeps the button in the rail, for a screen reader, where the words give way to a rule', () => {
    mocks.sidebarModeStore.layout = 'rail';
    render(SidebarNavGroup, group);
    expect(screen.getByRole('heading', { level: 2, name: 'Hidden and deleted' })).toHaveClass('sr-only');
    expect(screen.getByTestId('sidebar-group-divider')).toBeInTheDocument();
  });
});
