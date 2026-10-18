<script lang="ts">
  import { goto } from '$app/navigation';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import UserPageLayout, { headerId } from '$lib/components/layouts/UserPageLayout.svelte';
  import ExplorerList from '$lib/components/omarchy/ExplorerList.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import ExplorerTree from '$lib/components/sidebar/explorer-tree.svelte';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RotateAction from '$lib/components/timeline/actions/RotateAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import { AssetAction } from '$lib/constants';
  import SkipLink from '$lib/elements/SkipLink.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { registerSelectionContext } from '$lib/managers/command-context-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { getTagActions } from '$lib/services/tag.service';
  import TimelineRouteGroupingBar from '$lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import { getTimelineBucketZoomTarget, type ActivatableTimelineBucket } from '$lib/utils/timeline-zoom-navigation';
  import { getTimelineTopVisibleAnchor } from '$lib/managers/timeline-manager/timeline-anchor';
  import { TreeNode } from '$lib/utils/tree-utils';
  import { AssetVisibility, getAllTags, type TagResponseDto } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider, IconButton } from '@immich/ui';
  import { mdiArrowLeft, mdiDotsVertical, mdiTagMultipleOutline, mdiTagOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let tags = $derived<TagResponseDto[]>(data.tags);
  const tree = $derived(TreeNode.fromTags(tags));
  const tag = $derived(tree.traverse(data.path));

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  let timelineGrouping = $state<TimelineGrouping>('day');
  let temporalAnchor = $state<TimelineTemporalAnchor | undefined>();
  // Tags can belong to a space's owner while the tagged assets are only reachable
  // through the shared space. Opt into shared-space assets (which requires an explicit
  // timeline visibility) so non-admin members actually see photos under a tag (#647).
  const baseTimelineOptions = $derived({
    deferInit: !tag,
    tagId: tag?.id,
    visibility: AssetVisibility.Timeline,
    withSharedSpaces: true,
  });
  const options = $derived({
    ...baseTimelineOptions,
    grouping: timelineGrouping,
  });

  const getLink = (path: string) => Route.tags({ path });

  // Local Omarchy layer: the tag on screen titles the one bar, as an album does, with an arrow up a level and its
  // full path in data type when it sits inside another; the top level says how many tags there are
  const barTitle = $derived(tag.path ? tag.value : data.meta.title);
  const barDescription = $derived(
    tag.path
      ? tag.parents.length > 0
        ? tag.path
        : undefined
      : $t('cmdk_count_tags', { values: { count: tags.length } }),
  );
  const tagsIn = (node: TreeNode) =>
    node.size > 0 ? $t('cmdk_count_tags', { values: { count: node.size } }) : undefined;

  const navigateToView = (path: string) => goto(getLink(path));

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  function handleTimelineGroupingChange(grouping: TimelineGrouping) {
    const anchor = getTimelineTopVisibleAnchor(timelineManager);
    timelineGrouping = grouping;
    temporalAnchor = anchor;
  }

  function handleTimelineBucketActivate(bucket: ActivatableTimelineBucket) {
    if (assetMultiSelectManager.selectionActive) {
      return;
    }

    const result = getTimelineBucketZoomTarget(bucket);
    if (!result) {
      return;
    }

    timelineGrouping = result.grouping;
    temporalAnchor = result.anchor;
  }

  registerSelectionContext({
    getAssets: () => assetMultiSelectManager.assets,
    clearSelection: () => assetMultiSelectManager.clear(),
    canAddToAlbum: () => true,
    getOnFavorite: () =>
      timelineManager
        ? (ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))
        : undefined,
    getOnArchive: () =>
      timelineManager
        ? (ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))
        : undefined,
    getOnDelete: () => (timelineManager ? (assetIds) => timelineManager.removeAssets(assetIds) : undefined),
    getOnUndoDelete: () => (timelineManager ? (assets) => timelineManager.upsertAssets(assets) : undefined),
  });

  const onRefresh = async () => {
    tags = await getAllTags();
  };

  const onTagUpdate = async (response: TagResponseDto) => {
    if (response.value !== tag.path) {
      await navigateToView(response.value || '');
    }

    await onRefresh();
  };

  const onTagDelete = async (response: TreeNode) => {
    if (response.path === tag.path) {
      await navigateToView(tag.parent ? tag.parent.path : '');
    }

    await onRefresh();
  };

  const { Create, Update, Delete } = $derived(getTagActions($t, tag));
