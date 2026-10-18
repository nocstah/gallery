<script lang="ts">
  import { cleanClass } from '$lib';
  import { Icon } from '@immich/ui';
  import { mdiAlertCircleOutline, mdiPauseCircleOutline, mdiPlayCircleOutline } from '@mdi/js';
  import { Duration } from 'luxon';
  import type { ClassValue } from 'svelte/elements';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';

  interface Props {
    url: string;
    durationInSeconds?: number;
    enablePlayback?: boolean;
    playbackOnIconHover?: boolean;
    showTime?: boolean;
    curve?: boolean;
    playIcon?: string;
    pauseIcon?: string;
    class?: ClassValue;
    /** Local Omarchy layer: the corner badge's own hook (`ws-live-badge`: a Live Photo's mark, shown only while the tile
     * is pointed at or holds the focus) */
    badgeClass?: ClassValue;
  }

  let {
    url,
    durationInSeconds = 0,
    enablePlayback = $bindable(false),
    playbackOnIconHover = false,
    showTime = true,
    curve = false,
    playIcon = mdiPlayCircleOutline,
    pauseIcon = mdiPauseCircleOutline,
    class: className,
    badgeClass,
  }: Props = $props();

  let remainingSeconds = $state(durationInSeconds);
  let loading = $state(true);
  let error = $state(false);
  let player: HTMLVideoElement | undefined = $state();

  $effect(() => {
    if (!enablePlayback) {
      remainingSeconds = durationInSeconds;
      return;
    }
    if (!player) {
      return;
    }
    const video = player;
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  });
  const onMouseEnter = () => {
    if (playbackOnIconHover) {
      enablePlayback = true;
    }
  };

  const onMouseLeave = () => {
    if (playbackOnIconHover) {
      enablePlayback = false;
    }
  };
</script>

{#if enablePlayback}
  <!-- Local Omarchy layer: a video playing under the pointer is heard while Shift is held -->
  <video
    bind:this={player}
    class={cleanClass('h-full w-full object-cover', className)}
    class:rounded-xl={curve}
    muted={!keyboardManager.shift}
    autoplay
    loop
    src={url}
    onplay={() => {
      loading = false;
      error = false;
    }}
    onerror={() => {
      if (!player?.src) {
        // Do not show error when the URL is empty.
        return;
      }
      error = true;
      loading = false;
    }}
    ontimeupdate={({ currentTarget }) => {
      const remaining = currentTarget.duration - currentTarget.currentTime;
      remainingSeconds = Math.min(Math.ceil(Number.isNaN(remaining) ? Infinity : remaining), durationInSeconds);
    }}
  ></video>
{/if}

<!-- Local Omarchy layer: ws-tile-corner, what sits at the tile's top corner, which gives way to a month mark on a tile too
     narrow for both; the time and the icon are one chip, every corner badge's (ws-tile-badge: strong glass, data type;
     omarchy-world.css), where they were white under a shadow -->
<div class="ws-tile-corner @container absolute inset-x-0 top-0 flex justify-end">
  <span class={['ws-tile-badge', badgeClass]}>
    {#if showTime}
      <span class="ws-tile-badge-text hidden @min-[100px]:inline">
        {#if remainingSeconds < 60}
          {Duration.fromObject({ seconds: remainingSeconds }).toFormat('m:ss')}
        {:else if remainingSeconds < 3600}
          {Duration.fromObject({ seconds: remainingSeconds }).toFormat('mm:ss')}
        {:else}
          {Duration.fromObject({ seconds: remainingSeconds }).toFormat('h:mm:ss')}
        {/if}
      </span>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="flex" onmouseenter={onMouseEnter} onmouseleave={onMouseLeave}>
      {#if enablePlayback}
        {#if loading}
          <LoadingSpinner size="small" />
        {:else if error}
          <Icon icon={mdiAlertCircleOutline} size="16" class="text-red-600" />
        {:else}
          <Icon icon={pauseIcon} size="16" />
        {/if}
      {:else}
        <Icon icon={playIcon} size="16" />
      {/if}
    </span>
  </span>
</div>
