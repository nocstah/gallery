<script lang="ts">
  import { createInspectionZoom } from '$lib/actions/inspection-zoom';
  import RestoreCompare from '$lib/components/curator/RestoreCompare.svelte';
  import { getAssetPlaybackUrl, getAssetUrl } from '$lib/utils';
  import type { InspectionItem } from '$lib/utils/inbox-inspection';
  import { AssetTypeEnum, getAssetInfo } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import {
    mdiClose,
    mdiChevronLeft,
    mdiChevronRight,
    mdiMagnifyPlusOutline,
    mdiMagnifyMinusOutline,
    mdiPlay,
    mdiPause,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    items: InspectionItem[];
    initialIndex?: number;
    title: string;
    onClose: () => void;
  }
  let { items, initialIndex = 0, title, onClose }: Props = $props();
  let index = $state(initialIndex);
  const item = $derived(items[index]);
  let scale = $state(1);
  let zoom: ReturnType<typeof createInspectionZoom> | undefined;
  let imageSrc = $state<string>();
  let videoSrc = $state<string>();
  let failed = $state(false);
  let loaded = $state(false);
  let imageRatio = $state(1);
  let video = $state<HTMLVideoElement>();
  let playing = $state(false);
  let time = $state(0);
  let duration = $state(0);
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const play = () => {
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => (failed = true));
    } else {
      video.pause();
    }
  };
  let retry = $state(0);

  $effect(() => {
    const current = item;
    videoSrc = current.videoSrc;
    imageSrc = current.src;
    failed = false;
    loaded = false;
    imageRatio = 1;
    playing = false;
    time = 0;
    duration = 0;
    let active = true;
    if (current.assetId) {
      void getAssetInfo({ id: current.assetId })
        .then((asset) => {
          if (active && asset.type === AssetTypeEnum.Video) {
            videoSrc = getAssetPlaybackUrl({ id: asset.id });
          } else if (active) {
            imageSrc = getAssetUrl({ asset, forceOriginal: true }) ?? current.src;
          }
        })
        .catch(() => undefined); // the preview remains useful if metadata is unavailable
    }
    return () => {
      active = false;
    };
  });

  const mountZoom = (node: HTMLElement) => {
    zoom = createInspectionZoom(node, (value) => (scale = value));
    return { destroy: zoom.destroy };
  };
  const move = (direction: number) => {
    index = Math.max(0, Math.min(items.length - 1, index + direction));
  };
  const keydown = (event: KeyboardEvent) => {
    // Nothing in this read-only view can accept, reject, skip, or undo a suggestion underneath it.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('input, video')) {
      return;
    }
    switch (event.key) {
      case '+':
      case '=': {
        event.preventDefault();
        zoom?.zoomBy(1.5);
        break;
      }
      case '-': {
        event.preventDefault();
        zoom?.zoomBy(1 / 1.5);
        break;
      }
      case '0': {
        event.preventDefault();
        zoom?.reset();
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        move(-1);
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        move(1);
        break;
      }
    }
  };
  const modal = (dialog: HTMLDialogElement) => {
    const previous = document.activeElement;
    dialog.showModal();
    dialog.addEventListener('keydown', keydown);
    return {
      destroy: () => {
        dialog.removeEventListener('keydown', keydown);
        dialog.close();
        if (previous instanceof HTMLElement && previous.isConnected) {
          previous.focus({ preventScroll: true });
        }
      },
    };
  };
</script>

