<script lang="ts">
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { mdiClose } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();

  const onClose = () => assetMultiSelectManager.clear();

  const assets = $derived(assetMultiSelectManager.assets);
</script>

<!-- Local Omarchy layer: ws- hooks for the flat selection bar and its display-face count -->
<ControlAppBar {onClose} backIcon={mdiClose} class="ws-select-bar">
  {#snippet leading()}
    <div class="ws-select-count font-medium text-primary">
      <p class="block sm:hidden">{assets.length}</p>
      <p class="hidden sm:block">{$t('selected_count', { values: { count: assets.length } })}</p>
    </div>
  {/snippet}
  {#snippet trailing()}
    {@render children?.()}
  {/snippet}
</ControlAppBar>
