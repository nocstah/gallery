<script lang="ts">
  import { goto } from '$app/navigation';
  import SharedLinkFormFields from '$lib/components/SharedLinkFormFields.svelte';
  import { Route } from '$lib/route';
  import { handleUpdateSharedLink } from '$lib/services/shared-link.service';
  import { linkName } from '$lib/utils/shared-link-words';
  import { FormModal } from '@immich/ui';
  import { mdiLink } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const sharedLink = $state(data.sharedLink);

  let description = $state(sharedLink.description ?? '');
  let allowDownload = $state(sharedLink.allowDownload);
  let allowUpload = $state(sharedLink.allowUpload);
  let showMetadata = $state(sharedLink.showMetadata);
  let password = $state(sharedLink.password ?? '');
  let slug = $state(sharedLink.slug ?? '');
  const named = $derived(linkName($t, { ...sharedLink, description }));
  let expiresAt = $state(sharedLink.expiresAt);

  const onClose = async () => {
    await goto(Route.sharedLinks());
  };

  const onSubmit = async () => {
    const success = await handleUpdateSharedLink(sharedLink, {
      description,
      password: password ?? null,
      expiresAt,
      allowUpload,
      allowDownload,
      showMetadata,
      slug: slug.trim() ?? null,
    });
    if (success) {
      await onClose();
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
