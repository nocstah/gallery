<script lang="ts">
  // Local Omarchy layer: the photo menu (PhotoMenu) on a page's gallery of photos (GalleryViewer: a folder's, the
  // search's, a memory's), finding the right-clicked photo among the ones the page shows
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import type { AssetResponseDto } from '@immich/sdk';
  import type { ComponentProps } from 'svelte';
  import PhotoMenu from './PhotoMenu.svelte';
  import { GALLERY_GRID, photoMenuOffers, type PhotoMenuPage } from './photo-menu';

  type Props = Omit<ComponentProps<typeof PhotoMenu>, 'grid' | 'findAsset' | 'stacks' | 'offer'> & {
    /** whose menu this is: what that page's bar offers (photo-menu.ts) */
    page: PhotoMenuPage;
    assets: AssetResponseDto[];
  };

  let { page, assets, ...menu }: Props = $props();

  const findAsset = (id: string) => {
    const found = assets.find((asset) => asset.id === id);
    return found ? toTimelineAsset(found) : undefined;
  };
</script>

<PhotoMenu grid={GALLERY_GRID} {findAsset} offer={photoMenuOffers[page]} {...menu} />