<dialog
  class="inspector"
  data-inbox-inspector
  aria-label={title}
  use:modal
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
>
  <header class="inspector-header">
    <h2>{title}</h2>
    <button type="button" class="ws-btn-quiet inspector-icon" aria-label={$t('close')} onclick={onClose}
      ><Icon icon={mdiClose} size="24" /></button
    >
  </header>
  <div class="inspector-toolbar">
    <div class="inspector-tools">
      <button
        type="button"
        class="ws-btn-quiet inspector-icon"
        aria-label={$t('ai_inbox_zoom_out')}
        disabled={scale <= 1}
        onclick={() => zoom?.zoomBy(1 / 1.5)}><Icon icon={mdiMagnifyMinusOutline} size="22" /></button
      >
      <span class="inspector-scale">{Math.round(scale * 100)}%</span>
      <button
        type="button"
        class="ws-btn-quiet inspector-icon"
        aria-label={$t('ai_inbox_zoom_in')}
        disabled={scale >= 8}
        onclick={() => zoom?.zoomBy(1.5)}><Icon icon={mdiMagnifyPlusOutline} size="22" /></button
      >
      <button type="button" class="ws-btn-quiet" onclick={() => zoom?.reset()}>{$t('ai_inbox_fit')}</button>
    </div>
    {#if item.label}<span class="inspector-label">{$t(item.label)}</span>{/if}
    {#if items.length > 1}
      <div class="inspector-tools">
        <button
          type="button"
          class="ws-btn-quiet inspector-icon"
          aria-label={$t('previous')}
          disabled={index === 0}
          onclick={() => move(-1)}><Icon icon={mdiChevronLeft} size="22" /></button
        >
        <span class="inspector-count">{index + 1} / {items.length}</span>
        <button
          type="button"
          class="ws-btn-quiet inspector-icon"
          aria-label={$t('next')}
          disabled={index === items.length - 1}
          onclick={() => move(1)}><Icon icon={mdiChevronRight} size="22" /></button
        >
      </div>
    {/if}
  </div>
  {#key `${index}-${retry}`}
    <div class="inspector-canvas" use:mountZoom>
      {#if item.restore}
        <RestoreCompare suggestion={item.restore} size="inspect" />
      {:else if failed}
        <div class="inspector-status" role="status">
          <p>{$t('error_loading_image')}</p>
          <button
            type="button"
            class="ws-btn"
            onclick={() => {
              failed = false;
              loaded = false;
              retry++;
            }}>{$t('retry')}</button
          >
        </div>
      {:else if videoSrc}
        <div class="inspector-clip">
          <div class="inspector-video-frame">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={video}
              class="inspector-media"
              src={videoSrc}
              poster={item.src}
              playsinline
              preload="metadata"
              onloadedmetadata={() => (duration = video?.duration ?? 0)}
              ontimeupdate={() => (time = video?.currentTime ?? 0)}
              onplay={() => (playing = true)}
              onpause={() => (playing = false)}
              onerror={() => (failed = true)}
            ></video>
          </div>
          <div class="inspector-playback">
            <button
              type="button"
              class="ws-btn-quiet inspector-icon"
              aria-label={playing ? $t('pause') : $t('play')}
              onclick={play}><Icon icon={playing ? mdiPause : mdiPlay} size="22" /></button
            >
            <input
              type="range"
              aria-label={$t('ai_inbox_clip_position')}
              min="0"
              max={duration || 0}
              step=".04"
              value={time}
              oninput={(event) => {
                if (video) {
                  video.currentTime = Number(event.currentTarget.value);
                }
              }}
            />
            <span>{clock(time)} / {clock(duration)}</span>
          </div>
        </div>
      {:else}
        {#if !loaded}<span class="inspector-status" role="status">{$t('loading')}</span>{/if}
        <div
          class="inspector-image-layer"
          class:is-turned={Math.abs(item.turn ?? 0) % 180 === 90}
          style:--image-ratio={imageRatio}
        >
          <img
            class="inspector-image"
            src={imageSrc}
            alt={item.label ? $t(item.label) : title}
            draggable="false"
            style:rotate={item.turn ? `${item.turn}deg` : undefined}
            onload={(event) => {
              const image = event.currentTarget as HTMLImageElement;
              imageRatio = image.naturalWidth / image.naturalHeight || 1;
              loaded = true;
            }}
            onerror={() => {
              if (imageSrc === item.src) {
                failed = true;
              } else {
                imageSrc = item.src;
              }
            }}
          />
        </div>
      {/if}
    </div>
  {/key}
  <footer class="inspector-footer">
    <span>{$t('ai_inbox_zoom_hint')}</span>
    {#if item.assetId}<a href="/photos/{item.assetId}" target="_blank" rel="noopener">{$t('ai_inbox_open_photo')}</a
      >{/if}
  </footer>
</dialog>

<style>
  .inspector {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: max(0.75rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      max(0.75rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    border: 0;
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    overflow: hidden;
  }
  .inspector[open] {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 0.5rem;
  }
  .inspector::backdrop {
    background: rgb(0 0 0 / 80%);
  }
  .inspector-header,
  .inspector-toolbar,
  .inspector-footer,
  .inspector-tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .inspector-header {
    justify-content: space-between;
  }
  h2 {
    font-size: 1.1rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inspector-toolbar {
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .inspector-tools {
    flex: none;
  }
  .inspector-icon {
    display: grid;
    place-items: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0.4rem;
  }
  .inspector :is(button, a):focus-visible {
    outline: 2px solid var(--ws-accent);
    outline-offset: 2px;
  }
  .inspector-toolbar button {
    min-height: 44px;
  }
  .inspector button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .inspector-scale,
  .inspector-count {
    font-variant-numeric: tabular-nums;
    text-align: center;
    min-width: 4ch;
  }
  .inspector-label {
    font-weight: 600;
  }
  .inspector-canvas {
    display: grid;
    place-items: center;
    position: relative;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    background: #111;
    border-radius: var(--ws-radius);
  }
  .inspector-media {
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: contain;
    transform: var(--inspect-transform);
  }
  .inspector-image-layer {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    container-type: size;
    transform: var(--inspect-transform);
  }
  .inspector-image {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: min(100cqw, 100cqh * var(--image-ratio));
    max-width: none;
    height: auto;
  }
  .is-turned .inspector-image {
    width: min(100cqh, 100cqw * var(--image-ratio));
  }
  .inspector-clip {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .inspector-video-frame {
    min-height: 0;
    overflow: hidden;
  }
  .inspector-playback {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0.75rem;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .inspector-playback input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    accent-color: var(--ws-accent);
  }
  .inspector-playback button {
    color: #fff;
  }
  .inspector-status {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 1rem;
    color: #fff;
    text-align: center;
  }
  .inspector-footer {
    justify-content: space-between;
    flex-wrap: wrap;
    font-size: 0.8rem;
  }
  .inspector-footer a {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  @media (max-width: 600px) {
    .inspector {
      padding-inline: 0.5rem;
    }
    .inspector-footer {
      font-size: 0.75rem;
    }
  }
</style>
