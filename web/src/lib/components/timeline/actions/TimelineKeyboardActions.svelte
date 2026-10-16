<script lang="ts">
  import { shortcuts, type ShortcutOptions } from '$lib/actions/shortcut';
  import {
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
  import { AssetVisibility, type AlbumResponseDto } from '@immich/sdk';
  import { isModalOpen, modalManager } from '@immich/ui';

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

  const shortcutList = $derived.by(() => {
    if (searchStore.isSearchEnabled || assetViewerManager.isViewing || isModalOpen()) {
      return [];
    }

    const shortcuts: ShortcutOptions[] = [
      { shortcut: { key: '?', shift: true }, onShortcut: handleOpenShortcutModal },
      { shortcut: { key: 'A', ctrl: true }, onShortcut: () => selectAllAssets(timelineManager, assetInteraction) },
      { shortcut: { key: 'ArrowRight' }, onShortcut: () => setFocusTo('earlier', 'asset') },
      { shortcut: { key: 'ArrowLeft' }, onShortcut: () => setFocusTo('later', 'asset') },
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
