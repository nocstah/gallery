<script lang="ts">
  // Local Omarchy layer: a Timeline stand-in that draws tileGrid's photos as tiles in #asset-grid, as the timeline
  // does, and binds a timeline that finds them and records what the page asks of it (gallery/photo-menu specs)
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { Snippet } from 'svelte';
  import { tileGrid } from './tile-grid';

  interface Props {
    timelineManager?: TimelineManager | Record<string, unknown>;
    children?: Snippet;
  }

  let { timelineManager = $bindable(), children }: Props = $props();

  const find = (id: string) => tileGrid.assets.find((asset) => asset.id === id);

  $effect(() => {
    timelineManager = {
      assetCount: tileGrid.assets.length,
      isInitialized: false,
      months: [],
      timelineBuckets: [],
      isEmptyForOptions: () => tileGrid.assets.length === 0,
      getTimelineMonthByAssetId: (id: string) =>
        find(id) ? { findAssetById: ({ id }: { id: string }) => find(id) } : undefined,
      update: (ids: string[]) => {
        tileGrid.calls.push(['update', ids]);
      },
      removeAssets: (ids: string[]) => {
        tileGrid.calls.push(['removeAssets', ids]);
      },
      upsertAssets: (assets: unknown[]) => {
        tileGrid.calls.push(['upsertAssets', assets]);
      },
    };
  });
</script>

<div id="asset-grid" data-testid="tile-timeline" data-has-timeline={String(timelineManager !== undefined)}>
  {#each tileGrid.assets as asset (asset.id)}
    <button type="button" data-thumbnail-focus-container data-asset={asset.id}>{asset.id}</button>
  {/each}
</div>
{@render children?.()}
