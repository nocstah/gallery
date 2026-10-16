import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import OmarchyBar from '$lib/components/omarchy/OmarchyBar.svelte';

// Local Omarchy layer: on a phone the one bar's bell moves into the account menu (a row with what is unread, a dot on
// the avatar while something is); a wider bar keeps the bell.
const mocks = vi.hoisted(() => ({
  mediaQueryManager: { isPhone: false, isFullSidebar: true },
  notificationManager: {
    notifications: [] as { id: string }[],
    refresh: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('$lib/stores/media-query-manager.svelte', () => ({ mediaQueryManager: mocks.mediaQueryManager }));
vi.mock('$lib/stores/notification-manager.svelte', () => ({ notificationManager: mocks.notificationManager }));
vi.mock('$lib/stores/sidebar-mode.svelte', () => ({
  sidebarModeStore: { layout: 'expanded', toggleHidden: vi.fn(), toggleRailOverlay: vi.fn() },
}));
vi.mock('$lib/stores/sidebar.svelte', () => ({ sidebarStore: { isOpen: false, toggle: vi.fn() } }));
vi.mock('$app/state', () => ({ page: { url: new URL('https://gallery.test/photos') } }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    authenticated: true,
    user: { id: 'me', name: 'Test', email: 'test@example.com', isAdmin: false },
  },
}));

// Written out one by one on purpose: vi.mock is hoisted and needs a literal path.
vi.mock('$lib/components/omarchy/BarSearch.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});
vi.mock('$lib/components/omarchy/BarUndo.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});
vi.mock('$lib/components/omarchy/BarViewMenu.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});
vi.mock('$lib/components/shared-components/UserAvatar.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});
vi.mock('$lib/components/shared-components/navigation-bar/NotificationPanel.svelte', async () => {
  const module = await import('@test-data/mocks/notification-panel.stub.svelte');
  return { default: module.default };
});

const renderBar = () =>
  render(TestWrapper as Component<{ component: typeof OmarchyBar; componentProps: { onUploadClick: () => void } }>, {
    component: OmarchyBar,
    componentProps: { onUploadClick: vi.fn() },
  });

describe('OmarchyBar notifications', () => {
  beforeEach(() => {
    mocks.mediaQueryManager.isPhone = false;
    mocks.notificationManager.notifications = [];
    sdkMock.getAboutInfo.mockResolvedValue({} as never);
  });

  it('moves the bell into the account menu on a phone, with what is unread', async () => {
    mocks.mediaQueryManager.isPhone = true;
    mocks.notificationManager.notifications = [{ id: 'one' }, { id: 'two' }];
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
    mocks.notificationManager.notifications = [{ id: 'one' }];
    renderBar();

    expect(screen.getByRole('button', { name: 'notifications' })).toBeInTheDocument();
    expect(screen.queryByTestId('bar-account-unread')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByTestId('bar-account'));
    expect(screen.queryByTestId('account-notifications')).not.toBeInTheDocument();
    expect(document.querySelector('#account-info-panel')).toBeInTheDocument();
  });
});
