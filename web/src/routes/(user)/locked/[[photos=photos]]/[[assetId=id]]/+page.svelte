<script lang="ts">
  import OnEvents from '#lib/components/OnEvents.svelte';
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import EmptyState from '#lib/components/omarchy/EmptyState.svelte';
  import ButtonContextMenu from '#lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import AssetSelectControlBar from '#lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '#lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '#lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import ChangeDate from '#lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeLocation from '#lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '#lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '#lib/components/timeline/actions/DownloadAction.svelte';
  import SelectAllAssets from '#lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '#lib/components/timeline/actions/SetVisibilityAction.svelte';
  import { AssetAction } from '#lib/constants.ts';
  import { timelineGroupingProps } from '#lib/gallery/filtered-timeline/timeline-grouping.svelte.ts';
  import LockedFolderNotice from '#lib/gallery/locked/LockedFolderNotice.svelte';
  import LockedPhotoContextMenu from '#lib/gallery/locked/LockedPhotoContextMenu.svelte';
  import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
  import { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
  import { Route } from '#lib/route.ts';
  import { getUserActions } from '#lib/services/user.service.ts';
  import { AssetVisibility } from '@immich/sdk';
  import { mdiDotsVertical } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const timelineGrouping = timelineGroupingProps(() => timelineManager);
  const options = $derived({ visibility: AssetVisibility.Locked, grouping: timelineGrouping.grouping });

  const handleEscape = () => {
    if (!assetMultiSelectManager.selectionActive) {
      return;
    }

    assetMultiSelectManager.clear();
    return;
  };

  const handleMoveOffLockedFolder = (assetIds: string[]) => {
    assetMultiSelectManager.clear();
    timelineManager.removeAssets(assetIds);
  };

  const { LockSession } = $derived(getUserActions($t));

  const onSessionLocked = async () => {
    await goto(Route.photos());
  };
</script>

<OnEvents {onSessionLocked} />

<UserPageLayout
  title={data.meta.title}
  actions={[LockSession]}
  hideNavbar={assetMultiSelectManager.selectionActive}
  scrollbar={false}
>
  <TimelineRouteGroupingBar {...timelineGrouping.barProps} />
  <Timeline
    enableRouting={true}
    bind:timelineManager
    {options}
    assetInteraction={assetMultiSelectManager}
    onEscape={handleEscape}
    removeAction={AssetAction.SET_VISIBILITY_TIMELINE}
    {...timelineGrouping.timelineProps}
  >
    <LockedFolderNotice />
    {#snippet empty()}
      <EmptyState title={$t('nothing_here_yet')} body={$t('no_locked_photos_message')} />
    {/snippet}
  </Timeline>
</UserPageLayout>

{#if timelineManager}
  <LockedPhotoContextMenu {timelineManager} onRemove={handleMoveOffLockedFolder} />
{/if}

<!-- Multi-selection mode app bar -->
{#if assetMultiSelectManager.selectionActive}
  <!-- Local Omarchy layer: no Share or Add to album here, so Show selected offers only Done -->
  <AssetSelectControlBar reviewActions={() => []}>
    <SelectAllAssets withText {timelineManager} assetInteraction={assetMultiSelectManager} />
    <SetVisibilityAction unlock onVisibilitySet={handleMoveOffLockedFolder} />
    <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
      <DownloadAction menuItem />
      <ChangeDate menuItem />
      <ChangeLocation menuItem />
      <DeleteAssets menuItem force onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)} />
    </ButtonContextMenu>
  </AssetSelectControlBar>
{/if}
