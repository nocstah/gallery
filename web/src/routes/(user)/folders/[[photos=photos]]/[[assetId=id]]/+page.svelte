<script lang="ts">
  import { afterNavigate, beforeNavigate, invalidateAll } from '$app/navigation';
  import { isAssetViewerRoute } from '$lib/utils/navigation';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import UserPageLayout, { headerId } from '$lib/components/layouts/UserPageLayout.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import ExplorerList from '$lib/components/omarchy/ExplorerList.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte';
  import ExplorerTree from '$lib/components/sidebar/explorer-tree.svelte';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RotateAction from '$lib/components/timeline/actions/RotateAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import SkipLink from '$lib/elements/SkipLink.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { Viewport } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { foldersStore } from '$lib/stores/folders.svelte';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import type { TreeNode } from '$lib/utils/tree-utils';
  import { ActionButton, CommandPaletteDefaultProvider, IconButton } from '@immich/ui';
  import { mdiArrowLeft, mdiDotsVertical, mdiFolderOpenOutline, mdiFolderOutline, mdiSelectAll } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const viewport: Viewport = $state({ width: 0, height: 0 });
  let folderScrollContainer: HTMLElement | undefined = $state();
  let savedScrollTop = 0;

  const getLinkForPath = (path: string) => Route.folders({ path });

  // Local Omarchy layer: the folder on screen titles the one bar, with an arrow up a level and, below the top two levels
  // ("/" and a root such as mnt/archive/iCloud, which say where they are themselves), its full path in data type; the
  // top level says how many folders hold photos
  const countFolders = (node: TreeNode): number =>
    node.children.reduce((sum, child) => sum + countFolders(child), node.hasAssets ? 1 : 0);
  const folderCount = $derived(foldersStore.folders ? countFolders(foldersStore.folders) : 0);
  const barTitle = $derived(data.tree.path ? data.tree.value : data.meta.title);
  const barDescription = $derived(
    data.tree.path
      ? data.tree.parents.length > 1
        ? data.tree.path
        : undefined
      : $t('folders_count', { values: { count: folderCount } }),
  );
  const foldersIn = (node: TreeNode) =>
    node.size > 0 ? $t('folders_count', { values: { count: node.size } }) : undefined;

  beforeNavigate(({ to }) => {
    if (isAssetViewerRoute(to)) {
      savedScrollTop = folderScrollContainer?.scrollTop ?? 0;
    }
  });

  afterNavigate(({ from }) => {
    assetMultiSelectManager.clear();

    if (isAssetViewerRoute(from) && folderScrollContainer) {
      folderScrollContainer.scrollTop = savedScrollTop;
    } else if (folderScrollContainer) {
      // Local Omarchy layer: a folder opened from the list starts at its top, not where the list above it was scrolled
      folderScrollContainer.scrollTop = 0;
    }
  });

  const triggerAssetUpdate = async () => {
    assetMultiSelectManager.clear();
    if (data.tree.path) {
      await foldersStore.refreshAssetsByPath(data.tree.path);
    }
    await invalidateAll();
  };

  const handleSetVisibility = () => {
    void triggerAssetUpdate();
  };

  const handleSelectAllAssets = () => {
    if (!data.pathAssets) {
      return;
    }

    assetMultiSelectManager.selectAssets(data.pathAssets.map((asset) => toTimelineAsset(asset)));
  };
</script>

<UserPageLayout title={barTitle} description={barDescription}>
  {#snippet leading()}
    {#if data.tree.parent}
      <IconButton
        shape="round"
        color="secondary"
        variant="ghost"
        icon={mdiArrowLeft}
        aria-label={$t('to_parent')}
        href={getLinkForPath(data.tree.parent.path)}
      />
    {/if}
  {/snippet}

  {#snippet sidebar()}
    <Sidebar>
      <SkipLink target={`#${headerId}`} text={$t('skip_to_folders')} breakpoint="md" />
      <!-- Local Omarchy layer: the tree reads like the albums' tree (sidebar/explorer-tree.svelte) -->
      <ExplorerTree
        tree={foldersStore.folders!}
        active={data.tree.path}
        getLink={getLinkForPath}
        title={$t('folders')}
        icon={{ icon: mdiFolderOutline, flipped: true }}
        nodeIcon={{ closed: mdiFolderOutline, open: mdiFolderOpenOutline }}
        scope="folders"
      />
    </Sidebar>
  {/snippet}

  <OnEvents onAssetsDelete={invalidateAll} />

  <!-- Local Omarchy layer: the level's folders as a calm list on the gutter (omarchy/ExplorerList.svelte), where upstream
       drew a breadcrumb slab and a grid of 64px icons; the bar carries the way up; the folder's own photos follow -->
  <section class="h-full immich-scrollbar overflow-auto" bind:this={folderScrollContainer}>
    <ExplorerList
      node={data.tree}
      getLink={getLinkForPath}
      icon={mdiFolderOutline}
      count={foldersIn}
      label={$t('folders')}
    />

    <!-- Assets -->
    {#if data.pathAssets && data.pathAssets.length > 0}
      <div
        bind:clientHeight={viewport.height}
        bind:clientWidth={viewport.width}
        class="ws-folder-photos"
        class:mt-6={data.tree.size > 0}
      >
        <GalleryViewer
          assets={data.pathAssets}
          assetInteraction={assetMultiSelectManager}
          {viewport}
          showAssetName={true}
          pageHeaderOffset={54}
          onReload={triggerAssetUpdate}
          enableGrouping
        />
      </div>
    {/if}
  </section>
</UserPageLayout>

{#if assetMultiSelectManager.selectionActive}
  <div class="fixed inset-s-0 top-0 w-full">
    <AssetSelectControlBar>
      {@const Actions = getAssetBulkActions($t)}
      <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
      <ActionButton action={Actions.CreateSharedLink} />
      <IconButton
        shape="round"
        color="secondary"
        variant="ghost"
        aria-label={$t('select_all')}
        icon={mdiSelectAll}
        onclick={handleSelectAllAssets}
      />
      <ActionButton action={Actions.AddToAlbum} />
      <FavoriteAction
        removeFavorite={assetMultiSelectManager.isAllFavorite}
        onFavorite={function handleFavoriteUpdate(ids, isFavorite) {
          if (data.pathAssets && data.pathAssets.length > 0) {
            for (const id of ids) {
              const asset = data.pathAssets.find((asset) => asset.id === id);
              if (asset) {
                asset.isFavorite = isFavorite;
              }
            }
          }
        }}
      />

      <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
        <DownloadAction menuItem />
        <RotateAction />
        <ChangeDate menuItem />
        <ChangeDescription menuItem />
        <ChangeLocation menuItem />
        <ArchiveAction menuItem unarchive={assetMultiSelectManager.isAllArchived} onArchive={triggerAssetUpdate} />
        <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        <ActionMenuItem action={Actions.Tag} />
        <DeleteAssets menuItem onAssetDelete={triggerAssetUpdate} onUndoDelete={triggerAssetUpdate} />
        <hr />

        <ActionMenuItem action={Actions.RegenerateThumbnailJob} />
        <ActionMenuItem action={Actions.RefreshMetadataJob} />
        <ActionMenuItem action={Actions.TranscodeVideoJob} />
      </ButtonContextMenu>
    </AssetSelectControlBar>
  </div>
{/if}

<style>
  /* Local Omarchy layer: the photos' grouping control starts on the gutter, as on the album page */
  .ws-folder-photos :global([data-testid='filter-toolbar-root']) {
    padding-inline-start: 0;
  }
</style>
