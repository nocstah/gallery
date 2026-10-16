<script lang="ts">
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import SelectionReviewModal from '$lib/modals/SelectionReviewModal.svelte';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { Icon, modalManager, type ActionItem } from '@immich/ui';
  import { mdiChevronDown, mdiClose } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';

  type Props = {
    children?: Snippet;
    /**
     * Local Omarchy layer: the selection's main actions on this page, offered again at the foot of Show selected
     * (modals/SelectionReviewModal), made from the selection as it is when they run. By default the bulk Share, New
     * album and Add to album or space; a page whose bar offers other actions passes its own, or none.
     */
    reviewActions?: () => ActionItem[];
  };

  let { children, reviewActions = defaultReviewActions }: Props = $props();

  // (the sheet may ask after this bar has gone, when every photo was left out and one put back: so get(t), not $t)
  function defaultReviewActions() {
    const { CreateSharedLink, NewAlbum, AddToAlbum } = getAssetBulkActions(get(t));
    return [CreateSharedLink, NewAlbum, AddToAlbum];
  }

  const onClose = () => assetMultiSelectManager.clear();

  const assets = $derived(assetMultiSelectManager.assets);

  // Local Omarchy layer: the count opens Show selected; an action chosen there runs once the sheet is gone, else the
  // focus comes back to the count
  let countButton = $state<HTMLButtonElement>();
  let reviewing = false;
  const review = async () => {
    if (reviewing) {
      return;
    }
    reviewing = true;
    const chosen = await modalManager.show(SelectionReviewModal, { actions: reviewActions });
    reviewing = false;
    if (chosen) {
      await chosen.action.onAction(chosen);
      return;
    }
    // (a bar that left while every photo was out, and came back with one put back, has a count of its own)
    const count = countButton?.isConnected ? countButton : document.querySelector<HTMLElement>('.ws-select-count');
    count?.focus();
  };
</script>

<!-- Local Omarchy layer: ws- hooks for the flat selection bar and its display-face count, which opens Show selected -->
<ControlAppBar {onClose} backIcon={mdiClose} class="ws-select-bar">
  {#snippet leading()}
    <button
      type="button"
      class="ws-select-count font-medium text-primary"
      title={$t('show_selected')}
      aria-haspopup="dialog"
      bind:this={countButton}
      onclick={review}
    >
      <span class="block sm:hidden">{assets.length}</span>
      <span class="hidden sm:block">{$t('selected_count', { values: { count: assets.length } })}</span>
      <Icon icon={mdiChevronDown} size="18" class="ws-select-count-more" aria-hidden="true" />
    </button>
  {/snippet}
  {#snippet trailing()}
    {@render children?.()}
  {/snippet}
</ControlAppBar>
