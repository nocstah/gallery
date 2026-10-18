<script lang="ts">
  // Local Omarchy layer: a change the library chat proposed (an album), with Accept and Reject. It is an ordinary
  // suggestion in the AI inbox's "Asked in chat" batch, so its state comes from Curator: decided here or in the inbox,
  // it reads the same in both places, also when the conversation is opened again later.
  import { curator, CuratorError, type ChatProposal, type SuggestionStatus } from '$lib/utils/curator';
  import { t, type Translations } from 'svelte-i18n';

  interface Props {
    proposal: ChatProposal;
  }

  let { proposal }: Props = $props();

  const STATUS_LABEL: Record<SuggestionStatus, Translations> = {
    pending: 'waiting',
    applied: 'ai_inbox_applied',
    rejected: 'ai_inbox_rejected',
    failed: 'failed',
    undone: 'ai_inbox_undone',
    superseded: 'ai_inbox_replaced',
  };

  let status = $state<SuggestionStatus>();
  let busy = $state(false);
  let problem = $state<string>();

  $effect(() => {
    const asked = proposal.id;
    curator
      .suggestion(asked)
      .then((suggestion) => {
        if (asked === proposal.id) {
          status = suggestion.status;
        }
      })
      .catch(() => undefined);
  });

  const decide = async (decision: 'accept' | 'reject') => {
    busy = true;
    problem = undefined;
    try {
      const result = await curator.decide([proposal.id], decision);
      if (decision === 'reject') {
        status = 'rejected';
      } else if ((result.applied ?? []).includes(proposal.id)) {
        status = 'applied';
      } else {
        problem = $t('chat_proposal_failed');
        const now = await curator.suggestion(proposal.id);
        status = now.status;
      }
    } catch (error) {
      problem = error instanceof CuratorError ? error.message : String(error);
    } finally {
      busy = false;
    }
  };
</script>

<div class="chat-proposal">
  <div class="chat-proposal-text">
    <span class="chat-proposal-title">{proposal.title}</span>
    <span class="ws-inbox-meta">
      {$t('chat_photos_count', { values: { count: proposal.photos } })}{#if status && status !== 'pending'}
        · {$t(STATUS_LABEL[status])}{/if}
    </span>
    {#if problem}
      <span class="chat-proposal-problem" role="status">{problem}</span>
    {/if}
  </div>
  <div class="chat-proposal-actions">
    {#if status === 'pending' || status === undefined}
      <button type="button" class="ws-btn" disabled={busy || status === undefined} onclick={() => decide('accept')}>
        {$t('accept')}
      </button>
      <button
        type="button"
        class="ws-btn-quiet"
        disabled={busy || status === undefined}
        onclick={() => decide('reject')}
      >
        {$t('ai_inbox_reject')}
      </button>
    {/if}
    <a class="ws-inbox-link" href="/inbox">{$t('chat_open_inbox')}</a>
  </div>
</div>

<style>
  .chat-proposal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
    max-width: 52rem;
    margin-top: 0.6rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
  }
  .chat-proposal-text {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .chat-proposal-title {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .chat-proposal-problem {
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .chat-proposal-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.75rem;
  }
</style>
