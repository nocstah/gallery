import { modalManager, type ActionItem } from '@immich/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import SelectionReviewModal from '$lib/modals/SelectionReviewModal.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import AssetSelectControlBar from './AssetSelectControlBar.svelte';

// Local Omarchy layer: the selection bar's count opens Show selected (modals/SelectionReviewModal)

const { showModal } = vi.hoisted(() => ({ showModal: vi.fn() }));

vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: showModal },
}));

const count = () => screen.getByRole('button', { name: /selected_count/ });

type BarProps = { reviewActions?: () => ActionItem[] };
// the bar's IconButtons resolve a bits-ui tooltip against a provider: TestWrapper supplies it
const renderBar = (props: BarProps = {}) =>
  render(TestWrapper as Component<{ component: typeof AssetSelectControlBar; componentProps: BarProps }>, {
    component: AssetSelectControlBar,
    componentProps: props,
  });

describe('AssetSelectControlBar', () => {
  beforeEach(() => {
    showModal.mockReset();
    authManager.setPreferences(preferencesFactory.build());
    authManager.setUser(userAdminFactory.build({ id: 'me' }));
    assetMultiSelectManager.selectAssets(timelineAssetFactory.buildList(3));
  });
  afterEach(() => {
    assetMultiSelectManager.clear();
    authManager.reset();
  });

  it('opens Show selected from the count, with the page’s main actions: Share, New album, Add to album', async () => {
    showModal.mockResolvedValue(undefined);
    renderBar();

    await fireEvent.click(count());

    expect(modalManager.show).toHaveBeenCalledWith(SelectionReviewModal, { actions: expect.any(Function) });
    const { actions } = showModal.mock.calls[0][1] as { actions: () => ActionItem[] };
    expect(actions().map(({ title }) => title)).toEqual(['share', 'new_album_from_selection', 'add_to_album_or_space']);
  });

  it('runs the action chosen in the sheet once the sheet is gone', async () => {
    const action: ActionItem = { title: 'share', onAction: vi.fn() };
    const chosen = { action, event: new Event('click') };
    showModal.mockResolvedValue(chosen);
    renderBar({ reviewActions: () => [action] });

    await fireEvent.click(count());

    await waitFor(() => expect(action.onAction).toHaveBeenCalledWith(chosen));
  });

  it('gives the focus back to the count when the sheet closes without an action', async () => {
    showModal.mockResolvedValue(undefined);
    renderBar({ reviewActions: () => [] });

    await fireEvent.click(count());

    await waitFor(() => expect(count()).toHaveFocus());
  });
});
