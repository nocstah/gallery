<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import AlbumsControls from './AlbumsControls.svelte';
  import Albums from '$lib/components/album-page/AlbumsList.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import EmptyState from '$lib/components/omarchy/EmptyState.svelte';
  import SpaceAlbumFolderBreadcrumb from '$lib/components/spaces/space-album-folder-breadcrumb.svelte';
  import SpaceAlbumFolderCard from '$lib/components/spaces/space-album-folder-card.svelte';
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { albumFolders } from '$lib/managers/album-folders.svelte';
  import { specialAlbumOf } from '$lib/managers/special-albums.svelte';
  import SpaceAlbumFolderNameModal from '$lib/modals/SpaceAlbumFolderNameModal.svelte';
  import SpaceAlbumFolderPickerModal from '$lib/modals/SpaceAlbumFolderPickerModal.svelte';
  import { Route } from '$lib/route';
  import { AlbumFilter, albumViewSettings } from '$lib/stores/preferences.store';
  import { createAlbumAndRedirect } from '$lib/utils/album-utils';
  import {
    canDrop,
    setActiveDragPayload,
    setDragLabel,
    writeDragPayload,
    type DragPayload,
  } from '$lib/utils/space-album-folder-dnd';
  import {
    buildFolderSummaries,
    EMPTY_FOLDER_SUMMARY,
    getFolderContents,
    getFolderPath,
  } from '$lib/utils/space-album-folders';
  import type { AlbumResponseDto, SharedSpaceAlbumFolderDto, SharedSpaceLinkedAlbumDto } from '@immich/sdk';
  import { Button, modalManager } from '@immich/ui';
  import { mdiFolderPlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let searchQuery = $state('');
  let albumGroups: string[] = $state([]);

  // Local Omarchy layer: album folders (managers/album-folders). The page lists one level at a time: the folders in
  // it, then its albums; ?folder= is the level, the top when absent. A search, or the Shared filter, lists every
  // album at once, as before.
  const browsing = $derived(!searchQuery.trim() && $albumViewSettings.filter !== AlbumFilter.Shared);
  const requested = $derived(page.url.searchParams.get('folder'));
  const folderId = $derived(
    browsing && requested && albumFolders.folders.some(({ id }) => id === requested) ? requested : null,
  );
  // the special albums (To do, Villa, QR) have their own rows in the sidebar: a level of the page leaves them out, and a
  // search still finds them
  const inLevel = (album: AlbumResponseDto) =>
    !browsing || (albumFolders.folderOf(album.id) === folderId && !specialAlbumOf(album.id));
  const ownedHere = $derived(data.albums.filter((album) => inLevel(album)));
  const sharedHere = $derived(data.sharedAlbums.filter((album) => inLevel(album)));
  // folders by name, the way a person numbers them ("2" before "10", years in order)
  const subfolders = $derived(
    browsing
      ? getFolderContents(albumFolders.folders, albumFolders.linked, folderId)
          .folders.slice()
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      : [],
  );
  const summaries = $derived(buildFolderSummaries(albumFolders.folders, albumFolders.linked));
  const path = $derived(getFolderPath(albumFolders.folders, folderId));
  // what a drop is checked against: the Space's albums where they are, and every other album of mine at the top
  const droppable = $derived.by(() => {
    const linked = new Set(albumFolders.linked.map(({ id }) => id));
    const outside = data.albums
      .filter(({ id }) => !linked.has(id))
      .map(({ id }) => ({ id, folderId: null }) as SharedSpaceLinkedAlbumDto);
    return [...albumFolders.linked, ...outside];
  });

  const openFolder = (id: string | null) => goto(Route.albums({ folder: id }));

  const newFolder = async () => {
    const name = await modalManager.show(SpaceAlbumFolderNameModal, { title: $t('space_album_folder_new') });
    if (name) {
      await albumFolders.createFolder(name, folderId);
    }
  };

  const renameFolder = async (folder: SharedSpaceAlbumFolderDto) => {
    const name = await modalManager.show(SpaceAlbumFolderNameModal, {
      title: $t('space_album_folder_rename'),
      initialName: folder.name,
    });
    if (name && name !== folder.name) {
      await albumFolders.renameFolder(folder, name);
    }
  };

  const moveFolder = async (folder: SharedSpaceAlbumFolderDto) => {
    const result = await modalManager.show(SpaceAlbumFolderPickerModal, {
      folders: albumFolders.folders,
      excludeFolderId: folder.id,
      currentFolderId: folder.parentId ?? null,
    });
    if (result) {
      await albumFolders.moveFolder(folder.id, result.folderId);
    }
  };

  const deleteFolder = async (folder: SharedSpaceAlbumFolderDto) => {
    const confirmed = await modalManager.showDialog({
      title: $t('space_album_folder_delete'),
      prompt: $t('album_folder_delete_confirm', { values: { name: folder.name } }),
    });
    if (confirmed) {
      await albumFolders.deleteFolder(folder);
    }
  };

  const drop = async (payload: DragPayload, target: string | null) => {
    if (!canDrop(albumFolders.folders, droppable, payload, target)) {
      return;
    }
    await (payload.kind === 'album'
      ? albumFolders.moveAlbum(payload.id, target)
      : albumFolders.moveFolder(payload.id, target));
  };

  // an album card is a link to the album: dragging one carries the album, for a folder or a crumb to take
  const dragAlbum = (event: DragEvent) => {
    const href = (event.target as Element | null)?.closest?.('a[href]')?.getAttribute('href');
    const album = href ? data.albums.find(({ id }) => href === Route.viewAlbum({ id })) : undefined;
    if (!album || !event.dataTransfer) {
      return;
    }
    const payload: DragPayload = { kind: 'album', id: album.id };
    writeDragPayload(event.dataTransfer, payload);
    setActiveDragPayload(payload);
    setDragLabel(event.dataTransfer, album.albumName);
  };
</script>

<!-- the album cards are links: a drag that starts on one of mine carries the album, for a folder or a crumb to take -->
<svelte:document ondragstart={dragAlbum} ondragend={() => setActiveDragPayload(null)} />

<!-- a new album made here while a folder is open goes into that folder, as on the Mac (Create album, or the empty
     state's); made anywhere else it waits at the top, where every album outside the folders sits -->
<OnEvents
  onAlbumCreate={(album) => {
    if (folderId) {
      void albumFolders.moveAlbum(album.id, folderId);
    }
  }}
/>

<UserPageLayout title={data.meta.title} use={[[scrollMemory, { routeStartsWith: Route.albums() }]]}>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <AlbumsControls {albumGroups} bind:searchQuery />
      <Button leadingIcon={mdiFolderPlusOutline} onclick={newFolder} size="small" variant="ghost" color="secondary">
        <p class="hidden md:block">{$t('space_album_folder_new')}</p>
      </Button>
    </div>
  {/snippet}

  <div class="xl:hidden">
    <div class="h-14 w-fit py-2 dark:text-immich-dark-fg">
      <GroupTab
        label={$t('show_albums')}
        filters={Object.keys(AlbumFilter)}
        selected={$albumViewSettings.filter}
        onSelect={(selected) => ($albumViewSettings.filter = selected)}
      />
    </div>
    <div class="w-60">
      <SearchBar placeholder={$t('search_albums')} bind:name={searchQuery} showLoadingSpinner={false} />
    </div>
  </div>

  {#if folderId}
    <SpaceAlbumFolderBreadcrumb
      {path}
      folders={albumFolders.folders}
      albums={droppable}
      canManage
      onNavigate={(id) => void openFolder(id)}
      onDropItem={drop}
    />
  {/if}

  {#if subfolders.length > 0}
    <div class="mt-4 grid grid-auto-fill-56 gap-y-4" role="list" data-testid="album-folders">
      {#each subfolders as folder (folder.id)}
        {@const summary = summaries.get(folder.id) ?? EMPTY_FOLDER_SUMMARY}
        <SpaceAlbumFolderCard
          {folder}
          albumCount={summary.albumCount}
          previewAssetIds={summary.previewAssetIds}
          canManage
          folders={albumFolders.folders}
          albums={droppable}
          onOpen={(folder) => void openFolder(folder.id)}
          onRename={renameFolder}
          onMove={moveFolder}
          onDelete={deleteFolder}
          onDropItem={drop}
        />
      {/each}
    </div>
  {/if}

  <Albums
    ownedAlbums={ownedHere}
    sharedAlbums={sharedHere}
    userSettings={$albumViewSettings}
    allowEdit
    {searchQuery}
    bind:albumGroupIds={albumGroups}
  >
    {#snippet empty()}
      {#if subfolders.length > 0}
        <!-- a level of folders only -->
      {:else if folderId}
        <!-- Local Omarchy layer: an empty folder says how albums get in, in the empty states' grammar on the gutter
             (upstream centred one grey line); an album made here goes in it (OnEvents above) -->
        <EmptyState
          title={$t('space_album_folder_empty')}
          body={$t('album_folder_empty_body')}
          action={{ label: $t('create_album'), onclick: () => createAlbumAndRedirect() }}
        />
      {:else}
        <EmptyState
          title={$t('albums_empty_title')}
          body={$t('no_albums_message')}
          action={{ label: $t('create_album'), onclick: () => createAlbumAndRedirect() }}
        />
      {/if}
    {/snippet}
  </Albums>
</UserPageLayout>
