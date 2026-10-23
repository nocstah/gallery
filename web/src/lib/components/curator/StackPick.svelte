<script lang="ts">
  // Local Omarchy layer: "Pick the best" for a stack (Curator's pick.best, ~/code/curator/curator/jobs/pick.py). Curator
  // measures every photo of the stack (focus, eyes, smiles, faces cut off, exposure), lets the vision model compare
  // the best few two at a time, both ways round, and names the photo that best keeps the moment, with why and whether
  // the two judges agreed. When it is not the cover already: Make it the cover (accepts the suggestion, undo in the
  // AI inbox's history) or Keep current. Closed before Curator is done, the suggestion waits in the AI inbox.
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { curator, type JobRow, type StackPick } from '$lib/utils/curator';
  import { AssetMediaSize, getStack } from '@immich/sdk';
  import { Icon, toastManager } from '@immich/ui';
  import { mdiClose, mdiStarFourPointsOutline } from '@mdi/js';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    stackId: string;
    onClose: () => void;
    onShow: (assetId: string) => void;
  }

  let { stackId, onClose, onShow }: Props = $props();

  const POLL_MS = 800;
  let pick = $state<StackPick>();
  let status = $state<string>('');
  let error = $state<string>();
  let deciding = $state(false);
  let done = $state(false);
  let gone = false;

  const thumb = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });

  const run = async () => {
    try {
      const { job } = await curator.pickBest(stackId);
      while (!gone) {
        const rows: JobRow[] = await curator.jobs(50);
        const mine = rows.find((row) => row.id === job);
        if (!mine || mine.status === 'cancelled') {
          return onClose();
        }
        if (mine.status === 'failed') {
          error = (mine.error ?? '').split('\n', 1)[0];
          return;
        }
        if (mine.status === 'done') {
          pick = mine.result as unknown as StackPick;
          return;
        }
        status = mine.progress?.note ?? '';
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : String(error_);
    }
  };

  $effect(() => {
    void run();
  });

  onDestroy(() => {
    gone = true;
  });

  const decide = async (accept: boolean) => {
    if (!pick?.suggestion_id || deciding) {
      return;
    }
    deciding = true;
    try {
      const result = await curator.decide([pick.suggestion_id], accept ? 'accept' : 'reject');
      if (accept && !(result.applied ?? []).includes(pick.suggestion_id)) {
        error = $t('ai_inbox_some_failed', { values: { count: 1 } });
        return;
      }
      if (accept) {
        eventManager.emit('StackCreate', await getStack({ id: stackId }));
        toastManager.primary($t('stack_pick_made_cover'));
      }
      done = true;
      onClose();
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : String(error_);
    } finally {
      deciding = false;
    }
  };

  const verdict = $derived.by(() => {
    if (!pick) {
      return '';
    }
    if (pick.decided_by === 'both') {
      return $t('stack_pick_agree');
    }
    if (pick.decided_by === 'vision') {
      return $t('stack_pick_vision');
    }
    return pick.vlm_best ? $t('stack_pick_disagree') : $t('stack_pick_measured');
  });
</script>

<section class="pick dark" aria-label={$t('stack_pick')} aria-live="polite">
  <header class="pick-head">
    <Icon icon={mdiStarFourPointsOutline} size="16" />
    <span class="pick-title">{$t('stack_pick')}</span>
    <button type="button" class="pick-icon" aria-label={$t('close')} title={$t('close')} onclick={onClose}>
      <Icon icon={mdiClose} size="16" />
    </button>
  </header>

  {#if error}
    <p class="pick-note is-error">{error}</p>
  {:else if !pick}
    <p class="pick-note">
      <span class="pick-spinner" aria-hidden="true"></span>{status || $t('stack_pick_working')}
    </p>
    <p class="pick-small">{$t('stack_pick_takes_time')}</p>
  {:else}
    <div class="pick-best">
      <button type="button" class="pick-thumb is-best" onclick={() => onShow(pick!.best)} title={$t('view')}>
        <img src={thumb(pick.best)} alt="" />
      </button>
      <div>
        <p class="pick-headline">{pick.is_cover ? $t('stack_pick_is_cover') : $t('stack_pick_found')}</p>
        <p class="pick-verdict">{verdict}</p>
      </div>
    </div>
    {#if pick.why}
      <p class="pick-why">{pick.why}</p>
    {/if}
    {#if pick.measured.length > 0}
      <p class="pick-small">{$t('stack_pick_measured_better', { values: { reasons: pick.measured.join(', ') } })}</p>
    {/if}
    {#if pick.note}
      <p class="pick-small">{pick.note}</p>
    {/if}
    <div class="pick-strip">
      {#each pick.places.slice(0, 8) as place (place.asset_id)}
        <button
          type="button"
          class="pick-thumb"
          class:is-best={place.asset_id === pick.best}
          onclick={() => onShow(place.asset_id)}
          title={place.flaw ?? ''}
        >
          <img src={thumb(place.asset_id)} alt="" />
          {#if place.flaw}<span class="pick-flaw" aria-hidden="true">!</span>{/if}
        </button>
      {/each}
    </div>
    {#if !pick.is_cover && pick.suggestion_id && !done}
      <div class="pick-actions">
        <button type="button" class="ws-btn-quiet" disabled={deciding} onclick={() => decide(false)}>
          {$t('stack_pick_keep_current')}
        </button>
        <button type="button" class="ws-btn" disabled={deciding} onclick={() => decide(true)}>
          {$t('stack_pick_make_cover')}
        </button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .pick {
    position: absolute;
    inset-inline-start: 1.5rem;
    top: 4.75rem;
    z-index: 2;
    width: min(23rem, calc(100% - 3rem));
    max-height: calc(100% - 13rem);
    overflow-y: auto;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--ws-glass-edge);
    border-radius: 16px;
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: rgb(255 255 255 / 0.92);
    font-size: 0.85rem;
  }
  .pick-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
    color: var(--ws-accent, #fff);
  }
  .pick-title {
    flex: 1;
    font-weight: 700;
    font-size: 0.9rem;
    color: rgb(255 255 255 / 0.95);
  }
  .pick-icon {
    display: grid;
    place-items: center;
    padding: 0.3rem;
    border-radius: var(--ws-radius);
    color: rgb(255 255 255 / 0.75);
  }
  .pick-icon:hover {
    background: rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .pick-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: rgb(255 255 255 / 0.78);
  }
  .pick-note.is-error {
    color: #fff;
    font-weight: 600;
  }
  .pick-small {
    margin-top: 0.35rem;
    font-size: 0.76rem;
    color: rgb(255 255 255 / 0.6);
  }
  .pick-best {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.7rem;
    align-items: center;
  }
  .pick-best .pick-thumb {
    width: 4.5rem;
    height: 4.5rem;
  }
  .pick-headline {
    font-weight: 650;
  }
  .pick-verdict {
    font-size: 0.78rem;
    color: rgb(255 255 255 / 0.65);
  }
  .pick-why {
    margin-top: 0.55rem;
    line-height: 1.4;
    color: rgb(255 255 255 / 0.82);
  }
  .pick-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.6rem;
  }
  .pick-thumb {
    position: relative;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 8px;
    overflow: hidden;
    opacity: 0.75;
    outline: 2px solid transparent;
  }
  .pick-thumb:hover {
    opacity: 1;
  }
  .pick-thumb.is-best {
    opacity: 1;
    outline-color: var(--ws-accent, #fff);
  }
  .pick-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pick-flaw {
    position: absolute;
    top: 2px;
    inset-inline-end: 2px;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: var(--ws-radius);
    background: var(--immich-ui-danger-500);
    font-size: var(--ws-text-micro);
    font-weight: 800;
    line-height: 0.9rem;
    text-align: center;
  }
  .pick-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.75rem;
  }
  .pick-spinner {
    width: 0.9rem;
    height: 0.9rem;
    border: 2px solid rgb(255 255 255 / 0.25);
    border-top-color: var(--ws-accent, #fff);
    border-radius: 50%;
    animation: pick-spin 0.9s linear infinite;
  }
  @keyframes pick-spin {
    to {
      rotate: 1turn;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pick-spinner {
      animation-duration: 3s;
    }
  }
</style>
