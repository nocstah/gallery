<script lang="ts">
  import ControlAppBar from '#lib/components/shared-components/ControlAppBar.svelte';
  import AssetSelectControlBar from '#lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '#lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '#lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import DownloadAction from '#lib/components/timeline/actions/DownloadAction.svelte';
  import { timelineGroupingProps } from '#lib/gallery/filtered-timeline/timeline-grouping.svelte.ts';
  import TimelinePhotoMenu from '#lib/gallery/photo-menu/TimelinePhotoMenu.svelte';
  import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
  import { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
  import { Route } from '#lib/route.ts';
  import { getAssetBulkActions } from '#lib/services/asset.service.ts';
  import { AssetVisibility } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider } from '@immich/ui';
  import { mdiArrowLeft } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const timelineGrouping = timelineGroupingProps(() => timelineManager);
  const options = $derived({
    userId: data.partner.id,
    visibility: AssetVisibility.Timeline,
    withStacked: true,
    grouping: timelineGrouping.grouping,
  });

  const handleEscape = () => {
    if (!assetMultiSelectManager.selectionActive) {
      return;
    }

    assetMultiSelectManager.clear();
    return;
  };
</script>

<main class="relative h-dvh overflow-hidden px-2 pt-(--control-bar-height) max-md:pt-(--control-bar-height-md) md:px-6">
  <TimelineRouteGroupingBar {...timelineGrouping.barProps} />
  <Timeline
    enableRouting={true}
    bind:timelineManager
    {options}
    assetInteraction={assetMultiSelectManager}
    onEscape={handleEscape}
    {...timelineGrouping.timelineProps}
  />
</main>

<!-- Local Omarchy layer: right-click menu on the partner's photos, which are theirs to change: Download only
     (gallery/photo-menu) -->
<TimelinePhotoMenu page="partner" {timelineManager} />

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {const Actions = $derived(getAssetBulkActions($t))}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />

    <ActionButton action={Actions.CreateSharedLink} />
    <!-- Local Omarchy layer: Add to album by its name, the ink primary, as on Photos -->
    <span class="ws-primary-action ws-select-labelled contents"
      ><ActionButton action={Actions.AddToAlbum} type="button" /></span
    >
    <DownloadAction />
  </AssetSelectControlBar>
{:else}
  <ControlAppBar backIcon={mdiArrowLeft} onClose={() => goto(Route.sharing())}>
    {#snippet leading()}
      <!-- Local Omarchy layer: the page's name is its h1 (DESIGN.md, One heading), in the words' own weight as before -->
      <h1 class="font-normal whitespace-nowrap text-immich-fg dark:text-immich-dark-fg">
        {$t('partner_list_user_photos', { values: { user: data.partner.name } })}
      </h1>
    {/snippet}
  </ControlAppBar>
{/if}
