<script lang="ts">
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import type { ViewerAsset } from '$lib/managers/timeline-manager/viewer-asset.svelte';
  import type { VirtualScrollManager } from '$lib/managers/VirtualScrollManager/VirtualScrollManager.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { uploadAssetsStore } from '$lib/stores/upload';
  import { desktopMotion } from '$lib/utils/desktop-motion';
  import type { CommonPosition } from '$lib/utils/layout-utils';
  import type { Snippet } from 'svelte';
  import { flip } from 'svelte/animate';

  let { isUploading } = uploadAssetsStore;

  type Props = {
    viewerAssets: ViewerAsset[];
    width: number;
    height: number;
    manager: VirtualScrollManager;
    thumbnail: Snippet<
      [
        {
          asset: TimelineAsset;
          position: CommonPosition;
        },
      ]
    >;
    customThumbnailLayout?: Snippet<[asset: TimelineAsset]>;
  };

  const { viewerAssets, width, height, manager, thumbnail, customThumbnailLayout }: Props = $props();

  // Local Omarchy layer: a photo that leaves (trash, archive, To do) closes like a window, the desktop's windowsOut
  // (it shrinks a little as it fades), and the rest re-tile into place on windowsMove, as windows do when one closes.
  // Both stop while the timeline scrolls or lays out again; reduced motion keeps only a short fade.
  const motion = desktopMotion();
  const still = $derived(manager.suspendTransitions && !$isUploading);
  const reduced = $derived(mediaQueryManager.reducedMotion);
  const closeDuration = $derived.by(() => {
    if (still) {
      return 0;
    }
    return reduced ? Math.min(150, motion.close.duration) : motion.close.duration;
  });
  const moveDuration = $derived(still || reduced ? 0 : motion.move.duration);
  const closeWindow = (_node: Element, { duration }: { duration: number }) => {
    const from = reduced ? 1 : motion.close.scale;
    return {
      duration,
      easing: motion.close.easing,
      css: (t: number) => `opacity: ${t}; scale: ${from + (1 - from) * t}`,
    };
  };
</script>

<!-- Image grid -->
<div data-image-grid class="relative overflow-clip" style:height={height + 'px'} style:width={width + 'px'}>
  {#each viewerAssets as viewerAsset (viewerAsset.id)}
    {@const position = viewerAsset.position!}
    {@const asset = viewerAsset.asset!}

    <!-- note: don't remove data-asset-id - its used by web e2e tests -->
    <div
      data-asset-id={asset.id}
      class="absolute"
      style:top={position.top + 'px'}
      style:inset-inline-start={position.left + 'px'}
      style:width={position.width + 'px'}
      style:height={position.height + 'px'}
      out:closeWindow|global={{ duration: closeDuration }}
      animate:flip={{ duration: moveDuration, easing: motion.move.easing }}
    >
      {@render thumbnail({ asset, position })}
      {@render customThumbnailLayout?.(asset)}
    </div>
  {/each}
</div>

<style>
  [data-image-grid] {
    user-select: none;
  }
</style>
