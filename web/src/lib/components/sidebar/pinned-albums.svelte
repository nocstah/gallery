<script lang="ts">
  // Local Omarchy layer: the albums pinned to the sidebar (stores/pinned-albums), a small Pinned group above Library,
  // in the order pinned, as the Mac puts Pinned first. A row is laid out like the sidebar's own rows, with the album's
  // cover where their icon sits (so pinned albums tell apart in the rail too); the album on screen inverts it, and its
  // row in the Albums tree then stays dark (components/sidebar/albums-tree). Photos carried to a row go into the album
  // (managers/sidebar-drop), and its right-click unpins it. Nothing shows until an album is pinned.
  import { page } from '$app/state';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import SidebarNavGroup from '$lib/components/sidebar/sidebar-nav-group.svelte';
  import { albumFolders } from '$lib/managers/album-folders.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { dropTarget } from '$lib/managers/sidebar-drop.svelte';
  import { Route } from '$lib/route';
  import { pinnedAlbums } from '$lib/stores/pinned-albums.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { isAlbumEditor } from '$lib/utils/album-utils';
  import { showPinMenu } from '$lib/utils/pin-menu';
  import type { AlbumResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiImageAlbum } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
  const me = $derived(authManager.authenticated ? authManager.user.id : undefined);

  // the pinned albums Gallery has not named yet: those pinned here, in another tab, or before a reload
  $effect(() => {
    if (pinnedAlbums.ids.length > 0) {
      untrack(() => void pinnedAlbums.load());
    }
  });

  // mine or one I edit, or one filed in my Library (whose albums I may add to)
  const writable = (album: AlbumResponseDto) =>
    !!me && (isAlbumEditor(album, me) || albumFolders.linked.some(({ id }) => id === album.id));
</script>

<OnEvents
  onAlbumUpdate={(album) => pinnedAlbums.remember(album)}
  onAlbumDelete={(album) => pinnedAlbums.forget(album.id)}
/>

{#if pinnedAlbums.shown.length > 0}
  <SidebarNavGroup title={$t('sidebar_pinned')} />
  <div data-testid="sidebar-pinned">
    {#each pinnedAlbums.shown as album (album.id)}
      {@const active = page.url.pathname.startsWith(Route.viewAlbum({ id: album.id }))}
      {@const name = album.albumName || $t('unnamed_album')}
      <!-- the right-click menu is a shortcut: the album's own ⋮ menus carry the same item for the keyboard -->
      <a
        href={Route.viewAlbum({ id: album.id })}
        title={collapsed ? name : undefined}
        aria-current={active ? 'page' : undefined}
        data-active={String(active)}
        data-testid="sidebar-pinned-{album.id}"
        class="flex place-items-center gap-4 rounded-e-full py-3 transition-[padding,margin,width] delay-100 duration-100 hover:bg-subtle {collapsed
          ? 'ms-4 w-12 ps-3.25'
          : 'mx-3 w-[calc(100%-1.5rem)] ps-7 pe-4'}"
        use:dropTarget={{ kind: 'album', id: album.id, name, writable: writable(album) }}
        oncontextmenu={(event) => showPinMenu(event, album.id)}
      >
        {#if album.albumThumbnailAssetId}
          <span
            class="size-5.5 shrink-0 rounded-sm bg-cover bg-center"
            style:background-image="url('{getAssetMediaUrl({ id: album.albumThumbnailAssetId })}')"
            aria-hidden="true"
          ></span>
        {:else}
          <Icon icon={mdiImageAlbum} size="1.375em" flipped class="shrink-0" aria-hidden={true} />
        {/if}
        <span class="truncate text-sm font-medium" class:w-0={collapsed} class:opacity-0={collapsed}>{name}</span>
      </a>
    {/each}
  </div>
{/if}
