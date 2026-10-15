<script lang="ts">
  // Local Omarchy layer: Save frame as photo in the viewer's bar (components/curator/save-frame.svelte.ts), for the
  // owner's own video, or a Live Photo while its video half plays, once Curator says it saves frames. The button spins
  // while Curator works; Shift+S does the same (VLC's snapshot key; plain S is the photo viewer's slideshow). Inside an
  // album the photo joins that album too.
  import { shortcut } from '$lib/actions/shortcut';
  import { saveFrame } from '$lib/components/curator/save-frame.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getSharedLink } from '$lib/utils';
  import { AssetVisibility, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
  import { IconButton } from '@immich/ui';
  import { mdiCameraPlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    /** the album the viewer is open in */
    album?: AlbumResponseDto;
  }

  let { asset, album }: Props = $props();

  const sharedLink = getSharedLink();
  const isOwner = $derived(authManager.authenticated && asset.ownerId === authManager.user.id && !sharedLink);
  $effect(() => {
    if (isOwner) {
      saveFrame.check();
    }
  });

  const offered = $derived(
    saveFrame.available &&
      isOwner &&
      !!saveFrame.video &&
      asset.visibility !== AssetVisibility.Locked &&
      !asset.isTrashed,
  );
  const busy = $derived(saveFrame.isSaving(saveFrame.video?.assetId));
  const title = $derived(busy ? $t('saving_frame_as_photo') : $t('save_frame_as_photo'));

  const save = () => {
    if (offered) {
      void saveFrame.save(album?.id);
    }
  };
</script>

<svelte:document use:shortcut={{ shortcut: { key: 's', shift: true }, onShortcut: save }} />

{#if offered}
  <IconButton
    color="secondary"
    variant="ghost"
    shape="round"
    icon={mdiCameraPlusOutline}
    aria-label={title}
    loading={busy}
    onclick={save}
  />
{/if}
