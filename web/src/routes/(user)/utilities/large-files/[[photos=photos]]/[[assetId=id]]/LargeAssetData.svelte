<script lang="ts">
  import Thumbnail from '$lib/components/assets/thumbnail/Thumbnail.svelte';
  import { getFileSize } from '$lib/utils/asset-utils';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { type AssetResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    onViewAsset: (asset: AssetResponseDto) => void;
  }

  let { asset, onViewAsset }: Props = $props();

  let boxWidth = $state(300);
</script>

<!-- Local Omarchy layer: a photo tile on the page's gap, no card around it. Its size, what the page is sorted by, sits on
     the photo in data type on a strong-glass chip; "External" (a file in an external library, so deleting it here leaves
     the file on disk) joins it while the tile is pointed at, since a library kept outside shows it on every tile
     (upstream: a red badge, and the file name and the size in large type under the tile); the name is the tooltip -->
<div class="ws-large" bind:clientWidth={boxWidth} title={asset.originalFileName}>
  <Thumbnail asset={toTimelineAsset(asset)} readonly onClick={() => onViewAsset(asset)} thumbnailSize={boxWidth} />
  <span class="ws-large-chips">
    <span class="ws-large-chip ws-large-size">{getFileSize(asset, 1)}</span>
    {#if !!asset.libraryId}
      <span class="ws-large-chip ws-large-external">{$t('external')}</span>
    {/if}
  </span>
</div>

<style>
  .ws-large {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
  }
  .ws-large-chips {
    position: absolute;
    inset-inline-start: 0.4rem;
    top: 0.4rem;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    max-width: calc(100% - 4.5rem);
    pointer-events: none;
  }
  .ws-large-chip {
    padding: 0.2rem 0.5rem;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: #fff;
    font-size: var(--ws-text-micro);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }
  .ws-large-external {
    opacity: 0;
    transition: opacity 140ms;
  }
  .ws-large:is(:hover, :focus-within) .ws-large-external {
    opacity: 1;
  }
  /* touch screens have no pointer to rest: the mark stays (as the place caption does on Photos) */
  @media (pointer: coarse) {
    .ws-large-external {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-large-external {
      transition: none;
    }
  }
  .ws-large-size {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
  }
</style>
