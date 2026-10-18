<script lang="ts">
  // Local Omarchy layer: review mode. One kind (all its batches, utils/curator-inbox), one suggestion at a time, full
  // screen and large, decided from the keyboard: A or → accepts, R or ← rejects, S or Space skips, U takes back the
  // last decision (an accepted change is undone, a rejection reopened), Esc closes; the arrows belong to a slider
  // while it has focus. The next suggestion's photos load while this one is on screen.
  import ReviewStage from '$lib/components/curator/ReviewStage.svelte';
  import StoryText from '$lib/components/curator/StoryText.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { curator, type Suggestion } from '$lib/utils/curator';
  import { waitingIn } from '$lib/utils/curator-inbox';
  import { AssetMediaSize } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    /** the kind's batches, reviewed as one queue */
    keys: string[];
    title: string;
    onClose: () => void;
  }

  let { keys, title, onClose }: Props = $props();

  let items = $state<Suggestion[]>([]);
  let index = $state(0);
  let decided = $state<{ id: number; decision: 'accept' | 'reject'; at: number }[]>([]);
  let busy = $state(false);
  let message = $state<string>();
  let loaded = $state(false);
  let dialog = $state<HTMLElement>();

  const current = $derived(items[index]);
  const done = $derived(decided.length);

  const preload = (suggestion: Suggestion | undefined) => {
    for (const id of suggestion?.asset_ids.slice(0, 2) ?? []) {
      new Image().src = getAssetMediaUrl({ id, size: AssetMediaSize.Preview });
    }
  };

  const advance = () => {
    index += 1;
    preload(items[index + 1]);
  };

  const decide = async (decision: 'accept' | 'reject') => {
    if (!current || busy) {
      return;
    }
    busy = true;
    message = undefined;
    const id = current.id;
    try {
      const result = await curator.decide([id], decision);
      if (decision === 'accept' && !(result.applied ?? []).includes(id)) {
        message = $t('ai_inbox_some_failed', { values: { count: 1 } });
        return;
      }
      decided = [...decided, { id, decision, at: index }];
      advance();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  };

  const takeBack = async () => {
    const last = decided.at(-1);
    if (!last || busy) {
      return;
    }
    busy = true;
    message = undefined;
    try {
      if (last.decision === 'accept') {
        const result = await curator.undo([last.id]);
        const problem = result.conflicts[0] ?? result.failed?.[0];
        if (!result.undone.includes(last.id)) {
          message = problem ? $t('ai_inbox_conflict', { values: { reason: problem.reason } }) : undefined;
          return;
        }
      } else {
        await curator.reopen([last.id]);
      }
      decided = decided.slice(0, -1);
      index = last.at;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('video')) {
      return; // the reel player keeps its own keys
    }
    if (event.target instanceof HTMLInputElement && event.target.type === 'range' && event.key.startsWith('Arrow')) {
      return; // so do the before/after divider and a clip's position
    }
    const key = event.key.toLowerCase();
    switch (key) {
      case 'escape': {
        onClose();

        break;
      }
      case 'a':
      case 'arrowright': {
        void decide('accept');

        break;
      }
      case 'r':
      case 'arrowleft': {
        void decide('reject');

        break;
      }
      case 's':
      case ' ': {
        advance();

        break;
      }
      case 'u':
      case 'backspace': {
        void takeBack();

        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  onMount(() => {
    void waitingIn(keys).then((found) => {
      items = found;
      loaded = true;
      preload(items[1]);
    });
    dialog?.focus();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="review" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={dialog}>
  <header class="review-head">
    <span class="ws-inbox-row-title">{title}</span>
    {#if loaded}
      <span class="ws-inbox-meta">
        {$t('ai_inbox_review_progress', { values: { done, total: items.length } })}
      </span>
    {/if}
    <span class="ws-inbox-meta review-keys">{$t('ai_inbox_review_keys')}</span>
    <button type="button" class="ws-btn-quiet review-close" aria-label={$t('close')} onclick={onClose}>
      <Icon icon={mdiClose} size="20" />
    </button>
  </header>

  <main class="review-stage">
    {#if current}
      {#key current.id}
        <ReviewStage suggestion={current} />
      {/key}
    {:else if loaded}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('ai_inbox_review_done')}</h2>
        <div class="ws-empty-actions">
          <button type="button" class="ws-empty-action" onclick={onClose}>{$t('close')}</button>
        </div>
      </div>
    {/if}
  </main>

  {#if current}
    <footer class="review-foot">
      <div class="review-text">
        <span class="ws-inbox-row-title">{current.title}</span>
        {#if current.detail}
          <p class="ws-inbox-row-body">{current.detail}</p>
        {/if}
        {#if current.story}
          <StoryText story={current.story} kind={current.kind} />
        {/if}
        {#if message}
          <p class="review-message" role="status">{message}</p>
        {/if}
      </div>
      <div class="review-actions">
        <button type="button" class="ws-btn-quiet" disabled={busy || decided.length === 0} onclick={takeBack}>
          {$t('undo')}
        </button>
        <button type="button" class="ws-btn-quiet" disabled={busy} onclick={advance}>{$t('skip')}</button>
        <button type="button" class="ws-btn-quiet" disabled={busy} onclick={() => decide('reject')}>
          {$t('ai_inbox_reject')}
        </button>
        <button type="button" class="ws-btn" disabled={busy} onclick={() => decide('accept')}>{$t('accept')}</button>
      </div>
    </footer>
  {/if}
</div>

<style>
  .review {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
  }
  .review:focus {
    outline: none;
  }
  .review-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.25rem;
    padding: 0.75rem clamp(1rem, 3vw, 2rem);
    border-bottom: 1px solid var(--ws-hairline);
  }
  .review-keys {
    margin-inline-start: auto;
  }
  .review-close {
    display: grid;
    place-items: center;
    padding: 0.4rem;
  }
  .review-stage {
    min-height: 0;
    padding: calc(var(--ws-gap) * 1.5) clamp(1rem, 3vw, 2rem);
  }
  .review-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 2rem;
    padding: 1rem clamp(1rem, 3vw, 2rem) 1.25rem;
    border-top: 1px solid var(--ws-hairline);
  }
  .review-text {
    display: grid;
    gap: 0.3rem;
    flex: 1 1 24rem;
    min-width: 0;
  }
  .review-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .review-message {
    font-size: 0.9rem;
    font-weight: 600;
  }
  @media (max-width: 767px) {
    .review-keys {
      display: none;
    }
  }
</style>
