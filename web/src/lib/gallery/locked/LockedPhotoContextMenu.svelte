<script lang="ts">
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import TileContextMenu from '$lib/components/timeline/TileContextMenu.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';

  let { timelineManager, onRemove }: { timelineManager: TimelineManager; onRemove: (ids: string[]) => void } = $props();
</script>

<TileContextMenu
  grid="#asset-grid"
  findAsset={(id) => timelineManager.getTimelineMonthByAssetId(id)?.findAssetById({ id })}
  assetInteraction={assetMultiSelectManager}
  withStackItems={false}
>
  <DownloadAction menuItem />
  {#snippet more()}
    <ChangeDate menuItem />
    <ChangeLocation menuItem />
    <ChangeDescription menuItem />
    <hr />
    <SetVisibilityAction menuItem unlock onVisibilitySet={onRemove} />
    <DeleteAssets menuItem force onAssetDelete={onRemove} />
  {/snippet}
</TileContextMenu>
