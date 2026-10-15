<script lang="ts">
  // Local Omarchy layer: a right-click menu for photos, like Google Photos / Finder. Right-clicking a photo
  // selects it (unless it is already part of the selection) and opens this menu at the cursor; the items
  // are the selection actions the page passes in, so they act on everything selected. A single photo that
  // belongs to a stack also gets the stack's own items: its cover expands or collapses it, any other photo
  // can become the cover or collapse it (timeline only). Works on any photo grid: the page says where the grid is and how to
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
  import { getAssetMediaUrl } from '$lib/utils';
  import { fromTimelinePlainDateTime } from '$lib/utils/timeline-util';
  import { AssetMediaSize, AssetVisibility, getAssetInfo } from '@immich/sdk';
  import { revealInPhotos } from '$lib/utils/reveal';
  import { goto } from '$app/navigation';
  import { stackPick } from '$lib/components/curator/stack-pick.svelte';
  import { copySubject } from '$lib/utils/copy-subject';
  import { lookUp } from '$lib/components/curator/look-up.svelte';
  import { shareVideos } from '$lib/managers/share-video-manager.svelte';
  import {
    mdiArrowCollapseHorizontal,
    mdiArrowExpandHorizontal,
    mdiContentCut,
    mdiImageSearch,
    mdiImageCheckOutline,
    mdiSendOutline,
    mdiStarFourPointsOutline,
    mdiWhatsapp,
  } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    /** the photo grid the menu serves, as a selector */
    grid: string;
    findAsset: (id: string) => TimelineAsset | undefined;
    /** the stack items (expand, collapse, make cover), which only the timeline can show the result of */
    withStackItems?: boolean;
    /** Show in Photos for one photo (utils/reveal): grids other than Photos' own timeline, an album or search results */
    reveal?: boolean;
    assetInteraction: AssetMultiSelectManager;
    children: Snippet;
  }

  let { grid, findAsset, withStackItems = true, reveal = false, assetInteraction, children }: Props = $props();

  let isOpen = $state(false);
  let position = $state({ x: 0, y: 0 });
  let menuContainer: HTMLUListElement | undefined = $state();
  const menuId = `tile-context-menu-${generateId()}`;

  type StackMenu = { stackId: string; assetId: string; isCover: boolean };
  let stackMenu = $state<StackMenu | undefined>();
  // Local Omarchy layer: subject lift for one of the owner's own photos
  let liftAsset = $state<TimelineAsset | undefined>();
  // Local Omarchy layer: the photo Show in Photos would open Photos at (one of the owner's own, not in the trash)
  let revealAsset = $state<TimelineAsset | undefined>();
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
    const user = authManager.authenticated ? authManager.user : undefined;
    liftAsset =
      assetInteraction.assets.length === 1 && asset.isImage && user && asset.ownerId === user.id ? asset : undefined;
    revealAsset =
      reveal &&
      assetInteraction.assets.length === 1 &&
      user &&
      asset.ownerId === user.id &&
      !asset.isTrashed &&
      asset.visibility !== AssetVisibility.Locked
        ? asset
        : undefined;
    position = { x, y };
    isOpen = true;
    requestAnimationFrame(() => menuContainer?.focus());
  };

  // Local Omarchy layer: the menu's header says what it acts on: the photo (thumbnail, day, place) or the selection
  // (up to three thumbnails fanned, the count, the days it spans)
  const picked = $derived(isOpen ? assetInteraction.assets : []);
  const day = (asset: TimelineAsset, withYear = true) =>
    fromTimelinePlainDateTime(asset.localDateTime).toLocaleString(
      {
        weekday: withYear ? 'short' : undefined,
        month: 'short',
        day: 'numeric',
        year: withYear ? 'numeric' : undefined,
      },
      { locale: $locale ?? undefined },
    );
  const headline = $derived.by(() => {
    if (picked.length === 0) {
      return undefined;
    }
    if (picked.length === 1) {
      const [asset] = picked;
      return { title: day(asset), detail: [asset.city, asset.country].filter(Boolean).join(', ') };
    }
    const times = picked.map((asset) => fromTimelinePlainDateTime(asset.localDateTime));
    const first = picked[times.indexOf(times.reduce((a, b) => (b < a ? b : a)))];
    const last = picked[times.indexOf(times.reduce((a, b) => (b > a ? b : a)))];
    const from = day(first, false);
    const to = day(last);
    return {
      title: $t('selected_count', { values: { count: picked.length } }),
      detail: from === day(last, false) ? to : `${from} – ${to}`,
    };
  });

  const onStackAction = (action: () => Promise<void>) => {
    if (selectedByMenu) {
      assetInteraction.clear();
    }
    void action();
  };

  // Local Omarchy layer: the picked videos (and Live Photos' clips) made ready for a chat app by Curator and saved, when
  // all of them are the owner's and there are few enough to wait for (managers/share-video-manager)
  const SHARE_AT_MOST = 10;
  lookUp.check(); // whether Curator answers, asked once for the whole page
  const shareable = $derived.by(() => {
    if (!lookUp.available || picked.length === 0 || picked.length > SHARE_AT_MOST || !authManager.authenticated) {
      return [];
    }
    const me = authManager.user.id;
    return picked.every((asset) => asset.ownerId === me && (asset.isVideo || !!asset.livePhotoVideoId)) ? picked : [];
  });
  const shareClips = (clips: TimelineAsset[], app: 'whatsapp' | 'telegram') => {
    for (const clip of clips) {
      shareVideos.start(clip.id, app, day(clip));
    }
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
      portal
    >
      {#if headline}
        <li class="ws-menu-head" role="presentation">
          <span class="ws-menu-thumbs" data-count={Math.min(picked.length, 3)} aria-hidden="true">
            {#each picked.slice(0, 3) as item (item.id)}
              <img
                src={getAssetMediaUrl({ id: item.id, size: AssetMediaSize.Thumbnail, cacheKey: item.thumbhash })}
                alt=""
                draggable="false"
              />
            {/each}
          </span>
          <span class="ws-menu-title">
            <strong>{headline.title}</strong>
            {#if headline.detail}<small>{headline.detail}</small>{/if}
          </span>
        </li>
      {/if}
      {#if revealAsset}
        {@const shown = revealAsset}
        <!-- Local Omarchy layer: the photo in Photos (or Archive), selected there and ready to act on (utils/reveal) -->
        <MenuOption
          icon={mdiImageSearch}
          text={shown.visibility === AssetVisibility.Archive ? $t('show_in_archive') : $t('show_in_photos')}
          onClick={() => onStackAction(() => revealInPhotos(shown.id))}
        />
        <hr />
      {/if}
      {#if stackMenu}
        {@const menu = stackMenu}
        <!-- Local Omarchy layer: Curator picks the stack's best photo; the viewer opens on the stack with the card -->
        <MenuOption
          icon={mdiStarFourPointsOutline}
          text={$t('stack_pick')}
          onClick={() =>
            onStackAction(async () => {
              stackPick.open(menu.stackId);
              await goto(`/photos/${menu.assetId}`);
            })}
        />
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
          {#if stackExpandManager.isExpanded(menu.stackId)}
            <!-- folds the stack from any of its photos, so the cover need not be found first -->
            <MenuOption
              icon={mdiArrowCollapseHorizontal}
              text={$t('collapse_stack')}
              onClick={() => onStackAction(() => stackExpandManager.toggle(menu.stackId, menu.assetId))}
            />
          {/if}
        {/if}
        <hr />
      {/if}
      {#if shareable.length > 0}
        {@const clips = shareable}
        <MenuOption
          icon={mdiWhatsapp}
          text={$t('download_for_app', { values: { app: 'WhatsApp' } })}
          onClick={() => onStackAction(async () => shareClips(clips, 'whatsapp'))}
        />
        <MenuOption
          icon={mdiSendOutline}
          text={$t('download_for_app', { values: { app: 'Telegram' } })}
          onClick={() => onStackAction(async () => shareClips(clips, 'telegram'))}
        />
        <hr />
      {/if}
      {#if liftAsset}
        {@const lifted = liftAsset}
        <MenuOption
          icon={mdiContentCut}
          text={$t('copy_subject')}
          onClick={() => onStackAction(() => copySubject(lifted.id, 'photo'))}
        />
        <hr />
      {/if}
      {@render children()}
    </ContextMenu>
  {/if}
</div>

<style>
  /* the menu itself lives at the end of <body> (ContextMenu portal): no grow-in, so it is simply there at the cursor,
     and above everything else on the page */
  :global(div[data-menu-portal]) {
    z-index: 2147483000;
    transition: none !important;
  }
  :global(div[data-menu-portal] > ul[role='menu']) {
    min-width: 14rem;
  }
  .ws-menu-head {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.375rem calc(0.5rem + 6px) 0.625rem;
    margin: 0 -6px 0;
    border-bottom: 1px solid var(--ws-hairline);
    list-style: none;
  }
  .ws-menu-thumbs {
    position: relative;
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
  }
  .ws-menu-thumbs img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--ws-radius, 0px);
    box-shadow:
      0 0 0 1.5px var(--immich-ui-light),
      0 2px 6px rgb(0 0 0 / 0.3);
  }
  /* a selection fans out behind the first photo */
  .ws-menu-thumbs img:nth-child(1) {
    z-index: 3;
  }
  .ws-menu-thumbs img:nth-child(2) {
    z-index: 2;
    transform: translateX(-3px) rotate(-9deg) scale(0.94);
  }
  .ws-menu-thumbs img:nth-child(3) {
    z-index: 1;
    transform: translateX(3px) rotate(9deg) scale(0.94);
  }
  .ws-menu-title {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .ws-menu-title strong {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .ws-menu-title small {
    overflow: hidden;
    font-size: 0.72rem;
    color: var(--immich-ui-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
