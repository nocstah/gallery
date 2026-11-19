<script lang="ts">
  // Local Omarchy layer: a GalleryViewer stand-in that draws its photos as tiles in the gallery, as GalleryViewer does
  // (gallery/photo-menu specs)
  import type { AssetResponseDto } from '@immich/sdk';

  interface Props {
    assets?: AssetResponseDto[];
  }

  let { assets = [] }: Props = $props();
</script>

<div data-testid="gallery-viewer">
  {#each assets as asset (asset.id)}
    <button type="button" data-thumbnail-focus-container data-asset={asset.id}>{asset.id}</button>
  {/each}
</div>
