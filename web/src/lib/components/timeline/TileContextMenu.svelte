<script lang="ts">
  // Local Omarchy layer: a right-click menu for photos, like Google Photos / Finder. Right-clicking a photo
  // selects it (unless it is already part of the selection) and opens this menu at the cursor; the items
  // are the selection actions the page passes in, so they act on everything selected. A single photo that
  // belongs to a stack also gets the stack's own items: its cover expands or collapses it, any other photo
  // can become the cover (timeline only). Works on any photo grid: the page says where the grid is and how to
  // find a photo by id, so search results get it too. Shift+right-click falls through to the browser's own menu.
  import { contextMenuNavigation } from '$lib/actions/context-menu-navigation';
  import ContextMenu from '$lib/components/shared-components/context-menu/ContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { stackExpandManager } from '$lib/managers/stack-expand-manager.svelte';
  import { thumbnailZoomManager } from '$lib/managers/thumbnail-zoom-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { optionClickCallbackStore, selectedIdStore } from '$lib/stores/context-menu.store';
  import { generateId } from '$lib/utils/generate-id';
  import { getAssetInfo } from '@immich/sdk';
  import { mdiArrowCollapseHorizontal, mdiArrowExpandHorizontal, mdiImageCheckOutline } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    /** the photo grid the menu serves, as a selector */
    grid: string;
    findAsset: (id: string) => TimelineAsset | undefined;
    /** the stack items (expand, collapse, make cover), which only the timeline can show the result of */
    withStackItems?: boolean;
    assetInteraction: AssetMultiSelectManager;
    children: Snippet;
  }

  let { grid, findAsset, withStackItems = true, assetInteraction, children }: Props = $props();

  let isOpen = $state(false);
  let position = $state({ x: 0, y: 0 });
  let menuContainer: HTMLUListElement | undefined = $state();
  const menuId = `tile-context-menu-${generateId()}`;

  type StackMenu = { stackId: string; assetId: string; isCover: boolean };
  let stackMenu = $state<StackMenu | undefined>();
  let selectedByMenu = false;
  let opening = 0;

  const resolveStack = async (asset: TimelineAsset): Promise<StackMenu | undefined> => {
    const user = authManager.authenticated ? authManager.user : undefined;
    if (!user || asset.ownerId !== user.id) {
      return;
    }
    if (asset.stack) {
      return { stackId: asset.stack.id, assetId: asset.id, isCover: true };
    }
    const stackId = stackExpandManager.stackOf(asset.id);
    if (stackId) {
      return { stackId, assetId: asset.id, isCover: false };
    }
    if (!thumbnailZoomManager.expandStacks) {
      return;
    }
    // with every stack spread out the timeline carries no stack data, so ask the server
    try {
      const { stack } = await getAssetInfo({ id: asset.id });
      if (stack && stack.primaryAssetId !== asset.id) {
        return { stackId: stack.id, assetId: asset.id, isCover: false };
      }
    } catch {
      // no stack items then
    }
  };

  const open = async (asset: TimelineAsset, x: number, y: number) => {
    const token = ++opening;
    // the stack items act on one photo
    const next = withStackItems && assetInteraction.assets.length === 1 ? await resolveStack(asset) : undefined;
    if (token !== opening) {
      return;
    }
    stackMenu = next;
    position = { x, y };
    isOpen = true;
    requestAnimationFrame(() => menuContainer?.focus());
  };

  const onStackAction = (action: () => Promise<void>) => {
    if (selectedByMenu) {
      assetInteraction.clear();
    }
    void action();
  };

  const close = () => {
    // also drops an open that is still waiting on the server
    opening++;
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
    if (!tile || !id || !document.querySelector(grid)?.contains(tile)) {
      return;
    }
    const asset = findAsset(id);
    if (!asset) {
      return;
    }
    event.preventDefault();
    selectedByMenu = !assetInteraction.hasSelectedAsset(id);
    if (selectedByMenu) {
      assetInteraction.clear();
      assetInteraction.selectAsset(asset);
    }
    void open(asset, event.clientX, event.clientY);
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
      {#if stackMenu}
        {@const menu = stackMenu}
        {#if menu.isCover}
          {@const expanded = stackExpandManager.isExpanded(menu.stackId)}
          <MenuOption
            icon={expanded ? mdiArrowCollapseHorizontal : mdiArrowExpandHorizontal}
            text={expanded ? $t('collapse_stack') : $t('expand_stack')}
            onClick={() => onStackAction(() => stackExpandManager.toggle(menu.stackId, menu.assetId))}
          />
        {:else}
          <MenuOption
            icon={mdiImageCheckOutline}
            text={$t('make_stack_cover')}
            onClick={() => onStackAction(() => stackExpandManager.makeCover(menu.stackId, menu.assetId))}
          />
        {/if}
        <hr />
      {/if}
      {@render children()}
    </ContextMenu>
  {/if}
</div>

<style>
  /* compact: smaller type and rows than Gallery's dropdowns, and no grow-in, so it is simply there at the cursor */
  .ws-tile-menu :global(> div) {
    transition: none !important;
  }
  .ws-tile-menu :global([role='menuitem']) {
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    gap: 0.625rem;
  }
  .ws-tile-menu :global([role='menuitem'] svg) {
    width: 16px;
    height: 16px;
  }
  .ws-tile-menu :global(hr) {
    margin-block: 0.125rem;
  }
</style>
