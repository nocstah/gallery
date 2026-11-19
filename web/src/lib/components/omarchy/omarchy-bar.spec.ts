import OmarchyBar from '#lib/components/omarchy/OmarchyBar.svelte';
import { sdkMock } from '#lib/gallery/__mocks__/sdk.mock.ts';
import QueryTestWrapper from '#lib/gallery/components/query-test-wrapper.svelte';
import { loadLibraryContext, resetLibraryContext } from '#lib/gallery/libraries/library-context.svelte.ts';
import { queryClient } from '#lib/queries/client.ts';
import { getNotificationsQuery } from '#lib/queries/notification.query.ts';
import { setDefaultTabbleOptions } from '#lib/utils/focus-util.ts';
import { libraryContextFile, secondLibrary, serving } from '#test/kioku/factories/library-context-factory.ts';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';

// Local Omarchy layer: on a phone the one bar's bell moves into the account menu (a row with what is unread, a dot on
// the avatar while something is); a wider bar keeps the bell.
const mocks = vi.hoisted(() => ({
  mediaQueryManager: { isPhone: false, isFullSidebar: true },
  sidebarModeStore: {
    layout: 'expanded' as 'overlay' | 'rail' | 'expanded' | 'hidden',
    toggleHidden: vi.fn(),
    toggleRailOverlay: vi.fn(),
  },
}));

