<script lang="ts">
  import { shortcuts, type ShortcutOptions } from '$lib/actions/shortcut';
  import {
    focusAsset,
    setFocusToAsset as setFocusAssetInit,
    setFocusTo as setFocusToInit,
  } from '$lib/components/timeline/actions/focus-actions';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import { offeredSpecialAlbums, specialAlbumOf, type SpecialAlbumManager } from '$lib/managers/special-albums.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import AssetDeleteConfirmModal from '$lib/modals/AssetDeleteConfirmModal.svelte';
  import NavigateToDateModal from '$lib/modals/NavigateToDateModal.svelte';
  import ShortcutsModal from '$lib/modals/ShortcutsModal.svelte';
  import { handleStack } from '$lib/services/stack.service';
  import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';
  import { showDeleteModal } from '$lib/stores/preferences.store';
  import { searchStore } from '$lib/stores/search.svelte';
  import { handlePromiseError } from '$lib/utils';
  import { deleteAssets } from '$lib/utils/actions';
  import { holdQuickTrash, quickTrash } from '$lib/utils/quick-trash';
  import { archiveAssets, selectAllAssets } from '$lib/utils/asset-utils';
  import { revealDelta, rowNeighbour, rowOf } from '$lib/utils/grid-rows';
  import { AssetVisibility, type AlbumResponseDto } from '@immich/sdk';
  import { isModalOpen, modalManager } from '@immich/ui';
  import { tick } from 'svelte';

  type Props = {
    timelineManager: TimelineManager;
    assetInteraction: AssetMultiSelectManager;
    onEscape?: () => void;
    scrollToAsset: (asset: TimelineAsset) => boolean;
    /** the album the timeline shows, if any (inside a special album its key takes photos out) */
    album?: AlbumResponseDto | null;
  };

  let { timelineManager = $bindable(), assetInteraction, onEscape, scrollToAsset, album = null }: Props = $props();

  const trashOrDelete = async (forceRequested?: boolean) => {
    const force = forceRequested || !featureFlagsManager.value.trash;
    const selectedAssets = assetInteraction.assets;

    if ($showDeleteModal && force) {
      const confirmed = await modalManager.show(AssetDeleteConfirmModal, { size: selectedAssets.length });
      if (!confirmed) {
        return;
      }
    }

    await deleteAssets(
      force,
      (assetIds) => timelineManager.removeAssets(assetIds),
      selectedAssets,
      force ? undefined : (assets) => timelineManager.upsertAssets(assets),
    );
    assetInteraction.clear();
  };

  const onDelete = () => {
    const hasTrashedAsset = assetInteraction.assets.some((asset) => asset.isTrashed);
    handlePromiseError(trashOrDelete(hasTrashedAsset));
  };

  // Local Omarchy layer: Shift + middle-click trashes the tile under the pointer (lib/utils/quick-trash.ts)
  const onQuickTrash = (event: MouseEvent) => {
    if (assetViewerManager.isViewing || isModalOpen()) {
      return;
    }
    quickTrash(
      event,
      (id) => timelineManager.getTimelineMonthByAssetId(id)?.findAssetById({ id }),
      (assetIds) => {
        timelineManager.removeAssets(assetIds);
        for (const id of assetIds) {
          assetInteraction.removeAssetFromMultiselectGroup(id);
        }
      },
      (assets) => timelineManager.upsertAssets(assets),
    );
  };

  const onStackAssets = async () => {
    await handleStack(assetInteraction.assets.map((asset) => asset.id));
    onEscape?.();
  };

  const toggleArchive = async () => {
    const visibility = assetInteraction.isAllArchived ? AssetVisibility.Timeline : AssetVisibility.Archive;
    const ids = await archiveAssets(assetInteraction.assets, visibility);
    timelineManager.update(ids, (asset) => (asset.visibility = visibility));
    eventManager.emit('AssetsArchive', ids);
    assetInteraction.clear();
  };

  // Local Omarchy layer: with nothing selected, a special album's key acts on the photo under the pointer (its tile
  // wears the accent border: hover is focus here), or else on the one keyboard focus is on
  const pointedAsset = () => {
    const tile =
      document.querySelector<HTMLElement>('[data-thumbnail-focus-container][data-asset]:hover') ??
      document.activeElement?.closest<HTMLElement>('[data-thumbnail-focus-container][data-asset]');
    const id = tile?.dataset.asset;
    return id ? timelineManager.getTimelineMonthByAssetId(id)?.findAssetById({ id }) : undefined;
  };

  // Local Omarchy layer: a special album's key (B To do, V Villa: managers/special-albums) moves the selection, or the
  // photo under the pointer, in, and inside that album takes it out; the photos it archives leave a timeline that shows
  // none, as after Shift+A
  const toggleSpecial = async (special: SpecialAlbumManager) => {
    const selected = assetInteraction.selectionActive;
    const pointed = selected ? undefined : pointedAsset();
    // someone else's photo goes by its id alone, so the album says it can't take it
    const own = (asset: TimelineAsset) => authManager.authenticated && asset.ownerId === authManager.user.id;
    const assets = selected
      ? assetInteraction.getOwnedAssets()
      : pointed
        ? [own(pointed) ? pointed : { id: pointed.id }]
        : [];
    if (assets.length === 0) {
      return;
    }
    if (specialAlbumOf(album?.id) === special) {
      if ((await special.done(assets)) && selected) {
        assetInteraction.clear();
      }
      return;
    }
    const moved = await special.move(assets);
    if (moved) {
      timelineManager.update(moved.archived, (asset) => (asset.visibility = AssetVisibility.Archive));
      eventManager.emit('AssetsArchive', moved.archived);
      if (selected) {
        assetInteraction.clear();
      }
    }
  };

  const onSelectStart = (e: Event) => {
    if (!searchStore.isSearchEnabled && assetInteraction.selectionActive && keyboardManager.shift) {
      e.preventDefault();
    }
  };

  const isEmpty = $derived(timelineManager.isInitialized && timelineManager.months.length === 0);
  let isShortcutModalOpen = false;

  const handleOpenShortcutModal = async () => {
    if (isShortcutModalOpen) {
      return;
    }

    isShortcutModalOpen = true;
    await modalManager.show(ShortcutsModal, {});
    isShortcutModalOpen = false;
  };

  $effect(() => {
    if (isEmpty) {
      assetInteraction.clear();
    }
  });

  const setFocusTo = setFocusToInit.bind(undefined, scrollToAsset, timelineManager);
  const setFocusAsset = setFocusAssetInit.bind(undefined, scrollToAsset);

  const handleOpenDateModal = async () => {
    const asset = await modalManager.show(NavigateToDateModal, { timelineManager });
    if (asset) {
      setFocusAsset(asset);
    }
  };

  // Local Omarchy layer: ↑ and ↓ move to the photo above or below, read from the rows as they are drawn
  // (utils/grid-rows: months share rows, so the order cannot say which photo is above), Home and End to the first and
  // last photo, each brought wholly into view clear of a glass bar over the grid. With no photo focused the keys stay
  // the page's (they scroll it)
  const TILE = '[data-thumbnail-focus-container][data-asset]';
  const focusedTile = () => {
    const focus = document.activeElement;
    return focus instanceof HTMLElement && focus.matches(TILE) ? focus : undefined;
  };

  // the part of the grid nothing floats over: below the bar and the timeline's header rows when they are glass over it
  // (Settings › Theme › Chrome), the grid's own box otherwise (they stand above it then)
  const clearBand = (grid: HTMLElement) => {
    const box = grid.getBoundingClientRect();
    let top = box.top;
    for (const over of [document.querySelector('#dashboard-navbar'), ...(grid.parentElement?.children ?? [])]) {
      if (!over || over === grid || over.classList.contains('absolute')) {
        continue;
      }
      const rect = over.getBoundingClientRect();
      if (rect.height > 0 && rect.top < box.top + box.height / 2) {
        top = Math.max(top, rect.bottom);
      }
    }
    return { top, bottom: box.bottom };
  };

  const reveal = (tile: HTMLElement) => {
    const grid = tile.closest<HTMLElement>('#asset-grid');
    const delta = grid ? revealDelta(tile.getBoundingClientRect(), clearBand(grid)) : 0;
    if (delta !== 0) {
      timelineManager.scrollBy(delta);
    }
  };

  const focusAndReveal = async (asset: TimelineAsset) => {
    if (!scrollToAsset(asset)) {
      return;
    }
    await tick();
    focusAsset(asset.id);
    const tile = focusedTile();
    if (tile) {
      reveal(tile);
    }
  };

  let rowMoving = false;
  const moveByRow = async (direction: 'up' | 'down', event: KeyboardEvent) => {
    const from = focusedTile();
    if (!from) {
      return;
    }
    event.preventDefault();
    if (rowMoving) {
      return;
    }
    const tiles = [...(from.closest('#asset-grid') ?? document).querySelectorAll<HTMLElement>(TILE)];
    const boxes = tiles.map((tile) => tile.getBoundingClientRect());
    const here = from.getBoundingClientRect();
    const index = rowNeighbour(boxes, here, direction);
    if (index !== undefined) {
      tiles[index].focus({ preventScroll: true });
      reveal(tiles[index]);
      return;
    }
    // no row drawn beyond this one (its month is still loading, or this is the end): the photo past this row's end,
    // as → or ← would reach it, which loads its month
    const row = rowOf(boxes, here).map((at) => tiles[at]);
    const id = (direction === 'down' ? row.at(-1) : row[0])?.dataset.asset;
    if (!id) {
      return;
    }
    rowMoving = true;
    try {
      const asset =
        direction === 'down'
          ? await timelineManager.getEarlierAsset({ id }, 'asset')
          : await timelineManager.getLaterAsset({ id }, 'asset');
      if (asset) {
        await focusAndReveal(asset);
      }
    } finally {
      rowMoving = false;
    }
  };

  const moveToEnd = async (end: 'first' | 'last', event: KeyboardEvent) => {
    if (!focusedTile()) {
      return;
    }
    event.preventDefault();
    for await (const asset of timelineManager.assetsIterator({ direction: end === 'first' ? 'earlier' : 'later' })) {
      await focusAndReveal(asset);
      break;
    }
  };

  const shortcutList = $derived.by(() => {
    if (searchStore.isSearchEnabled || assetViewerManager.isViewing || isModalOpen()) {
      return [];
    }

    const shortcuts: ShortcutOptions[] = [
      { shortcut: { key: '?', shift: true }, onShortcut: handleOpenShortcutModal },
      { shortcut: { key: 'A', ctrl: true }, onShortcut: () => selectAllAssets(timelineManager, assetInteraction) },
      { shortcut: { key: 'ArrowRight' }, onShortcut: () => setFocusTo('earlier', 'asset') },
      { shortcut: { key: 'ArrowLeft' }, onShortcut: () => setFocusTo('later', 'asset') },
      // Local Omarchy layer: by the rows as drawn; left to the page (they scroll) while no photo is focused
      { shortcut: { key: 'ArrowDown' }, preventDefault: false, onShortcut: (event) => moveByRow('down', event) },
      { shortcut: { key: 'ArrowUp' }, preventDefault: false, onShortcut: (event) => moveByRow('up', event) },
      { shortcut: { key: 'Home' }, preventDefault: false, onShortcut: (event) => moveToEnd('first', event) },
      { shortcut: { key: 'End' }, preventDefault: false, onShortcut: (event) => moveToEnd('last', event) },
      { shortcut: { key: 'D' }, onShortcut: () => setFocusTo('earlier', 'day') },
      { shortcut: { key: 'M' }, onShortcut: () => setFocusTo('earlier', 'month') },
      { shortcut: { key: 'M', shift: true }, onShortcut: () => setFocusTo('later', 'month') },
      { shortcut: { key: 'Y' }, onShortcut: () => setFocusTo('earlier', 'year') },
      { shortcut: { key: 'Y', shift: true }, onShortcut: () => setFocusTo('later', 'year') },
      { shortcut: { key: 'G' }, onShortcut: handleOpenDateModal },
    ];
    if (onEscape) {
      shortcuts.push({ shortcut: { key: 'Escape' }, onShortcut: onEscape });
    }
    // Local Omarchy layer: the special albums' keys, for the selection or the photo under the pointer
    for (const special of offeredSpecialAlbums()) {
      shortcuts.push({ shortcut: { key: special.shortcut }, onShortcut: () => toggleSpecial(special) });
    }

    if (assetInteraction.selectionActive) {
      shortcuts.push(
        { shortcut: { key: 'Delete' }, onShortcut: onDelete },
        { shortcut: { key: 'Delete', shift: true }, onShortcut: () => trashOrDelete(true) },
        { shortcut: { key: 'D', ctrl: true }, onShortcut: () => assetInteraction.clear() },
        // Local Omarchy layer: Shift+S, not plain s - with drag-select a stray keypress stacked big selections
        { shortcut: { key: 'S', shift: true }, onShortcut: () => onStackAssets() },
        { shortcut: { key: 'a', shift: true }, onShortcut: toggleArchive },
      );
    } else {
      // conflicting shortcuts
      shortcuts.push({ shortcut: { key: 'D', shift: true }, onShortcut: () => setFocusTo('later', 'day') });
    }

    return shortcuts;
  });
</script>

<svelte:document
  onselectstart={onSelectStart}
  use:shortcuts={shortcutList}
  onmousedowncapture={holdQuickTrash}
  onauxclickcapture={onQuickTrash}
/>
