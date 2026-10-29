import type { ActionItem } from '@immich/ui';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { addMessages, locale, t } from 'svelte-i18n';
import { get } from 'svelte/store';
import en from '$i18n/en.json';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import AssetDeleteConfirmModal from '$lib/modals/AssetDeleteConfirmModal.svelte';
import { getStackActions } from '$lib/services/stack.service';
import { getTrashActions } from '$lib/services/trash.service';
import { deleteAssets } from '$lib/utils/actions';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';

// Local Omarchy layer: outside Main every destructive confirmation names the library, and so does the toast after a
// move to the trash, which has no confirmation of its own: emptying the trash, deleting for good, keeping one photo of
// a stack and deleting the others. In Main they read exactly as before.

const mocks = vi.hoisted(() => ({
  showDialog: vi.fn(() => Promise.resolve(false)),
  primary: vi.fn(),
  deleteBulk: vi.fn(() => Promise.resolve()),
}));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { showDialog: mocks.showDialog, show: vi.fn() },
  toastManager: { primary: mocks.primary, warning: vi.fn(), danger: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  deleteAssets: mocks.deleteBulk,
}));
vi.mock('$lib/utils/stack-covers', () => ({
  handOverCovers: vi.fn(() => Promise.resolve([])),
  announceCovers: vi.fn(),
  restoreCovers: vi.fn(() => Promise.resolve()),
}));

const library = (main: boolean) => loadLibraryContext(serving(libraryContextFile(main ? mainLibrary : secondLibrary)));

beforeAll(() => {
  addMessages(get(locale) ?? 'dev', {
    libraries_named: en.libraries_named,
    empty_trash_confirmation: 'Empty the trash?',
    permanently_delete_assets_count: 'Permanently delete {count, plural, one {photo} other {photos}}',
    assets_trashed_count: 'Trashed {count, plural, one {# photo} other {# photos}}',
    keep_this_delete_others: 'Keep this, delete others',
  });
});

beforeEach(() => {
  resetLibraryContext();
  mocks.showDialog.mockClear();
  mocks.primary.mockClear();
  mocks.deleteBulk.mockClear();
});

afterEach(() => {
  resetLibraryContext();
});

const asked = () =>
  mocks.showDialog.mock.calls.map((call) => (call as unknown[])[0] as { title?: string; prompt?: string });
const run = (action: ActionItem) => action.onAction({ action, event: new Event('click') });

describe('emptying the trash', () => {
  it('names the library in its question outside Main', async () => {
    await library(false);
    await run(getTrashActions(get(t), 3).Empty);

    expect(asked()[0].prompt).toBe('Second: Empty the trash?');
  });

  it('asks as before in Main', async () => {
    await library(true);
    await run(getTrashActions(get(t), 3).Empty);

    expect(asked()[0].prompt).toBe('Empty the trash?');
  });
});

describe('deleting for good', () => {
  const renderModal = () =>
    render(TestWrapper as Component<{ component: typeof AssetDeleteConfirmModal; componentProps: object }>, {
      component: AssetDeleteConfirmModal,
      componentProps: { size: 3, onClose: vi.fn() },
    });

  it("names the library in the confirmation's title outside Main", async () => {
    await library(false);
    renderModal();

    expect(await screen.findByText('Second: Permanently delete photos')).toBeInTheDocument();
  });

  it('is titled as before in Main', async () => {
    await library(true);
    renderModal();

    expect(await screen.findByText('Permanently delete photos')).toBeInTheDocument();
    expect(screen.queryByText(/^Main:/)).not.toBeInTheDocument();
  });
});

describe('a move to the trash', () => {
  const assets = [{ id: 'a1' }, { id: 'a2' }] as TimelineAsset[];

  it('names the library in the toast after it outside Main', async () => {
    await library(false);
    await deleteAssets(false, vi.fn(), assets);

    expect(mocks.deleteBulk).toHaveBeenCalledWith({ assetBulkDeleteDto: { ids: ['a1', 'a2'], force: false } });
    expect(mocks.primary).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Second: Trashed 2 photos' }),
      expect.anything(),
    );
  });

  it('says as before in Main', async () => {
    await library(true);
    await deleteAssets(false, vi.fn(), assets);

    expect(mocks.primary).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Trashed 2 photos' }),
      expect.anything(),
    );
  });
});

describe('keeping one photo of a stack and deleting the others', () => {
  it('names the library in the title outside Main', async () => {
    await library(false);
    const stack = { id: 'stack', primaryAssetId: 'a1', assets: [{ id: 'a1' }, { id: 'a2' }] };
    const { KeepThisDeleteOthers } = getStackActions(get(t), stack as never, { id: 'a2' } as never);
    await run(KeepThisDeleteOthers);

    expect(asked()[0].title).toBe('Second: Keep this, delete others');
  });
});
