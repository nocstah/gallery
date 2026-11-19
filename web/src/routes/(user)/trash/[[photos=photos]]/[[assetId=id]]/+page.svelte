<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import EmptyState from '#lib/components/omarchy/EmptyState.svelte';
  import AssetSelectControlBar from '#lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '#lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '#lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import DeleteAssets from '#lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import SelectAllAssets from '#lib/components/timeline/actions/SelectAllAction.svelte';
  import { timelineGroupingProps } from '#lib/gallery/filtered-timeline/timeline-grouping.svelte.ts';
  import TimelinePhotoMenu from '#lib/gallery/photo-menu/TimelinePhotoMenu.svelte';
  import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
  import { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getUserConfigQuery } from '#lib/queries/config-user.query.ts';
  import { Route } from '#lib/route.ts';
  import { getTrashActions } from '#lib/services/trash.service.ts';
  import { handlePromiseError } from '#lib/utils.ts';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import RestoreAssets from './RestoreAction.svelte';

  const query = createPreloadedQuery(getUserConfigQuery);
  const config = $derived(query.data);

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const timelineGrouping = timelineGroupingProps(() => timelineManager);
  const options = $derived({ isTrashed: true, grouping: timelineGrouping.grouping });

  if (!config.trash.enabled) {
    handlePromiseError(goto(Route.photos()));
  }

  const handleEscape = () => {
    if (!assetMultiSelectManager.selectionActive) {
      return;
    }

    assetMultiSelectManager.clear();
    return;
  };

  const { Empty, RestoreAll } = $derived(getTrashActions($t, timelineManager?.assetCount ?? 0));
</script>

{#if config.trash.enabled}
  <UserPageLayout
    hideNavbar={assetMultiSelectManager.selectionActive}
    actions={assetMultiSelectManager.selectionActive ? [] : [Empty, RestoreAll]}
    title={data.meta.title}
    scrollbar={false}
  >
    <TimelineRouteGroupingBar {...timelineGrouping.barProps} />
    <Timeline
      enableRouting={true}
      bind:timelineManager
      {options}
      assetInteraction={assetMultiSelectManager}
      onEscape={handleEscape}
      {...timelineGrouping.timelineProps}
    >
      <p class="p-4 font-medium text-gray-500/60 dark:text-gray-300/60">
        {$t('trashed_items_will_be_permanently_deleted_after', {
          values: { days: config.trash.days },
        })}
      </p>
      {#snippet empty()}
        <EmptyState title={$t('trash_empty_title')} body={$t('trash_no_results_message')} />
      {/snippet}
    </Timeline>
  </UserPageLayout>

  <!-- Local Omarchy layer: right-click menu on the photos in the trash, acting on the selection like the bar below
       (gallery/photo-menu) -->
  <TimelinePhotoMenu
    page="trash"
    {timelineManager}
    onRestore={(assetIds) => timelineManager.removeAssets(assetIds)}
    onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)}
  />
{/if}

{#if assetMultiSelectManager.selectionActive}
  <!-- Local Omarchy layer: no Share or Add to album here, so Show selected offers only Done -->
  <AssetSelectControlBar reviewActions={() => []}>
    <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
    <DeleteAssets force onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)} />
    <RestoreAssets onRestore={(assetIds) => timelineManager.removeAssets(assetIds)} />
  </AssetSelectControlBar>
{/if}
