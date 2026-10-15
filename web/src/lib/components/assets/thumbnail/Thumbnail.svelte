<script lang="ts">
  import { stackExpandManager } from '$lib/managers/stack-expand-manager.svelte';
  import { t } from 'svelte-i18n';
  import { thumbnailZoomManager } from '$lib/managers/thumbnail-zoom-manager.svelte';
  import { ProjectionType } from '$lib/constants';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { locale, playVideoThumbnailOnHover } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl, getAssetPlaybackUrl } from '$lib/utils';
  import { moveFocus } from '$lib/utils/focus-util';
  import { currentUrlReplaceAssetId } from '$lib/utils/navigation';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { AssetMediaSize, AssetVisibility, type UserResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import {
    mdiArchiveArrowDownOutline,
    mdiArrowCollapseHorizontal,
    mdiCameraBurst,
    mdiCheckCircle,
    mdiFileGifBox,
    mdiHeart,
    mdiMagnifyPlusOutline,
    mdiMotionPauseOutline,
    mdiMotionPlayOutline,
    mdiRotate360,
  } from '@mdi/js';
  import { onMount, untrack } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { fade } from 'svelte/transition';
  import Thumbhash from '$lib/components/Thumbhash.svelte';
  import ImageThumbnail from './ImageThumbnail.svelte';
  import VideoThumbnail from './VideoThumbnail.svelte';
  interface Props {
    asset: TimelineAsset;
    groupIndex?: number;
    thumbnailSize?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    selected?: boolean;
    selectionCandidate?: boolean;
    disabled?: boolean;
    disableLinkMouseOver?: boolean;
    readonly?: boolean;
    showArchiveIcon?: boolean;
    showStackedIcon?: boolean;
    /** Local Omarchy layer: false where the grid cannot expand a stack in place (search results): a plain count */
    stackBadgeExpands?: boolean;
    imageClass?: ClassValue;
    brokenAssetClass?: ClassValue;
    albumUsers?: UserResponseDto[];
    onClick?: (asset: TimelineAsset) => void;
    onPreview?: (asset: TimelineAsset) => void;
    onSelect?: (asset: TimelineAsset) => void;
    onMouseEvent?: (event: { isMouseOver: boolean; selectedGroupIndex: number }) => void;
  }

  let {
    asset = $bindable(),
    groupIndex = 0,
    thumbnailSize = undefined,
    thumbnailWidth = undefined,
    thumbnailHeight = undefined,
    selected = false,
    selectionCandidate = false,
    disabled = false,
    disableLinkMouseOver = false,
    readonly = false,
    showArchiveIcon = false,
    showStackedIcon = true,
    stackBadgeExpands = true,
    albumUsers = [],
    onClick = undefined,
    onPreview = undefined,
    onSelect = undefined,
    onMouseEvent = undefined,
    imageClass = '',
    brokenAssetClass = '',
  }: Props = $props();

  let usingMobileDevice = $derived(mediaQueryManager.pointerCoarse);
  let element: HTMLElement | undefined = $state();
  let mouseOver = $state(false);
  let loaded = $state(false);
  let thumbError = $state(false);
  let skipFade = $state(false);

  let width = $derived(thumbnailSize || thumbnailWidth || 235);
  let height = $derived(thumbnailSize || thumbnailHeight || 235);
  // Local Omarchy layer: a tile zoomed past what the thumbnail holds (the server thumbnail size, set to
  // 640px here) at this screen's pixel ratio loads the preview rendition instead of upscaling a thumbnail.
  const THUMBNAIL_PX = 640;
  // Without day labels the date travels on the photo itself, ahead of the place.
  const tileCaption = $derived.by(() => {
    const place = [asset.city, asset.country].filter(Boolean).join(', ');
    if (thumbnailZoomManager.dayLabels || !asset.localDateTime) {
      return place;
    }
    const { year, month, day } = asset.localDateTime;
    const date = new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return place ? `${date} · ${place}` : date;
  });
  const tileMediaSize = $derived(
    Math.max(Number(width) || 0, Number(height) || 0) * (globalThis.devicePixelRatio ?? 1) > THUMBNAIL_PX * 1.15
      ? AssetMediaSize.Preview
      : AssetMediaSize.Thumbnail,
  );

  let assetOwner = $derived(albumUsers?.find((user) => user.id === asset.ownerId) ?? null);

  const onIconClickedHandler = (e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!disabled) {
      onSelect?.($state.snapshot(asset));
    }
  };

  const callClickHandlers = () => {
    if (selected) {
      onIconClickedHandler();
      return;
    }
    onClick?.($state.snapshot(asset));
  };

  const handleClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      window.open(currentUrlReplaceAssetId(asset.id), '_blank');
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    callClickHandlers();
  };

  // Local Omarchy layer: the expanded stack this tile belongs to (cover included), its place in it, and whether
  // another expanded stack is under the pointer (stack-expand-manager)
  const stackGroup = $derived(stackExpandManager.groupOf(asset.id));
  const stackPlace = $derived(stackGroup ? stackExpandManager.position(asset.id) : undefined);
  const stackDimmed = $derived(!!stackExpandManager.spotlight && stackExpandManager.spotlight !== stackGroup);

  const onMouseEnter = () => {
    if (usingMobileDevice) {
      return;
    }
    mouseOver = true;
    stackExpandManager.spotlight = stackGroup;
    onMouseEvent?.({ isMouseOver: true, selectedGroupIndex: groupIndex });
  };

  const onMouseLeave = () => {
    mouseOver = false;
    if (stackGroup && stackExpandManager.spotlight === stackGroup) {
      stackExpandManager.spotlight = undefined;
    }
    onMouseEvent?.({ isMouseOver: false, selectedGroupIndex: groupIndex });
  };

  let timer: ReturnType<typeof setTimeout> | null = null;

  const preventContextMenu = (evt: Event) => evt.preventDefault();
  const disposeables: (() => void)[] = [];

  const clearLongPressTimer = () => {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
    for (const dispose of disposeables) {
      dispose();
    }
    disposeables.length = 0;
  };

  let startX: number = 0;
  let startY: number = 0;

  function longPress(element: HTMLElement, { onLongPress }: { onLongPress: () => void }) {
    let didPress = false;
    const start = (evt: PointerEvent) => {
      startX = evt.clientX;
      startY = evt.clientY;
      didPress = false;
      // Local Omarchy layer: on the timeline grid a mouse/pen hold picks the photo up (actions/marquee-select.ts)
      if (evt.pointerType !== 'touch' && element.closest('[data-ws-gestures]')) {
        return;
      }
      // 350ms for longpress. For reference: iOS uses 500ms for default long press, or 200ms for fast long press.
      timer = setTimeout(() => {
        onLongPress();
        element.addEventListener('contextmenu', preventContextMenu, { once: true });
        disposeables.push(() => element.removeEventListener('contextmenu', preventContextMenu));
        didPress = true;
      }, 350);
    };
    const click = (e: MouseEvent) => {
      if (!didPress) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    };
    element.addEventListener('click', click);
    element.addEventListener('pointerdown', start, { capture: true });
    element.addEventListener('pointerup', clearLongPressTimer, { capture: true, passive: true });
    return {
      destroy: () => {
        element.removeEventListener('click', click);
        element.removeEventListener('pointerdown', start, true);
        element.removeEventListener('pointerup', clearLongPressTimer, true);
      },
    };
  }
  function moveHandler(e: PointerEvent) {
    if (Math.abs(startX - e.clientX) >= 10 || Math.abs(startY - e.clientY) >= 10) {
      clearLongPressTimer();
    }
  }
  onMount(() => {
    document.addEventListener('scroll', clearLongPressTimer, { capture: true, passive: true });
    document.addEventListener('wheel', clearLongPressTimer, { capture: true, passive: true });
    document.addEventListener('contextmenu', clearLongPressTimer, { capture: true, passive: true });
    document.addEventListener('pointermove', moveHandler, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', clearLongPressTimer, true);
      document.removeEventListener('wheel', clearLongPressTimer, true);
      document.removeEventListener('contextmenu', clearLongPressTimer, true);
      document.removeEventListener('pointermove', moveHandler, true);
    };
  });
  const backgroundColorClass = $derived.by(() => {
    if (loaded && !selected) {
      return 'bg-transparent';
    }
    if (disabled) {
      return 'bg-gray-300';
    }
    return 'dark:bg-neutral-700 bg-neutral-200';
  });

  // Local Omarchy layer: a heart given while the photo is on screen (F, the viewer's heart) pops in, so the favourite
  // reads as done; one that was already there when the tile was made just sits there
  let favoritePop = $state(false);
  let wasFavorite = untrack(() => asset.isFavorite);
  $effect(() => {
    const favorite = asset.isFavorite;
    untrack(() => {
      if (favorite && !wasFavorite) {
        favoritePop = true;
      }
      wasFavorite = favorite;
    });
  });
