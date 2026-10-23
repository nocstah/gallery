<script lang="ts">
  import TileContextMenu from './TileContextMenu.svelte';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

  let { assets }: { assets: TimelineAsset[] } = $props();
  let selected = $state<TimelineAsset[]>([]);
  const selection = {
    get assets() {
      return selected;
    },
    get selectionActive() {
      return selected.length > 0;
    },
    hasSelectedAsset: (id: string) => selected.some((asset) => asset.id === id),
    clear: () => {
      selected = [];
    },
    selectAsset: (asset: TimelineAsset) => {
      selected = [asset];
    },
  } as unknown as AssetMultiSelectManager;
</script>

<div id="test-video-grid">
  {#each assets as asset (asset.id)}
    <button type="button" data-thumbnail-focus-container data-asset={asset.id}>{asset.id}</button>
  {/each}
</div>
<TileContextMenu
  grid="#test-video-grid"
  findAsset={(id) => assets.find((asset) => asset.id === id)}
  assetInteraction={selection}
  withStackItems={false}
>
  <li role="presentation">Test actions</li>
</TileContextMenu>
