<script lang="ts">
  // Local Omarchy layer: a page as the photo menu sees it: a timeline (tile-timeline.stub), the search results shown in
  // its place, or a gallery of photos, each drawn as tiles, with the menu that serves it
  import TileGallery from '#lib/gallery/__mocks__/tile-gallery-viewer.stub.svelte';
  import TileTimeline from '#lib/gallery/__mocks__/tile-timeline.stub.svelte';
  import type { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
  import type { AssetResponseDto } from '@immich/sdk';
  import type { ComponentProps } from 'svelte';
  import GalleryPhotoMenu from './GalleryPhotoMenu.svelte';
  import TimelinePhotoMenu from './TimelinePhotoMenu.svelte';

  type Props = Omit<ComponentProps<typeof TimelinePhotoMenu>, 'timelineManager'> & {
    /** a gallery of photos instead of a timeline */
    gallery?: AssetResponseDto[];
  };

  let { gallery, results, ...menu }: Props = $props();

  let timelineManager = $state<TimelineManager>();
</script>

{#if gallery}
  <TileGallery assets={gallery} />
  <GalleryPhotoMenu assets={gallery} {...menu} />
{:else}
  {#if results}
    <TileGallery assets={results} />
  {:else}
    <TileTimeline bind:timelineManager />
  {/if}
  <TimelinePhotoMenu {timelineManager} {results} {...menu} />
{/if}
<div data-testid="elsewhere">
  <button type="button" data-thumbnail-focus-container data-asset="not-in-the-grid">not-in-the-grid</button>
</div>
