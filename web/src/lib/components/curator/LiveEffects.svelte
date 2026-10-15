<script lang="ts">
  // Local Omarchy layer: photo effects (Curator's live.effect, ~/code/curator/curator/live.py and cinematic.py): for
  // a Live Photo, as in Apple Photos, over its clip playing on a loop the user picks Loop, Bounce or Long exposure, or
  // scrubs to a frame for a new key photo; for any photo, Cinematic (Google Photos'), a slow move through its depth.
  // Curator renders it in a few seconds. The result is a suggestion (a new version in the photo's stack when kept):
  // Keep accepts it, Discard rejects it and goes back to the choice. Hold Original to see the photo as it was. Closed
  // while Curator works, the result waits in the AI inbox.
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { getAssetMediaUrl, getAssetPlaybackUrl } from '$lib/utils';
  import { curator, restoredUrl, type JobRow, type Suggestion } from '$lib/utils/curator';
  import { AssetMediaSize, getAssetInfo, getStack, type AssetResponseDto } from '@immich/sdk';
  import { Icon, toastManager } from '@immich/ui';
  import { mdiClose, mdiMotionPlayOutline } from '@mdi/js';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    onClose: () => void;
  }

  let { asset, onClose }: Props = $props();

  type Effect = 'loop' | 'bounce' | 'long-exposure' | 'key-photo' | 'cinematic';
  type Phase = 'choose' | 'scrub' | 'working' | 'result';
  // a Live Photo has its clip to make loops and long exposures of; any photo can be cinematic
  const isLive = $derived(!!asset.livePhotoVideoId);
  const EFFECTS = $derived<Effect[]>(
    isLive ? ['loop', 'bounce', 'long-exposure', 'key-photo', 'cinematic'] : ['cinematic'],
  );
  const POLL_MS = 700;

  let phase = $state<Phase>('choose');
  let effect = $state<Effect>();
  let job = $state<number>();
  let suggestion = $state<Suggestion>();
  let message = $state<string>();
  let deciding = $state(false);
  let original = $state(false);
  let video = $state<HTMLVideoElement>();
  let duration = $state(0);
  let at = $state(0);
  let gone = false;

  const clipSrc = $derived(
    asset.livePhotoVideoId ? getAssetPlaybackUrl({ id: asset.livePhotoVideoId, cacheKey: asset.thumbhash }) : '',
  );
  const stillSrc = $derived(
    getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Preview, cacheKey: asset.thumbhash }),
  );
  const effectName = (chosen: Effect | undefined) => (chosen ? $t(`live_effect_${chosen.replace('-', '_')}`) : '');
  const resultIsClip = $derived(effect === 'loop' || effect === 'bounce' || effect === 'cinematic');
  const resultSrc = $derived.by(() => {
    if (!suggestion) {
      return '';
    }
    return resultIsClip ? restoredUrl(suggestion.id, 'after', 'mp4') : restoredUrl(suggestion.id, 'after', 'jpg', 2560);
  });

  const fail = (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    message = $t('live_effects_failed', { values: { reason } });
    phase = 'choose';
    job = undefined;
  };

  const follow = async (id: number) => {
    while (!gone && job === id) {
      let rows: JobRow[];
      try {
        rows = await curator.jobs(50);
      } catch (error) {
        fail(error);
        return;
      }
      if (gone || job !== id) {
        return;
      }
      const mine = rows.find((row) => row.id === id);
      if (!mine || mine.status === 'cancelled') {
        phase = 'choose';
        job = undefined;
        return;
      }
      if (mine.status === 'failed') {
        fail((mine.error ?? '').split('\n', 1)[0]);
        return;
      }
      if (mine.status === 'done') {
        const made = mine.result?.suggestion_id;
        if (typeof made !== 'number') {
          fail($t('remove_objects_no_result'));
          return;
        }
        try {
          suggestion = await curator.suggestion(made);
          phase = 'result';
        } catch (error) {
          fail(error);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  };

  const make = async (chosen: Effect) => {
    effect = chosen;
    message = undefined;
    phase = 'working';
    try {
      const { job: id } = await curator.liveEffect(asset.id, chosen, chosen === 'key-photo' ? at : 0);
      job = id;
      void follow(id);
    } catch (error) {
      fail(error);
    }
  };

  const pick = (chosen: Effect) => {
    if (chosen === 'key-photo') {
      effect = chosen;
      phase = 'scrub';
      video?.pause();
      if (video) {
        at = video.currentTime;
      }
      return;
    }
    void make(chosen);
  };

  const scrubTo = (seconds: number) => {
    at = seconds;
    if (video) {
      video.currentTime = seconds;
    }
  };

  const backToChoice = () => {
    phase = 'choose';
    void video?.play().catch(() => undefined);
  };

  const refreshStack = async () => {
    try {
      const updated = await getAssetInfo({ id: asset.id });
      if (updated.stack) {
        eventManager.emit('StackCreate', await getStack({ id: updated.stack.id }));
      }
    } catch {
      // the stack shows on the next visit anyway
    }
  };

  const keep = async () => {
    if (!suggestion || deciding) {
      return;
    }
    deciding = true;
    message = undefined;
    try {
      const result = await curator.decide([suggestion.id], 'accept');
      if (!(result.applied ?? []).includes(suggestion.id)) {
        message = $t('ai_inbox_some_failed', { values: { count: 1 } });
        return;
      }
      toastManager.primary($t('live_effects_kept'));
      await refreshStack();
      close();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      deciding = false;
    }
  };

  const discard = async () => {
    if (!suggestion || deciding) {
      return;
    }
    deciding = true;
    try {
      await curator.decide([suggestion.id], 'reject');
      suggestion = undefined;
      job = undefined;
      backToChoice();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      deciding = false;
    }
  };

  const close = () => {
    gone = true;
    onClose();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement && event.target.type !== 'range') {
      return;
    }
    if (event.key === 'Escape') {
      close();
    }
    // the viewer's own keys (arrows to the next photo, delete) wait while the panel is open
    event.stopPropagation();
  };

  onDestroy(() => {
    gone = true;
  });
</script>

<svelte:window onkeydowncapture={onKeydown} />

<div class="live dark" role="dialog" aria-modal="true" aria-label={$t('live_effects')}>
  <header class="live-head">
    <span class="live-pill live-title">
      <Icon icon={mdiMotionPlayOutline} size="18" />
      {$t('live_effects')}
    </span>
    <button type="button" class="live-pill live-icon" aria-label={$t('close')} title={$t('close')} onclick={close}>
      <Icon icon={mdiClose} size="20" />
    </button>
  </header>

  <div class="live-stage">
    {#if original}
      <img src={stillSrc} alt="" draggable="false" />
    {:else if phase === 'result' && suggestion}
      {#if resultIsClip}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={resultSrc} autoplay loop muted playsinline></video>
      {:else}
        <img src={resultSrc} alt="" draggable="false" />
      {/if}
    {:else}
      {#if !isLive}
        <img src={stillSrc} alt="" draggable="false" />
      {:else}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={video}
          src={clipSrc}
          autoplay={phase !== 'scrub'}
          loop
          muted
          playsinline
          onloadedmetadata={() => (duration = video?.duration ?? 0)}
        ></video>
      {/if}
      {#if phase === 'working'}
        <div class="live-wait" role="status">
          <span class="live-spinner" aria-hidden="true"></span>
          <span>{$t('live_effects_working', { values: { effect: effectName(effect) } })}</span>
        </div>
      {/if}
    {/if}
  </div>

  <footer class="live-foot">
    {#if phase === 'result'}
      <p class="live-note" class:is-error={!!message}>{message ?? suggestion?.detail ?? ''}</p>
      <div class="live-pill live-actions">
        <button
          type="button"
          class="ws-btn-quiet"
          onpointerdown={() => (original = true)}
          onpointerup={() => (original = false)}
          onpointerleave={() => (original = false)}
        >
          {$t('live_effects_original')}
        </button>
        <button type="button" class="ws-btn-quiet" disabled={deciding} onclick={discard}>
          {$t('remove_objects_discard')}
        </button>
        <button type="button" class="ws-btn" disabled={deciding} onclick={keep}>{$t('remove_objects_keep')}</button>
      </div>
    {:else if phase === 'scrub'}
      <p class="live-note">{$t('live_effects_scrub_hint')}</p>
      <div class="live-pill live-actions">
        <input
          class="live-scrub"
          type="range"
          min="0"
          max={duration || 3}
          step="0.01"
          value={at}
          oninput={(event) => scrubTo(Number((event.currentTarget as HTMLInputElement).value))}
          aria-label={$t('live_effect_key_photo')}
        />
        <button type="button" class="ws-btn-quiet" onclick={backToChoice}>{$t('cancel')}</button>
        <button type="button" class="ws-btn" onclick={() => make('key-photo')}>{$t('live_effects_use_frame')}</button>
      </div>
    {:else if phase === 'choose'}
      <p class="live-note" class:is-error={!!message}>{message ?? $t('live_effects_hint')}</p>
      <div class="live-pill live-actions">
        {#each EFFECTS as choice (choice)}
          <button type="button" class="ws-btn-quiet" onclick={() => pick(choice)}>
            {effectName(choice)}
          </button>
        {/each}
      </div>
    {/if}
  </footer>
</div>

<style>
  .live {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem) 1rem;
    color: rgb(255 255 255 / 0.9);
  }
  .live-head,
  .live-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .live-foot {
    justify-content: center;
  }
  /* smoked glass over the photo, as the viewer's own bar */
  .live-pill {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--ws-glass-edge);
    border-radius: var(--ws-radius);
    background: var(--ws-glass);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
  }
  .live-title {
    gap: 0.45rem;
    padding: 0.4rem 0.85rem 0.4rem 0.65rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .live-icon {
    display: grid;
    place-items: center;
    padding: 0.45rem;
  }
  button.live-icon:hover {
    background: rgb(255 255 255 / 0.1);
  }
  .live-actions {
    gap: 0.25rem;
    padding: 4px;
  }
  .live-actions .ws-btn,
  .live-actions .ws-btn-quiet {
    border-radius: var(--ws-radius);
  }
  .live-scrub {
    width: min(18rem, 50vw);
    margin-inline: 0.6rem 0.3rem;
    accent-color: var(--ws-accent);
  }
  .live-note {
    flex-basis: 100%;
    max-width: 48rem;
    margin-inline: auto;
    text-align: center;
    font-size: 0.85rem;
    color: rgb(255 255 255 / 0.72);
  }
  .live-note.is-error {
    color: #fff;
    font-weight: 600;
  }
  .live-stage {
    position: relative;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .live-stage video,
  .live-stage img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
  }
  .live-wait {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    translate: -50% 0;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.6rem 1rem;
    border: 1px solid var(--ws-glass-edge);
    border-radius: 14px;
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .live-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgb(255 255 255 / 0.25);
    border-top-color: var(--ws-accent);
    border-radius: 50%;
    animation: live-spin 0.9s linear infinite;
  }
  @keyframes live-spin {
    to {
      rotate: 1turn;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-spinner {
      animation-duration: 3s;
    }
  }
</style>