</script>

<OnEvents onTagCreate={onRefresh} {onTagUpdate} {onTagDelete} />

<UserPageLayout title={barTitle} description={barDescription} actions={[Create, Update, Delete]}>
  {#snippet leading()}
    {#if tag.parent}
      <IconButton
        shape="round"
        color="secondary"
        variant="ghost"
        icon={mdiArrowLeft}
        aria-label={$t('to_parent')}
        href={getLink(tag.parent.path)}
      />
    {/if}
  {/snippet}

  {#snippet sidebar()}
    <Sidebar>
      <SkipLink target={`#${headerId}`} text={$t('skip_to_tags')} breakpoint="md" />
      <!-- Local Omarchy layer: the tree reads like the albums' tree (sidebar/explorer-tree.svelte) -->
      <ExplorerTree
        {tree}
        active={tag.path}
        {getLink}
        title={$t('tags')}
        icon={{ icon: mdiTagMultipleOutline, flipped: true }}
        nodeIcon={{ closed: mdiTagOutline, open: mdiTagOutline }}
        scope="tags"
      />
    </Sidebar>
  {/snippet}

  <!-- Local Omarchy layer: the level's tags as a calm list on the gutter (omarchy/ExplorerList.svelte), where upstream
       drew a breadcrumb slab and a grid of 64px icons; the bar carries the way up -->
  <section class="h-full immich-scrollbar overflow-auto">
    {#if tag.hasAssets}
      <TimelineRouteGroupingBar
        class="ps-0"
        grouping={timelineGrouping}
        hidden={assetMultiSelectManager.selectionActive}
        onGroupingChange={handleTimelineGroupingChange}
      />
      <Timeline
        enableRouting={true}
        bind:timelineManager
        {options}
        assetInteraction={assetMultiSelectManager}
        removeAction={AssetAction.UNARCHIVE}
        {temporalAnchor}
        onTimelineBucketActivate={handleTimelineBucketActivate}
        onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
        grouping={timelineGrouping}
        onGroupingChange={handleTimelineGroupingChange}
      >
        {#snippet empty()}
          <ExplorerList node={tag} {getLink} icon={mdiTagOutline} count={tagsIn} label={$t('tags')} />
        {/snippet}
      </Timeline>
    {:else}
      <ExplorerList node={tag} {getLink} icon={mdiTagOutline} count={tagsIn} label={$t('tags')} />
    {/if}
  </section>
</UserPageLayout>

<section>
  {#if assetMultiSelectManager.selectionActive}
    <div class="fixed inset-s-0 top-0 w-full">
      <AssetSelectControlBar>
        {@const Actions = getAssetBulkActions($t)}
        <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
        <ActionButton action={Actions.CreateSharedLink} />
        <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
        <!-- Local Omarchy layer: Add to album by its name, the ink primary, as on Photos -->
        <span class="ws-primary-action ws-select-labelled contents"
          ><ActionButton action={Actions.AddToAlbum} type="button" /></span
        >
        <FavoriteAction
          removeFavorite={assetMultiSelectManager.isAllFavorite}
          onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
        ></FavoriteAction>
        <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
          <DownloadAction menuItem />
          <RotateAction />
          <ChangeDate menuItem />
          <ChangeDescription menuItem />
          <ChangeLocation menuItem />
          <ArchiveAction
            menuItem
            onArchive={(ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))}
          />
          <ActionMenuItem action={Actions.Tag} />
          <DeleteAssets
            menuItem
            onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)}
            onUndoDelete={(assets) => timelineManager.upsertAssets(assets)}
          />
          <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        </ButtonContextMenu>
      </AssetSelectControlBar>
    </div>
  {/if}
</section>
