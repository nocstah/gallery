<script lang="ts">
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { OnSetVisibility } from '$lib/utils/actions';
  import { handleError } from '$lib/utils/handle-error';
  import { setLockedWithCompanions } from '$lib/utils/locked-companions';
  import { Button, modalManager } from '@immich/ui';
  import { mdiLockOpenVariantOutline, mdiLockOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    onVisibilitySet: OnSetVisibility;
    menuItem?: boolean;
    unlock?: boolean;
  }

  let { onVisibilitySet, menuItem = false, unlock = false }: Props = $props();
  let loading = $state(false);

  const setLockedVisibility = async () => {
    const isConfirmed = await modalManager.showDialog({
      // Local Omarchy layer: the dialog is titled by the menu item that opens it ("Move out of the Locked Folder")
      title: unlock ? $t('move_off_locked_folder') : $t('move_to_locked_folder'),
      prompt: unlock ? $t('remove_from_locked_folder_confirmation') : $t('move_to_locked_folder_confirmation'),
      confirmText: $t('move'),
      confirmColor: unlock ? 'danger' : 'primary',
      icon: unlock ? mdiLockOpenVariantOutline : mdiLockOutline,
    });

    if (!isConfirmed) {
      return;
    }

    try {
      loading = true;
      const assetIds = assetMultiSelectManager.assets.map(({ id }) => id);

      // Local Omarchy layer: the stack mates and Live Photo videos move with them
      onVisibilitySet(await setLockedWithCompanions(assetIds, unlock));
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_settings'));
    } finally {
      loading = false;
    }
  };
</script>

{#if menuItem}
  <MenuOption
    onClick={setLockedVisibility}
    text={unlock ? $t('move_off_locked_folder') : $t('move_to_locked_folder')}
    icon={unlock ? mdiLockOpenVariantOutline : mdiLockOutline}
  />
{:else}
  <Button
    leadingIcon={unlock ? mdiLockOpenVariantOutline : mdiLockOutline}
    disabled={loading}
    size="medium"
    color="secondary"
    variant="ghost"
    onclick={setLockedVisibility}
  >
    {unlock ? $t('move_off_locked_folder') : $t('move_to_locked_folder')}
  </Button>
{/if}
