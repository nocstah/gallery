<script lang="ts">
  import SharedLinkFormFields from '#lib/components/SharedLinkFormFields.svelte';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getSharedLinkQuery } from '#lib/queries/shared-link.query.ts';
  import { Route } from '#lib/route.ts';
  import { handleUpdateSharedLink } from '#lib/services/shared-link.service.ts';
  import { linkName } from '#lib/utils/shared-link-words.ts';
  import { FormModal } from '@immich/ui';
  import { mdiLink } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import type { PageProps } from './$types';

  const { params }: PageProps = $props();

  const query = createPreloadedQuery(() => getSharedLinkQuery(params.id));
  const sharedLink = $derived(query.data);

  let description = $state(sharedLink.description ?? '');
  let allowDownload = $state(sharedLink.allowDownload);
  let allowUpload = $state(sharedLink.allowUpload);
  let showMetadata = $state(sharedLink.showMetadata);
  let password = $state(sharedLink.password ?? '');
  let slug = $state(sharedLink.slug ?? '');
  const named = $derived(linkName($t, { ...sharedLink, description }));
  let expiresAt = $state(sharedLink.expiresAt);

  const onClose = () => void goto(Route.sharedLinks());
  const onSubmit = async () => {
    const sharedLinkEditDto = {
      description,
      password: password ?? null,
      expiresAt,
      allowUpload,
      allowDownload,
      showMetadata,
      slug: slug.trim() ?? null,
    };
    // Local Omarchy layer: upstream's mutation, through the service that also tells Kioku's share sheets
    if (await handleUpdateSharedLink(sharedLink, sharedLinkEditDto)) {
      onClose();
    }
  };
</script>

<FormModal title={$t('edit_link')} icon={mdiLink} {onClose} {onSubmit} submitText={$t('confirm')} size="small">
  <!-- Local Omarchy layer: what the link shows, in the Shared links page's words (utils/shared-link-words), where
       upstream said "Public album" or "Individual share" -->
  <p class="text-sm" data-testid="shared-link-edit-name">
    {#if named.what}<span class="text-muted">{named.what} ·</span>{/if}
    <span class="font-semibold">{named.name}</span>
  </p>

  <SharedLinkFormFields
    bind:slug
    bind:password
    bind:description
    bind:allowDownload
    bind:allowUpload
    bind:showMetadata
    bind:expiresAt
  />
</FormModal>
