<script lang="ts">
  import MenuOption from '#lib/components/shared-components/context-menu/MenuOption.svelte';
  import { removeFromSpace } from '#lib/gallery/space-remove/space-removal.ts';
  import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
  import { IconButton } from '@immich/ui';
  import { mdiImageRemoveOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    spaceId: string;
    onRemove?: (assetIds: string[]) => void;
    /** Local Omarchy layer: a row of the photos' right-click menu (gallery/photo-menu) */
    menuItem?: boolean;
  }

  let { spaceId, onRemove, menuItem = false }: Props = $props();

  // The flow (confirmation, removal, messages) is shared with removing from the Photos timeline.
  const remove = async () => {
    const removedAssetIds = await removeFromSpace(
      spaceId,
      assetMultiSelectManager.assets.map((asset) => asset.id),
    );
    if (removedAssetIds.length > 0) {
      onRemove?.(removedAssetIds);
    }
  };
</script>

{#if menuItem}
  <MenuOption text={$t('remove_from_space')} icon={mdiImageRemoveOutline} onClick={remove} />
{:else}
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    aria-label={$t('remove_from_space')}
    icon={mdiImageRemoveOutline}
    onclick={remove}
  />
{/if}
