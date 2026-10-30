<script lang="ts">
  // Local Omarchy layer: the photo menu (PhotoMenu) on a Space's photos: its timeline and the search results shown in
  // its place, a Space album's, a Space person's. It offers what the Space's selection bar (SelectionToolbar) offers
  // for the selection, as the bar works it out (selection-bar.svelte.ts): what the viewer's role allows, the photos they
  // may edit (#734), Share through the Space (#1018). The bar shows whenever the menu does, since both act on the
  // selection the right-click makes.
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { AssetResponseDto } from '@immich/sdk';
  import type { ComponentProps } from 'svelte';
  import PhotoMenu from './PhotoMenu.svelte';
  import { findTimelinePhoto, GALLERY_GRID, spaceOffer, TIMELINE_GRID, type PhotoMenuOffer } from './photo-menu';
  import { selectionBarOffer } from './selection-bar.svelte';

  type Props = Omit<
    ComponentProps<typeof PhotoMenu>,
    'grid' | 'findAsset' | 'stacks' | 'offer' | 'editableSelectedAssetIds' | 'shareSpaceId' | 'spaceId'
  > & {
    spaceId: string;
    timelineManager: TimelineManager | undefined;
    /** the search results the Space's page shows instead of its timeline, while it shows them */
    results?: AssetResponseDto[];
  };

  let { timelineManager, results, ...menu }: Props = $props();

  const NOTHING: PhotoMenuOffer = { actions: [] };
  const bar = $derived(selectionBarOffer());
  const offer = $derived(bar ? spaceOffer(bar.caps) : NOTHING);
</script>

<PhotoMenu
  grid={results ? GALLERY_GRID : TIMELINE_GRID}
  findAsset={findTimelinePhoto(timelineManager, results)}
  {offer}
  editableSelectedAssetIds={bar?.editableSelectedAssetIds}
  shareSpaceId={bar?.shareSpaceId}
  {...menu}
/>
