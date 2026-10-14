import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { slipsThreshold } from '$lib/stores/preferences.store';
import type { Slip } from '$lib/utils/curator';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import SlipsPage from './+page.svelte';

const { curatorMock, moveMock, sdkMock, showDialog } = vi.hoisted(() => ({
  curatorMock: { slips: vi.fn(), startJob: vi.fn() },
  moveMock: vi.fn(),
  sdkMock: { deleteAssets: vi.fn(), restoreAssets: vi.fn() },
  showDialog: vi.fn(),
}));

vi.mock('$lib/utils/curator', () => ({ curator: curatorMock, waitForJob: vi.fn() }));
vi.mock('$lib/managers/special-albums.svelte', () => ({ qrManager: { move: moveMock, route: '/qr' } }));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  ...sdkMock,
}));
vi.mock('@immich/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/ui')>();
  return { ...actual, modalManager: { ...actual.modalManager, showDialog } };
});
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

const slip = (id: string, overrides: Partial<Slip> = {}): Slip => ({
  id,
  owner_id: 'user-1',
  visibility: 'archive',
  taken_at: '2026-01-01T00:00:00',
  bank: 'Bank A',
  amount: 100,
  checked: 100,
  status: 'agree',
  in_qr: true,
  ...overrides,
});

const SLIPS = [
  slip('small'),
  slip('small-too', { amount: 2999.99, checked: 2999.99 }),
  slip('big', { amount: 30_000, checked: 30_000 }),
  slip('read-two-ways', { amount: 390, checked: 3900, status: 'differ' }),
  slip('code', { amount: null, checked: null, status: 'none', bank: 'PromptPay' }),
  slip('not-filed', { amount: 50, checked: 50, in_qr: false, visibility: 'archive' }),
  slip('someone-elses', { owner_id: 'user-2' }),
];

const renderPage = async () => {
  const props = { data: { meta: { title: 'Bank slips' } } };
  render(TestWrapper as Component<{ component: typeof SlipsPage; componentProps: typeof props }>, {
    component: SlipsPage,
    componentProps: props,
  });
  await screen.findByRole('heading', { name: /Amounts/ });
};

const trashButton = () => screen.getByRole('button', { name: /to Trash$/ });

describe('Bank slips page', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US' });
    await waitLocale('en-US');
    authManager.setUser(userAdminFactory.build({ id: 'user-1' }));
    authManager.setPreferences(preferencesFactory.build());
  });

  beforeEach(() => {
    slipsThreshold.set(3000);
    curatorMock.slips.mockResolvedValue({ album_id: 'qr-album', slips: SLIPS, reading: null });
    moveMock.mockReset().mockResolvedValue({ added: ['not-filed'] });
    sdkMock.deleteAssets.mockReset().mockResolvedValue(undefined);
    showDialog.mockReset().mockResolvedValue(true);
  });

  it('offers only the slips both readings agree are under the amount, never a code without one', async () => {
    await renderPage();

    // small, small-too and not-filed: the one read two ways waits under "Check these", the big one and the code stay
    expect(trashButton()).toHaveTextContent('Move 3 slips to Trash');
    expect(screen.getByRole('heading', { name: /Check these/ })).toBeInTheDocument();
    expect(screen.getByText(/1 slip at or above ฿3,000 stays/)).toBeInTheDocument();
  });

  it('sends what it offers to the Trash, not deleted for good, once confirmed', async () => {
    await renderPage();

    await fireEvent.click(trashButton());

    await waitFor(() => expect(sdkMock.deleteAssets).toHaveBeenCalledTimes(1));
    const { ids, force } = sdkMock.deleteAssets.mock.calls[0][0].assetBulkDeleteDto;
    expect(force).toBe(false);
    expect(ids.toSorted()).toEqual(['not-filed', 'small', 'small-too']);
  });

  it('sends nothing when the question is answered no', async () => {
    showDialog.mockResolvedValue(false);
    await renderPage();

    await fireEvent.click(trashButton());

    await waitFor(() => expect(showDialog).toHaveBeenCalled());
    expect(sdkMock.deleteAssets).not.toHaveBeenCalled();
  });

  it('keeps a slip clicked among the agreeing ones, and adds one checked among those read two ways', async () => {
    await renderPage();
    const tiles = screen.getAllByRole('button', { pressed: true });

    await fireEvent.click(tiles[0]);
    expect(trashButton()).toHaveTextContent('Move 2 slips to Trash');

    await fireEvent.click(screen.getByRole('button', { pressed: false, name: /฿390/ }));
    expect(trashButton()).toHaveTextContent('Move 3 slips to Trash');
  });

  it('follows the amount it is given', async () => {
    slipsThreshold.set(100);
    await renderPage();

    expect(trashButton()).toHaveTextContent('Move 1 slip to Trash');
  });

  it('files the slips QR does not hold yet into QR, with what it knows of them', async () => {
    await renderPage();

    await fireEvent.click(screen.getByRole('button', { name: 'Move it to QR' }));

    expect(moveMock).toHaveBeenCalledWith([{ id: 'not-filed', visibility: 'archive', ownerId: 'user-1' }]);
  });
});
