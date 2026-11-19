<script lang="ts">
  import type { VirtualScrollManager } from '#lib/managers/VirtualScrollManager/VirtualScrollManager.svelte.ts';
  import type { TimelineAsset } from '#lib/managers/timeline-manager/types.ts';
  import type { ViewerAsset } from '#lib/managers/timeline-manager/viewer-asset.svelte.ts';
  import { mediaQueryManager } from '#lib/stores/media-query-manager.svelte.ts';
  import { uploadAssetsStore } from '#lib/stores/upload.ts';
  import { desktopMotion } from '#lib/utils/desktop-motion.ts';
  import type { CommonPosition } from '#lib/utils/layout-utils.ts';
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
  // Both stop while the timeline scrolls or lays out again; reduced motion keeps only a short fade. Where Gallery's
  // removal motion flies the photo off (lib/gallery/motion/removal.ts: its copy, over the page, into Trash or Archive),
  // the tile itself goes at once, so no fading ghost stays behind under the flight; the rest still re-tile.
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
    const flown = document.querySelector('[data-gallery-removal]') !== null;
    return {
      duration: flown ? 0 : duration,
      easing: motion.close.easing,
      css: (t: number) => `opacity: ${t}; scale: ${from + (1 - from) * t}`,
    };
  };
</script>

<!-- Image grid -->
<div data-image-grid class="relative overflow-clip" style:height={height + 'px'} style:width={width + 'px'}>
  {#each viewerAssets as viewerAsset (viewerAsset.id)}
    {const position = $derived(viewerAsset.position!)}
    {const asset = $derived(viewerAsset.asset!)}

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
