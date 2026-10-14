import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { slipsRule, type SlipsRule } from '$lib/stores/preferences.store';
import type { Slip } from '$lib/utils/curator';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import SlipsPage from './+page.svelte';

const { curatorMock, moveMock, sdkMock, showDialog } = vi.hoisted(() => ({
  curatorMock: { slips: vi.fn(), startJob: vi.fn(), setSlipsAuto: vi.fn() },
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
  slip('mid', { amount: 60_000, checked: 60_000, in_qr: false }),
  slip('mid-filed', { amount: 70_000, checked: 70_000 }),
  slip('read-two-ways', { amount: 390, checked: 3900, status: 'differ' }),
  slip('code', { amount: null, checked: null, status: 'none', bank: 'PromptPay', in_qr: false }),
  slip('not-filed', { amount: 50, checked: 50, in_qr: false }),
  slip('someone-elses', { owner_id: 'user-2', in_qr: false }),
];

const RULE: SlipsRule = { action: 'trash', mode: 'under', under: 3000, over: 50_000, from: 50_000, to: 80_000 };

const renderPage = async (rule: Partial<SlipsRule> = {}) => {
  slipsRule.set({ ...RULE, ...rule });
  const props = { data: { meta: { title: 'Bank slips' } } };
  render(TestWrapper as Component<{ component: typeof SlipsPage; componentProps: typeof props }>, {
    component: SlipsPage,
    componentProps: props,
  });
  await screen.findByRole('heading', { name: /Amounts/ });
};

const applyButton = () => screen.getByRole('button', { name: /^Move \d+ slips? to (Trash|QR)$/ });
const trashedIds = () => sdkMock.deleteAssets.mock.calls[0][0].assetBulkDeleteDto.ids.toSorted();

describe('Bank slips page', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US' });
    await waitLocale('en-US');
    authManager.setUser(userAdminFactory.build({ id: 'user-1' }));
    authManager.setPreferences(preferencesFactory.build());
  });

  beforeEach(() => {
    curatorMock.slips.mockResolvedValue({ album_id: 'qr-album', slips: SLIPS, reading: null, auto: true });
    curatorMock.setSlipsAuto.mockReset().mockResolvedValue({ auto: false });
    moveMock.mockReset().mockResolvedValue({ added: [] });
    sdkMock.deleteAssets.mockReset().mockResolvedValue(undefined);
    showDialog.mockReset().mockResolvedValue(true);
  });

  describe('to the Trash', () => {
    it('takes only the slips both readings agree are under the amount, never a code without one', async () => {
      await renderPage();

      // small, small-too and not-filed; the one read two ways waits under "Check these"
      expect(applyButton()).toHaveTextContent('Move 3 slips to Trash');
      expect(screen.getByRole('heading', { name: /Check these/ })).toBeInTheDocument();
      expect(screen.getByText('Codes without an amount (1) are never sent to the Trash.')).toBeInTheDocument();
    });

    it('sends them to the Trash, not deleted for good, once confirmed', async () => {
      await renderPage();

      await fireEvent.click(applyButton());

      await waitFor(() => expect(sdkMock.deleteAssets).toHaveBeenCalledTimes(1));
      expect(sdkMock.deleteAssets.mock.calls[0][0].assetBulkDeleteDto.force).toBe(false);
      expect(trashedIds()).toEqual(['not-filed', 'small', 'small-too']);
    });

    it('sends nothing when the question is answered no', async () => {
      showDialog.mockResolvedValue(false);
      await renderPage();

      await fireEvent.click(applyButton());

      await waitFor(() => expect(showDialog).toHaveBeenCalled());
      expect(sdkMock.deleteAssets).not.toHaveBeenCalled();
    });

    it('takes a range: between two amounts, both ends included', async () => {
      await renderPage({ mode: 'between', from: 60_000, to: 70_000 });

      await fireEvent.click(applyButton());

      await waitFor(() => expect(sdkMock.deleteAssets).toHaveBeenCalled());
      expect(trashedIds()).toEqual(['mid', 'mid-filed']);
    });

    it('takes what is over an amount', async () => {
      await renderPage({ mode: 'over', over: 20_000 });

      expect(applyButton()).toHaveTextContent('Move 3 slips to Trash');
    });

    it('leaves out a slip clicked among those it takes, and adds one checked among those read two ways', async () => {
      await renderPage();

      // a slip's tile (its name carries its amount), not the rule's pressed buttons
      await fireEvent.click(screen.getAllByRole('button', { pressed: true, name: /฿/ })[0]);
      expect(applyButton()).toHaveTextContent('Move 2 slips to Trash');

      await fireEvent.click(screen.getByRole('button', { pressed: false, name: /฿390/ }));
      expect(applyButton()).toHaveTextContent('Move 3 slips to Trash');
    });
  });

  describe('into QR', () => {
    it('files the slips in range that QR does not hold yet, and says how many it holds already', async () => {
      await renderPage({ action: 'qr', mode: 'between' });

      expect(screen.getByText('1 more is in QR already.')).toBeInTheDocument();
      await fireEvent.click(applyButton());

      expect(moveMock).toHaveBeenCalledWith([{ id: 'mid', visibility: 'archive', ownerId: 'user-1' }]);
      expect(sdkMock.deleteAssets).not.toHaveBeenCalled();
    });

    it('files every slip at any amount, codes without one too', async () => {
      await renderPage({ action: 'qr', mode: 'any' });

      expect(applyButton()).toHaveTextContent('Move 3 slips to QR');
      await fireEvent.click(applyButton());

      expect(moveMock.mock.calls[0][0].map(({ id }: { id: string }) => id).toSorted()).toEqual([
        'code',
        'mid',
        'not-filed',
      ]);
    });

    it('switches between the two with the action buttons', async () => {
      await renderPage({ action: 'qr' });

      await fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

      expect(applyButton()).toHaveTextContent('Move 3 slips to Trash');
    });
  });

  // the user: "whenever a new image is added, there should be a detector ... we can have an option for that"
  it('turns automatic filing of new slips and QR codes off and on', async () => {
    await renderPage();
    const toggle = screen.getByRole('switch', { name: /File new slips and QR codes into QR automatically/ });
    expect(toggle).toBeChecked();

    await fireEvent.click(toggle);

    await waitFor(() => expect(curatorMock.setSlipsAuto).toHaveBeenCalledWith(false));
  });
});
