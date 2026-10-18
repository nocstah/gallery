<script lang="ts">
  // Local Omarchy layer: what a shared link says when it no longer opens (DESIGN.md, Error pages), where upstream
  // said "Page not found :/" over the server's "Invalid share key". The server answers a link that expired, one that
  // was turned off and one that never existed (cut short when it was copied) the same way, so the words are true for
  // all three, and they tell the person holding it what to do: ask whoever sent it for a new one. Gallery's own look,
  // on its own on the ground (a link's visitor has no shell), the same words as the public link page's
  // (immich-public-proxy, whose files live with the deployment).
  import { page } from '$app/state';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { errorCode, errorPageKind } from '$lib/utils/error-page';
  import { t } from 'svelte-i18n';

  const kind = $derived(
    errorPageKind({
      status: errorCode(page.error) ?? page.status,
      message: page.error?.message,
      routeId: page.route?.id,
      params: page.params,
    }),
  );
  const words = $derived(
    kind === 'link'
      ? { title: $t('shared_link_ended_title'), body: $t('shared_link_ended_body') }
      : kind === 'offline'
        ? { title: $t('error_page_offline_title'), body: $t('error_page_offline_body') }
        : { title: $t('error_page_failed_title'), body: $t('error_page_failed_body') },
  );
</script>

<svelte:head>
  <title>{words.title} - Immich</title>
</svelte:head>

<main class="ws-standalone">
  <div class="ws-empty" data-testid="shared-link-error" data-kind={kind}>
    <h1 class="ws-empty-title">{words.title}</h1>
    <p class="ws-empty-body">{words.body}</p>
    {#if kind !== 'link'}
      <div class="ws-empty-actions">
        <button type="button" class="ws-empty-action" onclick={() => location.reload()}>{$t('retry')}</button>
      </div>
    {:else if authManager.authenticated}
      <!-- someone signed in (the owner opening an old link) has the archive to go back to -->
      <div class="ws-empty-actions">
        <a class="ws-empty-link" href={Route.photos()}>{$t('error_page_go_to_photos')}</a>
      </div>
    {/if}
  </div>
</main>