vi.mock('#lib/stores/media-query-manager.svelte.ts', () => ({ mediaQueryManager: mocks.mediaQueryManager }));
vi.mock('#lib/stores/sidebar-mode.svelte.ts', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('#lib/stores/sidebar.svelte.ts', () => ({ sidebarStore: { isOpen: false, toggle: vi.fn() } }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://gallery.test/photos') } }));
vi.mock('#lib/managers/auth-manager.svelte.ts', () => ({
  authManager: {
    authenticated: true,
    user: { id: 'me', name: 'Test', email: 'test@example.com', isAdmin: false },
  },
}));

// Written out one by one on purpose: vi.mock is hoisted and needs a literal path.
vi.mock('#lib/components/omarchy/BarSearch.svelte', async () => {
  const module = await import('#lib/gallery/__mocks__/noop-component.svelte');
  return { default: module.default };
});
vi.mock('#lib/components/omarchy/BarUndo.svelte', async () => {
  const module = await import('#lib/gallery/__mocks__/noop-component.svelte');
  return { default: module.default };
});
vi.mock('#lib/components/omarchy/BarViewMenu.svelte', async () => {
  const module = await import('#lib/gallery/__mocks__/noop-component.svelte');
  return { default: module.default };
});
vi.mock('#lib/components/shared-components/UserAvatar.svelte', async () => {
  const module = await import('#lib/gallery/__mocks__/noop-component.svelte');
  return { default: module.default };
});
vi.mock('#lib/components/shared-components/navigation-bar/NotificationPanel.svelte', async () => {
  const module = await import('#lib/gallery/__mocks__/notification-panel.stub.svelte');
  return { default: module.default };
});

// what is unread, as the notifications query holds it (queries/notification.query)
const setUnread = (notifications: { id: string }[]) =>
  queryClient.setQueryData(getNotificationsQuery().queryKey, notifications as never);

type BarProps = { onUploadClick: () => void; railAware?: boolean };
const renderBar = (props: Partial<BarProps> = {}) =>
  render(QueryTestWrapper as Component<{ component: typeof OmarchyBar; componentProps: BarProps }>, {
    component: OmarchyBar,
    componentProps: { onUploadClick: vi.fn(), ...props },
  });

describe('OmarchyBar notifications', () => {
  beforeEach(() => {
    mocks.mediaQueryManager.isPhone = false;
    setUnread([]);
    sdkMock.getAboutInfo.mockResolvedValue({} as never);
  });

  it('moves the bell into the account menu on a phone, with what is unread', async () => {
    mocks.mediaQueryManager.isPhone = true;
    setUnread([{ id: 'one' }, { id: 'two' }]);
    renderBar();

    expect(screen.queryByRole('button', { name: 'notifications' })).not.toBeInTheDocument();
    expect(screen.getByTestId('bar-account-unread')).toBeInTheDocument();
    expect(screen.getByTestId('bar-account').title).toContain('notifications_unread_count');

    await fireEvent.click(screen.getByTestId('bar-account'));
    const row = screen.getByTestId('account-notifications');
    expect(row).toHaveTextContent('notifications');
    expect(row).toHaveTextContent('2');
    expect(row).toHaveAccessibleName('notifications: notifications_unread_count');

    await fireEvent.click(row);
    expect(screen.getByTestId('notification-panel-stub')).toBeInTheDocument();
    expect(screen.getByTestId('bar-account')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows no dot on the avatar while nothing is unread', async () => {
    mocks.mediaQueryManager.isPhone = true;
    renderBar();

    expect(screen.queryByTestId('bar-account-unread')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('bar-account'));
    expect(screen.getByTestId('account-notifications')).toHaveAccessibleName('notifications');
  });

  it('keeps the bell on a wider bar, and the account menu without it', async () => {
    setUnread([{ id: 'one' }]);
    renderBar();

    expect(screen.getByRole('button', { name: 'notifications' })).toBeInTheDocument();
    expect(screen.queryByTestId('bar-account-unread')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByTestId('bar-account'));
    expect(screen.queryByTestId('account-notifications')).not.toBeInTheDocument();
    expect(document.querySelector('#account-info-panel')).toBeInTheDocument();
  });
});

// Local Omarchy layer: the account is named by the person (its ring's initial had been its name), and the menu button
// by what a press does to the sidebar (it said Collapse and Expand)
describe('OmarchyBar names', () => {
  beforeEach(() => {
    mocks.mediaQueryManager.isPhone = false;
    setUnread([]);
    mocks.sidebarModeStore.layout = 'expanded';
    sdkMock.getAboutInfo.mockResolvedValue({} as never);
  });

  it('names the account by the person', () => {
    renderBar();
    expect(screen.getByTestId('bar-account')).toHaveAccessibleName('Test');
  });

  it("adds what is unread to the account's name on a phone, where its dot stands for the bell", () => {
    mocks.mediaQueryManager.isPhone = true;
    setUnread([{ id: 'one' }]);
    renderBar();
    expect(screen.getByTestId('bar-account')).toHaveAccessibleName('Test, notifications_unread_count');
  });

  it.each`
    layout        | name
    ${'expanded'} | ${'bar_menu_hide_sidebar'}
    ${'hidden'}   | ${'bar_menu_show_sidebar'}
    ${'rail'}     | ${'main_menu'}
  `('names the menu button $name in the $layout layout', ({ layout, name }) => {
    mocks.sidebarModeStore.layout = layout;
    renderBar({ railAware: true });
    expect(document.querySelector('#top-menu-button')).toHaveAccessibleName(name);
  });
});

// Local Omarchy layer: the bar's Skip to content lands on the page's photo grid (utils/skip-to-content), where it had
// gone to the first control of the first main (a scrubber, an album's filter button)
describe('OmarchyBar skip link', () => {
  afterEach(() => {
    document.querySelector('main')?.remove();
  });

  it("lands on the page's photo grid", async () => {
    sdkMock.getAboutInfo.mockResolvedValue({} as never);
    renderBar();
    const main = document.createElement('main');
    main.innerHTML = '<button type="button">Filters</button><section id="asset-grid" tabindex="-1"></section>';
    document.body.append(main);
    const grid = main.querySelector<HTMLElement>('#asset-grid')!;
    grid.getClientRects = () => [{}] as unknown as DOMRectList;

    await fireEvent.click(screen.getByRole('button', { name: 'skip_to_content' }));

    expect(grid).toHaveFocus();
  });

  it('goes to the first control of the main on a page without photos', async () => {
    // happy-dom lays nothing out, so tabbable is told not to judge by layout
    setDefaultTabbleOptions({ displayCheck: 'none' });
    sdkMock.getAboutInfo.mockResolvedValue({} as never);
    renderBar();
    const main = document.createElement('main');
    main.innerHTML = '<button type="button">New album</button>';
    document.body.append(main);

    await fireEvent.click(screen.getByRole('button', { name: 'skip_to_content' }));

    expect(screen.getByRole('button', { name: 'New album' })).toHaveFocus();
  });
});

// Local Omarchy layer: the open library's name beside the mark, once Kioku lists another library (gallery/libraries)
describe('OmarchyBar library chip', () => {
  afterEach(() => {
    resetLibraryContext();
  });

  it('names the open library right after the mark, in the first column', async () => {
    await loadLibraryContext(serving(libraryContextFile(secondLibrary)));
    renderBar();

    const chip = screen.getByTestId('library-chip');
    expect(chip).toHaveTextContent('Second');
    expect(chip.parentElement).toHaveClass('ws-bar-start');
    expect(chip.previousElementSibling).toHaveClass('ws-bar-mark');
  });

  it('draws no chip without a library context', () => {
    renderBar();
    expect(screen.queryByTestId('library-chip')).not.toBeInTheDocument();
  });
});
