<script lang="ts">
  // Local Omarchy layer: a right-click menu for photos, like Google Photos / Finder. Right-clicking a photo
  // selects it (unless it is already part of the selection) and opens this menu at the cursor; the items
  // are the selection actions the page passes in, so they act on everything selected. Shift+right-click
  // falls through to the browser's own menu.
  import { contextMenuNavigation } from '$lib/actions/context-menu-navigation';
  import ContextMenu from '$lib/components/shared-components/context-menu/ContextMenu.svelte';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import { optionClickCallbackStore, selectedIdStore } from '$lib/stores/context-menu.store';
  import { generateId } from '$lib/utils/generate-id';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    timelineManager: TimelineManager;
    assetInteraction: AssetMultiSelectManager;
    children: Snippet;
  }

  let { timelineManager, assetInteraction, children }: Props = $props();

  let isOpen = $state(false);
  let position = $state({ x: 0, y: 0 });
  let menuContainer: HTMLUListElement | undefined = $state();
  const menuId = `tile-context-menu-${generateId()}`;

  const close = () => {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    $selectedIdStore = undefined;
  };

  const onContextMenu = (event: MouseEvent) => {
    if (event.shiftKey || !(event.target instanceof Element)) {
      return;
    }
    const tile = event.target.closest<HTMLElement>('[data-thumbnail-focus-container][data-asset]');
    const id = tile?.dataset.asset;
    if (!tile || !id || !document.querySelector('#asset-grid')?.contains(tile)) {
      return;
    }
    const asset = timelineManager.getTimelineMonthByAssetId(id)?.findAssetById({ id });
    if (!asset) {
      return;
    }
    event.preventDefault();
    if (!assetInteraction.hasSelectedAsset(id)) {
      assetInteraction.clear();
      assetInteraction.selectAsset(asset);
    }
    position = { x: event.clientX, y: event.clientY };
    isOpen = true;
    requestAnimationFrame(() => menuContainer?.focus());
  };

  const onDocumentClick = (event: MouseEvent) => {
    if (isOpen && !(event.target instanceof Node && menuContainer?.contains(event.target))) {
      close();
    }
  };

  $effect(() => {
    if (isOpen) {
      $optionClickCallbackStore = close;
    }
  });

  // the menu belongs to the selection: when it goes away (Esc, the bar's ×), so does the menu
  $effect(() => {
    if (!assetInteraction.selectionActive) {
      close();
    }
  });
</script>

<svelte:document oncontextmenu={onContextMenu} onclick={onDocumentClick} />
<svelte:window onscroll={close} onresize={close} />

<div
  class="ws-tile-menu"
  use:contextMenuNavigation={{
    closeDropdown: close,
    container: menuContainer,
    isOpen,
    onEscape: (event: KeyboardEvent) => {
      if (isOpen) {
        event.stopPropagation();
      }
      close();
    },
    openDropdown: () => {},
    selectedId: $selectedIdStore,
    selectionChanged: (id) => ($selectedIdStore = id),
  }}
>
  {#if isOpen}
    <ContextMenu
      direction="right"
      ariaActiveDescendant={$selectedIdStore}
      ariaLabel={$t('menu')}
      bind:menuElement={menuContainer}
      id={menuId}
      isVisible={isOpen}
      x={position.x}
      y={position.y}
    >
      {@render children()}
    </ContextMenu>
  {/if}
</div>
