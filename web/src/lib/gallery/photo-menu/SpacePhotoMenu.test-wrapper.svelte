<script lang="ts">
  // Local Omarchy layer: a Space's page as the photo menu sees it: its timeline (tile-timeline.stub), the menu, and
  // the selection bar (SelectionToolbar) that shows while there is a selection, as on the Space pages
  import SelectionToolbar from '$lib/components/timeline/SelectionToolbar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import TileTimeline from '@test-data/mocks/tile-timeline.stub.svelte';
  import type { AlbumResponseDto, SharedSpaceMemberResponseDto } from '@immich/sdk';
  import { TooltipProvider } from '@immich/ui';
  import SpacePhotoMenu from './SpacePhotoMenu.svelte';

  type Props = {
    space: { id: string; canWrite: boolean; members?: SharedSpaceMemberResponseDto[] };
    album?: AlbumResponseDto;
    onSetCover?: () => void;
    onRemove?: (assetIds: string[]) => void;
    onAssetDelete?: (assetIds: string[]) => void;
    onVisibilitySet?: (assetIds: string[]) => void;
  };

  let { space, album, onSetCover, onRemove, onAssetDelete, onVisibilitySet }: Props = $props();

  let timeline = $state<TimelineManager | Record<string, unknown>>();
  const timelineManager = $derived(timeline as TimelineManager | undefined);
</script>

<TooltipProvider>
  <TileTimeline bind:timelineManager={timeline} />
  <SpacePhotoMenu
    spaceId={space.id}
    {album}
    {timelineManager}
    reveal
    {onSetCover}
    {onRemove}
    {onAssetDelete}
    {onVisibilitySet}
  />
  {#if assetMultiSelectManager.selectionActive && timelineManager}
    <SelectionToolbar
      {timelineManager}
      assetInteraction={assetMultiSelectManager}
      {space}
      {album}
      {onSetCover}
      {onRemove}
      {onAssetDelete}
      {onVisibilitySet}
    />
  {/if}
</TooltipProvider>