</script>

<div
  class={[
    'group flex overflow-hidden focus-visible:outline-none',
    backgroundColorClass,
    { 'rounded-xl': selected },
    disabled ? 'cursor-not-allowed' : 'cursor-pointer',
  ]}
  style:width="{width}px"
  style:height="{height}px"
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
  use:longPress={{ onLongPress: () => onSelect?.($state.snapshot(asset)) }}
  onkeydown={(evt) => {
    if (evt.key === 'Enter') {
      callClickHandlers();
    } else if (evt.key === 'x') {
      onSelect?.(asset);
    }
    if (document.activeElement === element && evt.key === 'Escape') {
      moveFocus((element) => element.dataset.thumbnailFocusContainer === undefined, 'next');
    }
  }}
  onclick={handleClick}
  bind:this={element}
  data-asset={asset.id}
  data-thumbnail-focus-container
  data-stack-member={stackGroup ? true : undefined}
  data-stack-dimmed={stackDimmed ? true : undefined}
  data-selected={selected ? true : undefined}
  data-readonly={readonly ? true : undefined}
  data-disabled={disabled ? true : undefined}
  tabindex={0}
  role="link"
>
  <div class="group absolute inset-y-0" style:width="inherit" style:height="inherit">
    <!-- Local Omarchy layer: ws-tile-media lets the selected state keep the photo full size -->
    <div
      class={[
        'ws-tile-media absolute size-full bg-transparent transition-transform select-none',
        { 'scale-[0.85]': selected },
      ]}
    >
      <ImageThumbnail
        class={['absolute group-focus-visible:rounded-lg', imageClass]}
        brokenAssetClass={['z-1 absolute group-focus-visible:rounded-lg', brokenAssetClass]}
        url={getAssetMediaUrl({ id: asset.id, size: tileMediaSize, cacheKey: asset.thumbhash })}
        altText={$getAltText(asset)}
        widthStyle="{width}px"
        heightStyle="{height}px"
        curve={selected}
        onComplete={(errored) => {
          const rect = element?.getBoundingClientRect();
          skipFade = !rect || rect.bottom < 0 || rect.top > window.innerHeight;
          loaded = true;
          thumbError = errored;
        }}
      />
      {#if asset.isVideo}
        <div class="pointer-events-none absolute size-full group-focus-visible:rounded-lg">
          <VideoThumbnail
            class="group-focus-visible:rounded-lg"
            url={getAssetPlaybackUrl({ id: asset.id, cacheKey: asset.thumbhash })}
            enablePlayback={mouseOver && $playVideoThumbnailOnHover}
            curve={selected}
            durationInSeconds={asset.duration ? asset.duration / 1000 : 0}
            playbackOnIconHover={!$playVideoThumbnailOnHover}
          />
        </div>
      {:else if asset.isImage && asset.livePhotoVideoId}
        <div class="pointer-events-none absolute size-full group-focus-visible:rounded-lg">
          <VideoThumbnail
            class="group-focus-visible:rounded-lg"
            url={getAssetPlaybackUrl({ id: asset.livePhotoVideoId, cacheKey: asset.thumbhash })}
            enablePlayback={mouseOver && $playVideoThumbnailOnHover}
            pauseIcon={mdiMotionPauseOutline}
            playIcon={mdiMotionPlayOutline}
            showTime={false}
            curve={selected}
            playbackOnIconHover={!$playVideoThumbnailOnHover}
          />
        </div>
      {:else if asset.isImage && asset.duration && mouseOver}
        <!-- GIF -->
        <div class="pointer-events-none absolute size-full">
          <ImageThumbnail
            class={imageClass}
            {brokenAssetClass}
            url={getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Original, cacheKey: asset.thumbhash })}
            altText={$getAltText(asset)}
            widthStyle="{width}px"
            heightStyle="{height}px"
            curve={selected}
          />
        </div>
      {/if}

      {#if (!loaded || thumbError) && asset.thumbhash}
        <Thumbhash
          base64ThumbHash={asset.thumbhash}
          data-testid="thumbhash"
          class={[
            'absolute top-0 object-cover group-focus-visible:rounded-lg',
            { 'rounded-xl': selected, hidden: skipFade },
          ]}
          style="width: {width}px; height: {height}px"
          draggable="false"
          fadeOut
        />
      {/if}

      <!-- icon overlay -->
      <div class="absolute inset-0 z-2">
        <!-- Gradient overlay on hover -->
        {#if !usingMobileDevice && !disabled && !asset.isVideo}
          <div
            class={[
              'absolute size-full bg-linear-to-b from-black/25 via-[transparent_25%] opacity-0 transition-opacity group-hover:opacity-100',
              { 'rounded-xl group-focus-visible:rounded-lg': selected },
            ]}
          ></div>
        {/if}

        <!-- Local Omarchy layer: the place, captioned on the photo while it has focus -->
        {#if !disabled && tileCaption}
          <p class={['ws-place', { 'ws-place-fav': asset.isFavorite }]}>{tileCaption}</p>
        {/if}

        <!-- Favorite asset star -->
        {#if !authManager.isSharedLink && asset.isFavorite}
          <div
            class={['absolute inset-s-2 bottom-2 z-2', { 'ws-favorite-pop': favoritePop }]}
            onanimationend={() => (favoritePop = false)}
          >
            <Icon data-icon-favorite icon={mdiHeart} size="24" class="text-white" />
          </div>
        {/if}

        {#if !!assetOwner}
          <div class="absolute inset-e-2 bottom-1 z-2 max-w-[50%]">
            <p class="text-white-shadow max-w-full truncate p-1 text-xs font-medium text-white">
              {assetOwner.name}
            </p>
          </div>
        {/if}

        {#if !authManager.isSharedLink && showArchiveIcon && asset.visibility === AssetVisibility.Archive}
          <div class={['absolute inset-s-2 z-2', asset.isFavorite ? 'bottom-10' : 'bottom-2']}>
            <Icon data-icon-archive icon={mdiArchiveArrowDownOutline} size="24" class="text-white" />
          </div>
        {/if}

        {#if asset.isImage && asset.projectionType === ProjectionType.EQUIRECTANGULAR}
          <div class="absolute inset-e-0 top-0 z-2 flex place-items-center gap-1 text-xs font-medium text-white">
            <span class="pe-2 pt-2">
              <Icon icon={mdiRotate360} size="24" />
            </span>
          </div>
        {/if}

        {#if asset.isImage && asset.duration}
          <div class="absolute inset-e-0 top-0 z-2 flex place-items-center gap-1 text-xs font-medium text-white">
            <span class="pe-2 pt-2">
              <Icon icon={mouseOver ? mdiMotionPauseOutline : mdiFileGifBox} size="24" />
            </span>
          </div>
        {/if}
      </div>

      <!-- lazy show the url on mouse over-->
      {#if !usingMobileDevice && mouseOver && !disableLinkMouseOver}
        <a
          class="absolute inset-y-0 z-2 w-full"
          style:cursor="unset"
          href={currentUrlReplaceAssetId(asset.id)}
          onclick={(evt) => evt.preventDefault()}
          tabindex={-1}
          aria-label="Thumbnail URL"
        >
        </a>
      {/if}
      <!-- Stacked asset. Local Omarchy layer: the badge is a button that expands the stack in place.
           It sits after the hover link (same z-2 layer, later wins) so real clicks reach it;
           (stack-expand-manager) instead of opening the photo; click again to collapse. -->
      {#if asset.stack && showStackedIcon && !stackBadgeExpands}
        <div
          class={[
            'ws-stack-badge pointer-events-none absolute z-3 flex place-items-center gap-1 text-xs font-medium text-white',
            asset.isImage && !asset.livePhotoVideoId ? 'inset-e-0 top-0' : 'inset-e-1 top-7',
          ]}
        >
          <p>{asset.stack.assetCount.toLocaleString($locale)}</p>
          <Icon icon={mdiCameraBurst} size="24" />
        </div>
      {:else if asset.stack && showStackedIcon}
        {@const stackId = asset.stack.id}
        {@const expanded = stackExpandManager.isExpanded(stackId)}
        <button
          type="button"
          class={[
            'ws-stack-badge absolute z-3 flex place-items-center gap-1 text-xs font-medium text-white',
            asset.isImage && !asset.livePhotoVideoId ? 'inset-e-0 top-0' : 'inset-e-1 top-7',
          ]}
          aria-expanded={expanded}
          aria-label={expanded ? $t('collapse_stack') : $t('expand_stack')}
          title={expanded ? $t('collapse_stack') : $t('expand_stack')}
          onclick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void stackExpandManager.toggle(stackId, asset.id);
          }}
        >
          <p>{asset.stack.assetCount.toLocaleString($locale)}</p>
          <Icon icon={expanded ? mdiArrowCollapseHorizontal : mdiCameraBurst} size="24" />
        </button>
      {/if}
      {#if stackPlace}
        <span class="ws-stack-place pointer-events-none absolute bottom-0 inset-s-0 z-3" aria-hidden="true">
          {stackPlace.index.toLocaleString($locale)} / {stackPlace.total.toLocaleString($locale)}
        </span>
      {/if}
    </div>

    {#if selectionCandidate}
      <div
        class={['absolute top-0 z-2 size-full bg-immich-primary opacity-40', { 'rounded-xl': selected }]}
        in:fade={{ duration: 100 }}
        out:fade={{ duration: 100 }}
      ></div>
    {/if}

    <!-- Select asset button  -->
    {#if !readonly && (mouseOver || selected || selectionCandidate)}
      <button
        type="button"
        onclick={onIconClickedHandler}
        class={['group/select absolute z-2 p-2 focus:outline-none', { 'cursor-not-allowed': disabled }]}
        role="checkbox"
        tabindex={-1}
        aria-checked={selected}
        {disabled}
      >
        {#if disabled}
          <Icon data-icon-select icon={mdiCheckCircle} size="24" class="text-zinc-800" />
        {:else if selected}
          <div class="rounded-full bg-[#D9DCEF] dark:bg-[#232932]">
            <Icon data-icon-select icon={mdiCheckCircle} size="24" class="text-primary" />
          </div>
        {:else}
          <Icon data-icon-select icon={mdiCheckCircle} size="24" class="text-white/80 group-hover/select:text-white" />
        {/if}
      </button>
    {/if}

    <!-- Preview asset button (visible on hover when any asset is selected) -->
    {#if mouseOver && onPreview}
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onPreview?.($state.snapshot(asset));
        }}
        class="absolute inset-e-1 bottom-1 z-2 rounded-full bg-black/25 p-1.5 transition-colors hover:bg-black/50 focus:outline-none"
        in:fade={{ duration: 100 }}
        tabindex={-1}
        aria-label="Preview asset"
      >
        <Icon icon={mdiMagnifyPlusOutline} size="20" class="text-white" />
      </button>
    {/if}

    <!-- Outline on focus -->
    <div
      class={[
        'pointer-events-none absolute z-1 size-full outline-immich-primary group-focus-visible:outline-4 group-focus-visible:-outline-offset-4 dark:outline-immich-dark-primary',
        { 'rounded-xl': selected },
      ]}
      data-outline
    ></div>
  </div>
</div>
