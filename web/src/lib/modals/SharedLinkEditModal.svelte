<script lang="ts">
  // Local Omarchy layer: a link's options (custom URL, password, description, its end, location, download, upload) from
  // the Share sheet, in a dialog over it, so changing a link never leaves the album or the photos for the Shared links
  // page. The same fields and the same save as that page's Edit link (routes/(user)/shared-links/(list)/[id]/edit).
  import SharedLinkFormFields from '$lib/components/SharedLinkFormFields.svelte';
  import { handleUpdateSharedLink } from '$lib/services/shared-link.service';
  import type { SharedLinkResponseDto } from '@immich/sdk';
  import { FormModal } from '@immich/ui';
  import { mdiLink } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    sharedLink: SharedLinkResponseDto;
    onClose: () => void;
  };

  let { sharedLink, onClose }: Props = $props();

  // the form starts from the link as it is when the dialog opens
  // svelte-ignore state_referenced_locally
  const link = sharedLink;
  let description = $state(link.description ?? '');
  let allowDownload = $state(link.allowDownload);
  let allowUpload = $state(link.allowUpload);
  let showMetadata = $state(link.showMetadata);
  let password = $state(link.password ?? '');
  let slug = $state(link.slug ?? '');
  let expiresAt = $state(link.expiresAt);

  const onSubmit = async () => {
    const success = await handleUpdateSharedLink(link, {
      description,
      password: password ?? null,
      expiresAt,
      allowUpload,
      allowDownload,
      showMetadata,
      slug: slug.trim() ?? null,
    });
    if (success) {
      onClose();
    }
  };
</script>

<FormModal title={$t('edit_link')} icon={mdiLink} {onClose} {onSubmit} submitText={$t('save')} size="small">
  <!-- the house switches (omarchy-world.css), as on the sheet it came from -->
  <div class="ws-sheet-form">
    <SharedLinkFormFields
      bind:slug
      bind:password
      bind:description
      bind:allowDownload
      bind:allowUpload
      bind:showMetadata
      bind:expiresAt
    />
  </div>
</FormModal>
