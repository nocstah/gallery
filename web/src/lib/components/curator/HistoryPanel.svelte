<script lang="ts">
  // Local Omarchy layer: every change Curator has written, newest first, each undoable on its own. Undo refuses when
  // the photo, stack or person changed again since, so it never overwrites a newer choice.
  import { curator, type HistoryEntry } from '$lib/utils/curator';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    onChange: () => void;
  }

  let { onChange }: Props = $props();

  let entries = $state<HistoryEntry[]>();
  let message = $state<string>();

  const load = async () => {
    entries = await curator.history(200);
  };

  const undo = async (entry: HistoryEntry) => {
    if (entry.suggestion_id === null) {
      return;
    }
    message = undefined;
    const result = await curator.undo([entry.suggestion_id]);
    const problem = result.conflicts[0] ?? result.failed?.[0];
    if (problem) {
      message = $t('ai_inbox_conflict', { values: { reason: problem.reason } });
    }
    await load();
    onChange();
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleString($locale ?? undefined, { dateStyle: 'medium', timeStyle: 'short' });

  onMount(() => {
    void load();
  });
</script>

{#if message}
  <p class="history-message" role="status">{message}</p>
{/if}

{#if entries && entries.length === 0}
  <div class="ws-empty">
    <h2 class="ws-empty-title">{$t('ai_inbox_history_empty')}</h2>
  </div>
{:else if entries}
  <ul class="ws-inbox-rows">
    {#each entries as entry (entry.id)}
      <li>
        <div class="ws-inbox-row history-row" data-undone={entry.undone_at ? true : undefined}>
          <div class="ws-strip">
            {#each [...new Set(entry.asset_ids)].slice(0, 3) as id (id)}
              <img
                class="ws-strip-tile"
                src={getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail })}
                alt=""
                loading="lazy"
                width="48"
                height="48"
              />
            {/each}
          </div>
          <div class="history-text">
            <span class="ws-inbox-row-title">{entry.title ?? entry.action}</span>
            <span class="ws-inbox-meta">{entry.action} · {when(entry.applied_at)}</span>
          </div>
          {#if entry.undone_at}
            <span class="ws-inbox-meta">{$t('ai_inbox_undone')}</span>
          {:else if entry.suggestion_id !== null}
            <button type="button" class="ws-btn-quiet" onclick={() => undo(entry)}>{$t('undo')}</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .history-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }
  .history-row :global(.ws-strip-tile) {
    width: 48px;
    height: 48px;
  }
  .history-row[data-undone] {
    opacity: 0.55;
  }
  .history-text {
    display: grid;
    gap: 0.2rem;
  }
  .history-message {
    padding-top: 1rem;
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
</style>
