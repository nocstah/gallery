import { AssetVisibility } from '@immich/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { addMessages, locale } from 'svelte-i18n';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import LockedPhotoContextMenu from './LockedPhotoContextMenu.svelte';

const { confirm, move, remove } = vi.hoisted(() => ({ confirm: vi.fn(), move: vi.fn(), remove: vi.fn() }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: true, isSharedLink: false, user: { id: 'me', isAdmin: true } },
}));
vi.mock('$lib/utils/curator', () => ({ curatorIsMine: () => true }));
vi.mock('$lib/utils/locked-companions', () => ({ setLockedWithCompanions: move }));
vi.mock('$lib/utils/actions', () => ({ deleteAssets: remove }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { showDialog: confirm, show: confirm },
}));

const assets = [
  timelineAssetFactory.build({ id: 'private-one', ownerId: 'me', visibility: AssetVisibility.Locked }),
  timelineAssetFactory.build({ id: 'private-two', ownerId: 'me', visibility: AssetVisibility.Locked }),
];
let grid: HTMLDivElement;
const timelineManager = {
  getTimelineMonthByAssetId: () => ({
    findAssetById: ({ id }: { id: string }) => assets.find((asset) => asset.id === id),
  }),
} as unknown as TimelineManager;

beforeEach(async () => {
  vi.clearAllMocks();
  assetMultiSelectManager.clear();
  addMessages('en', {
    menu: 'Menu',
    download: 'Download',
    change_date: 'Change date',
    change_location: 'Change location',
    change_description: 'Change description',
    move_off_locked_folder: 'Move out of Locked Folder',
    permanently_delete: 'Permanently delete',
    copy_subject: 'Copy subject',
    download_for_app: 'Download for {app}',
  });
  await locale.set('en');
  grid = document.createElement('div');
  grid.id = 'asset-grid';
  for (const asset of assets) {
    const tile = document.createElement('button');
    tile.dataset.thumbnailFocusContainer = '';
    tile.dataset.asset = asset.id;
    tile.textContent = asset.id;
    grid.append(tile);
  }
  document.body.append(grid);
});

afterEach(() => {
  cleanup();
  grid.remove();
  assetMultiSelectManager.clear();
});

it('offers the local photo actions and selects the right-clicked photo', async () => {
  render(LockedPhotoContextMenu, { timelineManager, onRemove: vi.fn() });
  await fireEvent.contextMenu(screen.getByRole('button', { name: assets[1].id }));
  await screen.findByRole('menu');
  for (const name of [
    'Download',
    'Change location',
    'Change description',
    'Move out of Locked Folder',
    'Permanently delete',
  ]) {
    expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
  }
  expect(screen.queryByRole('menuitem', { name: /Copy subject|Download for|Share|album/i })).not.toBeInTheDocument();
  expect(assetMultiSelectManager.assets.map(({ id }) => id)).toEqual([assets[1].id]);
});

it('moves an existing selection only after confirmation and removes companion photos from the grid', async () => {
  const onRemove = vi.fn();
  assetMultiSelectManager.selectAssets(assets);
  confirm.mockResolvedValue(true);
  move.mockResolvedValue([...assets.map(({ id }) => id), 'live-photo-clip']);
  render(LockedPhotoContextMenu, { timelineManager, onRemove });
  await fireEvent.contextMenu(screen.getByRole('button', { name: assets[0].id }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Move out of Locked Folder' }));
  await waitFor(() =>
    expect(move).toHaveBeenCalledWith(
      assets.map(({ id }) => id),
      true,
    ),
  );
  expect(confirm).toHaveBeenCalledOnce();
  expect(onRemove).toHaveBeenCalledWith(['private-one', 'private-two', 'live-photo-clip']);
});

it('leaves a photo locked when the move is cancelled', async () => {
  confirm.mockResolvedValue(false);
  const onRemove = vi.fn();
  render(LockedPhotoContextMenu, { timelineManager, onRemove });
  await fireEvent.contextMenu(screen.getByRole('button', { name: assets[0].id }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Move out of Locked Folder' }));
  expect(move).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
});

it('uses the same permanent-delete action as the Locked Folder toolbar', async () => {
  confirm.mockResolvedValue(true);
  const onRemove = vi.fn();
  render(LockedPhotoContextMenu, { timelineManager, onRemove });
  await fireEvent.contextMenu(screen.getByRole('button', { name: assets[0].id }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Permanently delete' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(true, onRemove, [assets[0]], undefined));
});
