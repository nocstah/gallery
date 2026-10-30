<script lang="ts">
  // Local Omarchy layer: the trash's Restore as a row of the photo menu (PhotoMenu), doing what the trash bar's Restore
  // does (routes/(user)/trash/RestoreAction, a button only): the selection leaves the trash, the page drops it, a toast
  // counts it
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { OnRestore } from '$lib/utils/actions';
  import { handleError } from '$lib/utils/handle-error';
  import { restoreAssets } from '@immich/sdk';
  import { toastManager } from '@immich/ui';
  import { mdiHistory } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    onRestore?: OnRestore;
  };

  let { onRestore }: Props = $props();

  const restore = async () => {
    const ids = assetMultiSelectManager.assets.map(({ id }) => id);
    try {
      await restoreAssets({ bulkIdsDto: { ids } });
      onRestore?.(ids);
      toastManager.primary($t('assets_restored_count', { values: { count: ids.length } }));
      assetMultiSelectManager.clear();
    } catch (error) {
      handleError(error, $t('errors.unable_to_restore_assets'));
    }
  };
</script>

<MenuOption text={$t('restore')} icon={mdiHistory} onClick={restore} />
