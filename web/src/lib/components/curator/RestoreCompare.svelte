<script lang="ts">
  // Local Omarchy layer: a restored photo or clip against its original (restore.publish suggestions). One frame, the
  // original left of a divider and the restored version right of it; dragging anywhere in the frame moves the divider.
  // The divider is a range input underneath, so arrow keys and touch move it too. A clip plays both versions in step,
  // with its own play button and position below the frame (native controls would be cut in half by the divider).
  import { restoredUrl, type Suggestion } from '$lib/utils/curator';
  import { Icon } from '@immich/ui';
  import { mdiArrowLeftRight, mdiPause, mdiPlay, mdiFullscreen } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    suggestion: Suggestion;
    /** a card in the inbox, or review mode's stage */
    size: 'card' | 'stage' | 'inspect';
    onInspect?: () => void;
  }

  let { suggestion, size, onInspect }: Props = $props();

  type Payload = {
    variant?: string;
    width?: number;
    height?: number;
    source?: { width?: number; height?: number };
    settings?: { angle?: number };
  };
  const payload = $derived(suggestion.payload as Payload);
  const clip = $derived(payload.variant === 'video');
  // Local Omarchy layer: a Live Photo effect (curator/live.py), a straightened document or a collage is shown on its
  // own, a loop or bounce playing on
  const effect = $derived(
    ['loop', 'bounce', 'long-exposure', 'key-photo', 'cinematic', 'animation', 'straightened', 'collage'].includes(
      payload.variant ?? '',
    ) ||
      // an adjusted photo that was straightened is framed apart from its original: no divider between the two
      (payload.variant === 'adjusted' && !!payload.settings?.angle),
  );
  const effectClip = $derived(['loop', 'bounce', 'cinematic', 'animation'].includes(payload.variant ?? ''));
  // photos are asked for at about twice the width they are shown at, for sharp edges on HiDPI screens
  const across = $derived(size === 'inspect' ? undefined : size === 'stage' ? 2560 : 960);

  let split = $state(50);
  let press: { x: number; y: number; moved: boolean } | undefined;
  let failed = $state(false);
  let retry = $state(0);
  const inspect = () => {
    after?.pause();
    before?.pause();
    onInspect?.();
  };
  const pointerDown = (event: PointerEvent) => {
    press = { x: event.clientX, y: event.clientY, moved: false };
  };
  const pointerMove = (event: PointerEvent) => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) {
      press.moved = true;
    }
  };
  const clickPreview = () => {
    if (press && !press.moved) {
      inspect();
    }
    press = undefined;
  };
  let before = $state<HTMLVideoElement>();
  let after = $state<HTMLVideoElement>();
  let clipRatio = $state<number>();
  let playing = $state(false);
  let time = $state(0);
  let duration = $state(0);

  const ratio = $derived(
    clip ? (clipRatio ?? 4 / 3) : payload.width && payload.height ? payload.width / payload.height : 4 / 3,
  );
  const enlarged = $derived(
    !clip && payload.source?.width && payload.source.height && payload.width && payload.height
      ? `${payload.source.width}×${payload.source.height} → ${payload.width}×${payload.height}`
      : undefined,
  );

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  /** the original follows the restored clip, which carries the sound */
  const align = (always = false) => {
    if (before && after && (always || Math.abs(before.currentTime - after.currentTime) > 0.15)) {
      before.currentTime = after.currentTime;
    }
  };

  const toggle = () => {
    if (!before || !after) {
      return;
    }
    if (after.paused) {
      align(true);
      void Promise.all([after.play(), before.play()]).catch(() => undefined);
    } else {
      after.pause();
    }
  };

  const seek = (event: Event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    time = value;
    if (after) {
      after.currentTime = value;
    }
    if (before) {
      before.currentTime = value;
    }
  };

  const onMetadata = () => {
    if (after?.videoWidth && after.videoHeight) {
      clipRatio = after.videoWidth / after.videoHeight;
      duration = after.duration;
    }
  };

  const onPause = () => {
    playing = false;
    before?.pause();
    align(true);
  };
