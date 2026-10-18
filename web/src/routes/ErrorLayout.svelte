<script lang="ts">
  // Local Omarchy layer: the error page in the Empty State's grammar (DESIGN.md, Error pages), where upstream showed a
  // red siren, "Validation failed (HTTP 400)", a stack trace and links to Immich's Discord, releases and Docker docs.
  // It says in plain words what failed (an album, a person, a photo, a Space, a shared link: utils/error-page), offers
  // a way back (or Retry, when something failed rather than went missing), and keeps the status, message and stack in
  // a collapsed Details for the server's admin only. Someone signed in keeps the shell (bar and sidebar) around what
  // is missing, so the rest of the archive is one click away; anyone else, and a page that failed or a Gallery that
  // is not answering, gets the page on its own.
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import SharedLinkErrorPage from '$lib/components/pages/SharedLinkErrorPage.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { copyToClipboard } from '$lib/utils';
  import { errorCode, errorPageKind, isMissingKind, type ErrorPageKind } from '$lib/utils/error-page';
  import { Icon } from '@immich/ui';
  import { mdiChevronRight } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    error?: { message: string; code?: string | number; stack?: string } | undefined | null;
  }

  let { error = undefined }: Props = $props();

  // the page's own error carries the status; an error the root layout caught while starting (Gallery not answering)
  // carries its own, if any
  const code = $derived(errorCode(error) ?? (page.error ? page.status : undefined));
  const kind = $derived(
    errorPageKind({ status: code, message: error?.message, routeId: page.route?.id, params: page.params }),
  );
  const missing = $derived(isMissingKind(kind));
  const isAdmin = $derived(authManager.authenticated && authManager.user.isAdmin);
  // signed in, the shell stays around what is missing on a user page (or at an address with no page); a link's
  // visitor, the sign-in and admin pages, and a Gallery that failed or is not answering get the page alone
  const inShell = $derived(
    authManager.authenticated && missing && (!page.route?.id || page.route.id.startsWith('/(user)')),
  );

  const words = $derived.by((): { title: string; body: string } => {
    const by: Record<Exclude<ErrorPageKind, 'link'>, { title: string; body: string }> = {
      album: { title: $t('error_page_album_title'), body: $t('error_page_album_body') },
      person: { title: $t('error_page_person_title'), body: $t('error_page_person_body') },
      photo: { title: $t('error_page_photo_title'), body: $t('error_page_photo_body') },
      space: { title: $t('error_page_space_title'), body: $t('error_page_space_body') },
      page: { title: $t('error_page_missing_title'), body: $t('error_page_missing_body') },
      offline: { title: $t('error_page_offline_title'), body: $t('error_page_offline_body') },
      failed: { title: $t('error_page_failed_title'), body: $t('error_page_failed_body') },
    };
    return by[kind === 'link' ? 'failed' : kind];
  });

  // Back only where Gallery itself brought the person here; opened from a link in a message there is no page to go
  // back to, and Photos is the way in
  let cameFromGallery = $state(false);
  afterNavigate(({ from, to, type }) => {
    if (type === 'enter') {
      cameFromGallery = false;
    } else if (from && from.url.pathname !== to?.url.pathname) {
      // (a page's own replaceState on the same address is not a way here)
      cameFromGallery = true;
    }
  });

  const details = $derived([code ? `HTTP ${code}` : '', error?.message ?? ''].filter(Boolean).join(' · '));
  const handleCopy = async () => {
    await copyToClipboard([details, error?.stack].filter(Boolean).join('\n'));
  };
</script>

<svelte:head>
  <title>{kind === 'link' ? $t('shared_link_ended_title') : words.title} - Immich</title>
</svelte:head>

{#snippet content()}
  <div class="ws-empty" data-testid="error-page" data-kind={kind}>
    <h1 class="ws-empty-title">{words.title}</h1>
    <p class="ws-empty-body">{words.body}</p>
    <div class="ws-empty-actions">
      {#if !missing}
        <button type="button" class="ws-empty-action" onclick={() => location.reload()}>{$t('retry')}</button>
        <a class="ws-empty-link" href={Route.photos()}>{$t('error_page_go_to_photos')}</a>
      {:else if cameFromGallery}
        <button type="button" class="ws-empty-action" onclick={() => history.back()}>{$t('go_back')}</button>
        <a class="ws-empty-link" href={Route.photos()}>{$t('error_page_go_to_photos')}</a>
      {:else}
        <a class="ws-empty-action" href={Route.photos()}>{$t('error_page_go_to_photos')}</a>
      {/if}
    </div>
  </div>
  {#if isAdmin && details}
    <!-- under the Empty State's column, as wide as a page column, so a stack's lines can be read on a wide screen -->
    <details class="ws-error-details" data-testid="error-details">
      <summary><Icon icon={mdiChevronRight} size="16" class="ws-error-details-chevron" />{$t('details')}</summary>
      <p class="ws-error-details-line">{details}</p>
      {#if error?.stack}
        <pre class="ws-error-stack">{error.stack}</pre>
      {/if}
      <button type="button" class="ws-empty-link" onclick={handleCopy}>{$t('error_page_copy_details')}</button>
    </details>
  {/if}
{/snippet}

{#if kind === 'link'}
  <SharedLinkErrorPage />
{:else if inShell}
  <UserPageLayout>
    {@render content()}
  </UserPageLayout>
{:else}
  <main class="ws-standalone">
    {@render content()}
  </main>
{/if}
