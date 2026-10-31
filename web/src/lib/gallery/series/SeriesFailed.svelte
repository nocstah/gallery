<script lang="ts">
  // Local Omarchy layer: From the beginning when Curator could not be asked (gallery/series), the page's own state as
  // the AI inbox says it: not answering (and on which port to start it), not the owner's, or Curator's own words, with
  // Retry; a series' own page has the way back to the list beside it.
  import { curatorPort, type CuratorError } from '$lib/utils/curator';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    failure: CuratorError;
    onRetry: () => void;
    /** another way on, after Retry */
    children?: Snippet;
  };

  let { failure, onRetry, children }: Props = $props();

  const offline = $derived(failure.status === 0);
  const denied = $derived(failure.status === 401 || failure.status === 403);
</script>

<div class="ws-empty" data-testid="series-failed">
  <h2 class="ws-empty-title">
    {offline ? $t('ai_inbox_offline_title') : denied ? $t('ai_inbox_denied_title') : failure.message}
  </h2>
  {#if offline || denied}
    <p class="ws-empty-body">
      {offline ? $t('memory_series_offline_body', { values: { port: curatorPort() } }) : failure.message}
    </p>
  {/if}
  <div class="ws-empty-actions">
    <button type="button" class="ws-empty-action" onclick={onRetry}>{$t('retry')}</button>
    {@render children?.()}
  </div>
</div>