</script>

{#snippet expand()}
  <button
    type="button"
    class="restore-expand"
    onclick={inspect}
    aria-label={$t('ai_inbox_inspect')}
    title={$t('ai_inbox_inspect')}><Icon icon={mdiFullscreen} size="22" /></button
  >
{/snippet}

<figure
  class="restore {size === 'card' ? 'is-card' : 'is-stage'}"
  class:is-inspect={size === 'inspect'}
  style:--ratio={ratio}
>
  {#key retry}
    {#if effect}
      <div class="restore-frame">
        {#if onInspect}<button
            type="button"
            class="restore-open-surface"
            aria-label={$t('ai_inbox_inspect')}
            onclick={inspect}
          ></button>{/if}
        {#if effectClip}
          <video
            class="restore-media"
            onerror={() => (failed = true)}
            src={restoredUrl(suggestion.id, 'after', 'mp4')}
            autoplay
            loop
            muted
            playsinline
          ></video>
        {:else}
          <img
            class="restore-media"
            onerror={() => (failed = true)}
            src={restoredUrl(suggestion.id, 'after', 'jpg', across)}
            alt=""
            loading="lazy"
          />
        {/if}
        {#if onInspect}{@render expand()}{/if}
      </div>
    {:else}
      <div class="restore-frame" style:--split="{split}%">
        {#if clip}
          <video
            bind:this={before}
            class="restore-media"
            onerror={() => (failed = true)}
            src={restoredUrl(suggestion.id, 'before', 'mp4')}
            muted
            playsinline
            preload="metadata"
          ></video>
          <div class="restore-after">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={after}
              class="restore-media"
              onerror={() => (failed = true)}
              src={restoredUrl(suggestion.id, 'after', 'mp4')}
              playsinline
              preload="metadata"
              onloadedmetadata={onMetadata}
              ontimeupdate={() => {
                time = after?.currentTime ?? 0;
                align();
              }}
              onplay={() => (playing = true)}
              onpause={onPause}
              onended={onPause}
            ></video>
          </div>
        {:else}
          <img
            class="restore-media"
            onerror={() => (failed = true)}
            src={restoredUrl(suggestion.id, 'before', 'jpg', across)}
            alt=""
            loading="lazy"
          />
          <div class="restore-after">
            <img
              class="restore-media"
              onerror={() => (failed = true)}
              src={restoredUrl(suggestion.id, 'after', 'jpg', across)}
              alt=""
              loading="lazy"
            />
          </div>
        {/if}
        <span class="restore-line" aria-hidden="true">
          <span class="restore-handle"><Icon icon={mdiArrowLeftRight} size="16" /></span>
        </span>
        <span class="restore-label">{$t('ai_inbox_now')}</span>
        <span class="restore-label restore-label-after">{$t('ai_inbox_proposed')}</span>
        {#if size !== 'inspect'}
          <input
            class="restore-range"
            onpointerdown={pointerDown}
            onpointermove={pointerMove}
            onpointercancel={() => (press = undefined)}
            onclick={clickPreview}
            type="range"
            min="0"
            max="100"
            step="0.5"
            bind:value={split}
            aria-label={$t('ai_inbox_compare')}
          />
        {/if}
        {#if onInspect}{@render expand()}{/if}
      </div>
      {#if size === 'inspect'}
        <label class="restore-compare-control"
          ><span>{$t('ai_inbox_now')}</span><input
            type="range"
            min="0"
            max="100"
            step="0.5"
            bind:value={split}
            aria-label={$t('ai_inbox_compare')}
          /><span>{$t('ai_inbox_proposed')}</span></label
        >
      {/if}
      {#if clip}
        <div class="restore-controls">
          <button
            type="button"
            class="ws-btn-quiet restore-play"
            onclick={toggle}
            aria-label={playing ? $t('pause') : $t('play')}
          >
            <Icon icon={playing ? mdiPause : mdiPlay} size="18" />
          </button>
          <input
            class="restore-seek"
            type="range"
            min="0"
            max={duration || 0}
            step="0.04"
            value={time}
            oninput={seek}
            aria-label={$t('ai_inbox_clip_position')}
          />
          <span class="ws-inbox-meta">{clock(time)} / {clock(duration)}</span>
        </div>
      {:else if enlarged}
        <figcaption class="ws-inbox-meta">{enlarged}</figcaption>
      {/if}
    {/if}
  {/key}
  {#if failed}
    <div class="restore-error" role="status">
      <span>{$t('error_loading_image')}</span><button
        class="ws-btn"
        type="button"
        onclick={() => {
          failed = false;
          retry++;
        }}>{$t('retry')}</button
      >
    </div>
  {/if}
</figure>

<style>
  .restore {
    position: relative;
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    min-width: 0;
  }
  .restore.is-card .restore-frame {
    height: 18rem;
    max-width: 100%;
  }
  /* review mode: as large as the stage allows, at the picture's own shape */
  .restore.is-stage {
    container-type: size;
    width: 100%;
    height: 100%;
    align-content: center;
  }
  .restore.is-stage .restore-frame {
    width: min(100cqw, (100cqh - 3rem) * var(--ratio));
  }
  .restore-frame {
    position: relative;
    aspect-ratio: var(--ratio);
    overflow: hidden;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .restore-frame:has(.restore-range:focus-visible) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  .restore-media {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .restore-after {
    position: absolute;
    inset: 0;
    overflow: hidden;
    clip-path: inset(0 0 0 var(--split));
  }
  .restore-line {
    position: absolute;
    inset-block: 0;
    left: var(--split);
    width: 2px;
    translate: -1px 0;
    background: var(--immich-ui-light);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 35%, transparent);
    pointer-events: none;
  }
  .restore-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    translate: -50% -50%;
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    box-shadow: 0 1px 4px color-mix(in oklab, var(--immich-ui-dark) 40%, transparent);
  }
  /* over a photo, a label is inverted like an active workspace, readable on any picture */
  .restore-label {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.1rem 0.45rem;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 78%, transparent);
    color: var(--immich-ui-light);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    pointer-events: none;
  }
  .restore-label-after {
    left: auto;
    right: 0.5rem;
  }
  /* the whole frame is the slider's track: a drag anywhere moves the divider; vertical swipes still scroll */
  .restore-range {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: ew-resize;
    touch-action: pan-y;
  }
  .restore.is-inspect {
    grid-template-rows: minmax(0, 1fr) auto auto;
  }
  .is-inspect .restore-frame {
    width: 100%;
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
  .is-inspect .restore-media {
    transform: var(--inspect-transform);
  }
  .restore-media {
    user-select: none;
    -webkit-user-drag: none;
  }
  .restore-open-surface {
    position: absolute;
    inset: 0;
    z-index: 1;
    cursor: zoom-in;
  }
  .restore-expand {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    z-index: 2;
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    border-radius: var(--ws-radius);
    cursor: zoom-in;
  }
  .restore-expand:focus-visible {
    outline: 2px solid var(--ws-accent);
    outline-offset: 2px;
  }
  .restore-compare-control {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: min(100%, 40rem);
    min-height: 44px;
    padding-inline: 0.5rem;
    color: #fff;
  }
  .restore-compare-control input {
    min-height: 44px;
    flex: 1;
    min-width: 0;
    accent-color: var(--ws-accent);
  }
  .restore-error {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 1rem;
    text-align: center;
    background: var(--immich-ui-light);
  }
  .restore-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    max-width: 40rem;
  }
  .restore-play {
    display: grid;
    place-items: center;
    padding: 0.35rem;
  }
  .restore-seek {
    flex: 1;
    min-width: 0;
    accent-color: var(--ws-accent);
  }
</style>
