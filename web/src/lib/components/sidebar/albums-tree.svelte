<script lang="ts">
  // Local Omarchy layer: Albums in the sidebar opens into the albums' tree, like My Albums on the Mac: the Albums
  // page's folders (the Library Space's, managers/album-folders) with their albums, then every other album of mine at
  // the top. To do and Villa have rows of their own above Albums, so they are not repeated here.
  import { page } from '$app/state';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import AlbumTree, { type TreeAlbum } from '$lib/components/sidebar/album-tree.svelte';
  import { albumFolders } from '$lib/managers/album-folders.svelte';
  import { specialAlbums } from '$lib/managers/special-albums.svelte';
  import { Route } from '$lib/route';
  import { pinnedAlbums } from '$lib/stores/pinned-albums.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { getAllAlbums, type AlbumResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let owned = $state<AlbumResponseDto[]>([]);

  const loadOwned = async () => {
    try {
      owned = await getAllAlbums({ isOwned: true });
    } catch (error) {
      handleError(error, $t('failed_to_load_albums'));
    }
  };

  onMount(() => {
    void albumFolders.ready();
    void loadOwned();
  });

  const albums = $derived.by<TreeAlbum[]>(() => {
    const filed = new Set(albumFolders.linked.map(({ id }) => id));
    const outside = owned.filter(({ id }) => !filed.has(id));
    // shared with people or by a link (plan A): marked in the tree
    const shared = new Set(owned.filter((album) => album.shared || album.hasSharedLink).map(({ id }) => id));
    return [
      ...albumFolders.linked.map(({ id, albumName, folderId }) => ({
        id,
        name: albumName,
        folderId: folderId ?? null,
      })),
      ...outside.map(({ id, albumName }) => ({ id, name: albumName, folderId: null })),
    ]
      .filter(({ id }) => specialAlbums.every((special) => !special.isAlbum(id)))
      .map((album) => ({
        ...album,
        shared: shared.has(album.id),
        hidden: albumFolders.hiddenFromTimeline(album.id),
      }));
  });

  const activeFolderId = $derived(page.url.pathname === Route.albums() ? page.url.searchParams.get('folder') : null);
  // a pinned album lights its row under Pinned instead (components/sidebar/pinned-albums), so one row reads as on
  // screen, and its folders here stay as they were
  const activeAlbumId = $derived.by(() => {
    const id = /^\/albums\/([^/]+)/.exec(page.url.pathname)?.[1] ?? null;
    return id && pinnedAlbums.has(id) ? null : id;
  });

  // the rail shows icons only: the tree waits for the sidebar to open
  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
</script>

<OnEvents
  onAlbumCreate={loadOwned}
  onAlbumUpdate={loadOwned}
  onAlbumDelete={loadOwned}
  onAlbumShare={loadOwned}
  onSharedLinkCreate={loadOwned}
  onSharedLinkDelete={loadOwned}
/>

{#if !collapsed}
  <AlbumTree
    scope="albums"
    label={$t('albums')}
    folders={albumFolders.folders}
    {albums}
    folderHref={(id) => Route.albums({ folder: id })}
    albumHref={(id) => Route.viewAlbum({ id })}
    {activeFolderId}
    {activeAlbumId}
    canAdd
    pinnable
  />
{/if}
