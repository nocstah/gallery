<script lang="ts">
  // Local Omarchy layer: the photo menu (PhotoMenu) on a page's timeline, and on the smart-search results some pages
  // show in its place. Before the timeline is there a right-click is the browser's.
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { AssetResponseDto } from '@immich/sdk';
  import type { ComponentProps } from 'svelte';
  import PhotoMenu from './PhotoMenu.svelte';
  import { findTimelinePhoto, GALLERY_GRID, photoMenuOffers, TIMELINE_GRID, type PhotoMenuPage } from './photo-menu';

  type Props = Omit<ComponentProps<typeof PhotoMenu>, 'grid' | 'findAsset' | 'stacks' | 'offer'> & {
    /** whose menu this is: what that page's bar offers (photo-menu.ts) */
    page: PhotoMenuPage;
    timelineManager: TimelineManager | undefined;
    /** the search results the page shows instead of its timeline, while it shows them */
    results?: AssetResponseDto[];
  };

  let { page, timelineManager, results, ...menu }: Props = $props();
</script>

<PhotoMenu
  grid={results ? GALLERY_GRID : TIMELINE_GRID}
  findAsset={findTimelinePhoto(timelineManager, results)}
  offer={photoMenuOffers[page]}
  stacks={!results}
  {...menu}
/>
