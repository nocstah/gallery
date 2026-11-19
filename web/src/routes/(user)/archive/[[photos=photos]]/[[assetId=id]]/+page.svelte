<script lang="ts">
  import ArchiveCategories from '#lib/components/archive/ArchiveCategories.svelte';
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import EmptyState from '#lib/components/omarchy/EmptyState.svelte';
  import ButtonContextMenu from '#lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import AssetSelectControlBar from '#lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '#lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '#lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import DeleteAssets from '#lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '#lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '#lib/components/timeline/actions/FavoriteAction.svelte';
  import RotateAction from '#lib/components/timeline/actions/RotateAction.svelte';
  import SelectAllAssets from '#lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '#lib/components/timeline/actions/SetVisibilityAction.svelte';
  import { AssetAction } from '#lib/constants.ts';
  import { timelineGroupingProps } from '#lib/gallery/filtered-timeline/timeline-grouping.svelte.ts';
  import TimelinePhotoMenu from '#lib/gallery/photo-menu/TimelinePhotoMenu.svelte';
  import { assetMultiSelectManager } from '#lib/managers/asset-multi-select-manager.svelte.ts';
  import { registerSelectionContext } from '#lib/managers/command-context-manager.svelte.ts';
  import { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
  import { getAssetBulkActions } from '#lib/services/asset.service.ts';
  import { AssetVisibility } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider } from '@immich/ui';
  import { mdiDotsVertical } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const timelineGrouping = timelineGroupingProps(() => timelineManager, {
    addAllTerms: { visibility: AssetVisibility.Archive },
  });
  // Local Omarchy layer: the category picked above the archive (an Auto/ tag), or all of it
  let categoryTagId = $state<string>();
  const options = $derived({
    visibility: AssetVisibility.Archive,
    grouping: timelineGrouping.grouping,
    ...(categoryTagId && { tagId: categoryTagId }),
  });

  const handleEscape = () => {
    if (!assetMultiSelectManager.selectionActive) {
      return;
    }

    assetMultiSelectManager.clear();
    return;
  };

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  registerSelectionContext({
    getAssets: () => assetMultiSelectManager.assets,
    clearSelection: () => assetMultiSelectManager.clear(),
    canAddToAlbum: () => true,
    getOnFavorite: () =>
      timelineManager
        ? (ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))
        : undefined,
    getOnDelete: () => (timelineManager ? (assetIds) => timelineManager.removeAssets(assetIds) : undefined),
  });
</script>

<UserPageLayout hideNavbar={assetMultiSelectManager.selectionActive} title={data.meta.title} scrollbar={false}>
  <TimelineRouteGroupingBar {...timelineGrouping.barProps} />
  <ArchiveCategories bind:tagId={categoryTagId} />
  <Timeline
    enableRouting={true}
    bind:timelineManager
    {options}
    assetInteraction={assetMultiSelectManager}
    removeAction={AssetAction.UNARCHIVE}
    onEscape={handleEscape}
    {...timelineGrouping.timelineProps}
  >
    {#snippet empty()}
      <EmptyState title={$t('archive_empty_title')} body={$t('no_archived_assets_message')} />
    {/snippet}
  </Timeline>
</UserPageLayout>

<!-- Local Omarchy layer: right-click menu on the archived photos, acting on the selection like the bar below
     (gallery/photo-menu) -->
<TimelinePhotoMenu
  page="archive"
  {timelineManager}
  onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
  onArchive={(ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))}
  onVisibilitySet={handleSetVisibility}
  onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)}
/>

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {const Actions = $derived(getAssetBulkActions($t))}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
    <ActionButton action={Actions.Unarchive} />
    <ActionButton action={Actions.CreateSharedLink} />
    <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
    <!-- Local Omarchy layer: Add to album by its name, the ink primary, as on Photos -->
    <span class="ws-primary-action ws-select-labelled contents"
      ><ActionButton action={Actions.AddToAlbum} type="button" /></span
    >
    <FavoriteAction
      removeFavorite={assetMultiSelectManager.isAllFavorite}
      onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
    />
    <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
      <DownloadAction menuItem />
      <RotateAction />
      <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
      <DeleteAssets menuItem onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)} />
    </ButtonContextMenu>
  </AssetSelectControlBar>
{/if}
