<script lang="ts">
  // Local Omarchy layer: a Curator panel's own wait and failure in one quiet line, as the Shared feed says them: what it
  // waits for, shown only once the wait is noticeable, or what could not load, with Retry beside it. The page's own
  // state (Curator not answering at all, or not its owner's) stays the inbox page's.
  import { t } from 'svelte-i18n';

  interface Props {
    /** what the panel waits for, while it waits */
    waiting: string;
    /** what could not load, once it failed */
    failure?: string;
    onRetry: () => void;
  }

  let { waiting, failure, onRetry }: Props = $props();
</script>

{#if failure}
  <p class="panel-status" role="status" data-testid="panel-failed">
    <span>{failure}</span>
    <button type="button" class="ws-inbox-link" onclick={onRetry}>{$t('retry')}</button>
  </p>
{:else}
  <p class="panel-status panel-waiting" role="status" data-testid="panel-waiting">{waiting}</p>
{/if}

<style>
  /* the Shared feed's status line: muted words at the ui size, Retry as the inbox's links, on the panel's gutter */
  .panel-status {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem 0.75rem;
    max-width: 60rem;
    padding: calc(var(--ws-gap) * 0.6) 0 0.75rem;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-ui);
  }
  .panel-status .ws-inbox-link {
    color: var(--immich-ui-dark);
  }
  /* the first look is usually there at once: say it is coming only when it is not */
  .panel-waiting {
    animation: panel-appear 1ms 400ms both;
  }
  @keyframes panel-appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
