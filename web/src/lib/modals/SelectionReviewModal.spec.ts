import type { ActionItem } from '@immich/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { getVisualViewportMock } from '$lib/__mocks__/visual-viewport.mock';
import { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import SelectionReviewModal from './SelectionReviewModal.svelte';

// Local Omarchy layer: Show selected, the review of a selection from the selection bar's count

const selectionOf = (assets: TimelineAsset[]) => {
  const selection = new AssetMultiSelectManager();
  selection.selectAssets(assets);
  return selection;
};

const action = (title: string, key?: string, enabled = true): ActionItem => ({
  title,
  onAction: vi.fn(),
  ...(key && { shortcuts: [{ key }] }),
  $if: () => enabled,
});

const tiles = () => screen.getAllByRole('option');
const tileOf = (asset: TimelineAsset) => document.querySelector<HTMLElement>(`#ws-review-${asset.id}`)!;

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
  vi.stubGlobal('visualViewport', getVisualViewportMock());
  Element.prototype.animate = getAnimateMock();
  Element.prototype.scrollIntoView = vi.fn();
});

// bits-ui releases the body's scroll lock on a timer; let it run before happy-dom goes
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('SelectionReviewModal', () => {
  it('shows just the selected photos, each in the selection, under the count', () => {
    const assets = timelineAssetFactory.buildList(3);
    render(SelectionReviewModal, { onClose: vi.fn(), selection: selectionOf(assets) });

    expect(tiles()).toHaveLength(3);
    for (const tile of tiles()) {
      expect(tile).toHaveAttribute('aria-selected', 'true');
    }
    expect(screen.getByText('selection_review_hint')).toBeInTheDocument();
  });

  it('takes a clicked photo out of the page’s selection at once, and a second click puts it back', async () => {
    const assets = timelineAssetFactory.buildList(3);
    const selection = selectionOf(assets);
    selection.selectAll = true;
    render(SelectionReviewModal, { onClose: vi.fn(), selection });

    await fireEvent.click(tileOf(assets[1]));
    expect(selection.hasSelectedAsset(assets[1].id)).toBe(false);
    expect(selection.assets).toHaveLength(2);
    expect(selection.selectAll).toBe(false);
    // it stays in the sheet, faded, to be put back
    expect(tileOf(assets[1])).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('selection_review_left_out')).toBeInTheDocument();

    await fireEvent.click(tileOf(assets[1]));
    expect(selection.hasSelectedAsset(assets[1].id)).toBe(true);
    expect(tileOf(assets[1])).toHaveAttribute('aria-selected', 'true');
  });

  it('puts every photo left out back at once', async () => {
    const assets = timelineAssetFactory.buildList(4);
    const selection = selectionOf(assets);
    render(SelectionReviewModal, { onClose: vi.fn(), selection });

    await fireEvent.click(tileOf(assets[0]));
    await fireEvent.click(tileOf(assets[2]));
    expect(selection.assets).toHaveLength(2);

    await fireEvent.click(screen.getByRole('button', { name: 'selection_review_put_back' }));
    expect(selection.assets).toHaveLength(4);
    expect(screen.queryByText('selection_review_left_out')).toBeNull();
  });

  it('is worked by keys: the arrows move, Space toggles, Delete only ever leaves out', async () => {
    const assets = timelineAssetFactory.buildList(3);
    const selection = selectionOf(assets);
    render(SelectionReviewModal, { onClose: vi.fn(), selection });
    const grid = screen.getByRole('listbox');

    await fireEvent.keyDown(grid, { key: 'ArrowRight' });
    await waitFor(() => expect(tileOf(assets[1])).toHaveAttribute('tabindex', '0'));
    expect(tileOf(assets[0])).toHaveAttribute('tabindex', '-1');

    await fireEvent.keyDown(grid, { key: ' ' });
    expect(selection.hasSelectedAsset(assets[1].id)).toBe(false);
    await fireEvent.keyDown(grid, { key: 'Delete' });
    expect(selection.hasSelectedAsset(assets[1].id)).toBe(false);
    await fireEvent.keyDown(grid, { key: 'Enter' });
    expect(selection.hasSelectedAsset(assets[1].id)).toBe(true);
  });

  it('draws only a screenful of a big selection', () => {
    const assets = timelineAssetFactory.buildList(5000);
    render(SelectionReviewModal, { onClose: vi.fn(), selection: selectionOf(assets) });

    expect(tiles().length).toBeGreaterThan(0);
    expect(tiles().length).toBeLessThan(200);
    expect(tiles()[0]).toHaveAttribute('aria-setsize', '5000');
  });

  it('offers the page’s actions and closes with the chosen one, for the bar to run once the sheet is gone', async () => {
    const assets = timelineAssetFactory.buildList(2);
    const share = action('share');
    const add = action('add_to_album_or_space', 'l');
    const hidden = action('not_here', undefined, false);
    const onClose = vi.fn();
    render(SelectionReviewModal, { onClose, selection: selectionOf(assets), actions: () => [share, add, hidden] });

    expect(screen.queryByRole('button', { name: 'not_here' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'share' }));
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ action: share }));
    expect(share.onAction).not.toHaveBeenCalled();
  });

  it('runs an action by its key, as on the page behind', async () => {
    const assets = timelineAssetFactory.buildList(2);
    const add = action('add_to_album_or_space', 'l');
    const onClose = vi.fn();
    render(SelectionReviewModal, { onClose, selection: selectionOf(assets), actions: () => [add] });

    await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'l' });
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ action: add }));
  });

  it('offers no action once every photo is left out', async () => {
    const assets = timelineAssetFactory.buildList(1);
    render(SelectionReviewModal, {
      onClose: vi.fn(),
      selection: selectionOf(assets),
      actions: () => [action('share')],
    });

    expect(screen.getByRole('button', { name: 'share' })).toBeInTheDocument();
    await fireEvent.click(tileOf(assets[0]));
    expect(screen.queryByRole('button', { name: 'share' })).toBeNull();
  });

  it('closes with Done, and with Escape, without an action', async () => {
    const onClose = vi.fn();
    render(SelectionReviewModal, { onClose, selection: selectionOf(timelineAssetFactory.buildList(2)) });

    await fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(onClose).toHaveBeenLastCalledWith();

    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(onClose).toHaveBeenLastCalledWith();
  });
});
