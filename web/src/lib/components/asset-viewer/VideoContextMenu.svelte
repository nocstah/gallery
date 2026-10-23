<script lang="ts">
  import ContextMenu from '$lib/components/shared-components/context-menu/ContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { shareVideos } from '$lib/managers/share-video-manager.svelte';
  import { optionClickCallbackStore, selectedIdStore } from '$lib/stores/context-menu.store';
  import { canShareVideo } from '$lib/utils/share-video';
  import type { ShareApp } from '$lib/utils/curator';
  import type { AssetResponseDto } from '@immich/sdk';
  import { mdiSendOutline, mdiWhatsapp } from '@mdi/js';
  import { tick, untrack, type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  let { asset, children }: { asset: AssetResponseDto; children: Snippet } = $props();
  let container: HTMLDivElement;
  let menu: HTMLUListElement | undefined = $state();
  let opened = $state<{ asset: AssetResponseDto; x: number; y: number }>();
  let returnFocus: HTMLElement | undefined;

  const close = (restoreFocus = false) => {
    if (!opened) {
      return;
    }
    opened = undefined;
    $selectedIdStore = undefined;
    if (restoreFocus && returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
  };

  const open = async (event: MouseEvent) => {
    if (!(event.target instanceof Node) || !container.contains(event.target)) {
      return;
    }
    close();
    // Shift+right-click retains the browser's video menu, as it does on a thumbnail.
    if (event.shiftKey || !canShareVideo(asset)) {
      return;
    }
    event.preventDefault();
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const next = { asset, x: event.clientX, y: event.clientY };
    opened = next;
    $selectedIdStore = undefined;
    $optionClickCallbackStore = () => close(true);
    await tick();
    if (opened?.asset.id === next.asset.id) {
      menu?.focus({ preventScroll: true });
    }
  };

  // MenuOption dismisses the menu before calling the action. Capture the asset while rendering, before `opened`
  // is cleared; reading a reactive menu value inside the click callback would lose the video.
  const downloadFor = (video: AssetResponseDto, app: ShareApp) => () => {
    close(true);
    shareVideos.start(video.id, app, video.originalFileName);
  };

  // The menu owns these keys before the player's and viewer's shortcuts see them. In particular Escape closes
  // just the menu, and Space downloads without also starting or stopping playback.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!opened) {
      return;
    }
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const current = items.findIndex((item) => item.id === $selectedIdStore);
    if (event.key === 'Tab' || event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (items.length === 0) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        items[Math.max(0, current)]?.click();
        return;
      }
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : event.key === 'ArrowDown'
              ? (current + 1) % items.length
              : (current === -1 ? items.length - 1 : current - 1 + items.length) % items.length;
      $selectedIdStore = items[index].id;
      items[index].scrollIntoView({ block: 'nearest' });
    }
  };

  $effect(() => {
    // Navigating to another video or signing out dismisses a menu for the old asset.
    void asset.id;
    void canShareVideo(asset);
    untrack(() => close());
  });

  $effect(() => {
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  });
</script>

<svelte:document oncontextmenu={open} onfullscreenchange={() => close()} />
<svelte:window onresize={() => close()} onscroll={() => close()} />

<div class="contents" bind:this={container}>
  {@render children()}
</div>

{#if opened}
  <ContextMenu
    isVisible
    portal
    x={opened.x}
    y={opened.y}
    ariaLabel={$t('download')}
    ariaActiveDescendant={$selectedIdStore}
    bind:menuElement={menu}
    onClose={() => close()}
  >
    <MenuOption
      icon={mdiWhatsapp}
      text={$t('download_for_app', { values: { app: 'WhatsApp' } })}
      onClick={downloadFor(opened.asset, 'whatsapp')}
    />
    <MenuOption
      icon={mdiSendOutline}
      text={$t('download_for_app', { values: { app: 'Telegram' } })}
      onClick={downloadFor(opened.asset, 'telegram')}
    />
  </ContextMenu>
{/if}
