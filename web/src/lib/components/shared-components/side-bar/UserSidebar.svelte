<script lang="ts">
  import { page } from '$app/state';
  import BottomInfo from '$lib/components/shared-components/side-bar/BottomInfo.svelte';
  import RailStorage from '$lib/components/shared-components/side-bar/rail-storage.svelte';
  import RecentSpaces from '$lib/components/shared-components/side-bar/recent-spaces.svelte';
  import SharedLinksRow from '$lib/components/shared-components/side-bar/shared-links-row.svelte';
  import AlbumsTree from '$lib/components/sidebar/albums-tree.svelte';
  import NewAlbumDrop from '$lib/components/sidebar/new-album-drop.svelte';
  import PinnedAlbums from '$lib/components/sidebar/pinned-albums.svelte';
  import SidebarNavGroup from '$lib/components/sidebar/sidebar-nav-group.svelte';
  import SidebarNavItem from '$lib/components/sidebar/sidebar-nav-item.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar-shell.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { offeredSpecialAlbums, specialAlbums } from '$lib/managers/special-albums.svelte';
  import { Route } from '$lib/route';
  import { pinnedAlbums } from '$lib/stores/pinned-albums.svelte';
  import { recentAlbumsDropdown, recentSpacesDropdown } from '$lib/stores/preferences.store';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import {
    mdiAccount,
    mdiAccountOutline,
    mdiArchiveArrowDown,
    mdiArchiveArrowDownOutline,
    mdiCards,
    mdiCardsOutline,
    mdiChat,
    mdiChatOutline,
    mdiCompass,
    mdiCompassOutline,
    mdiDatabaseImportOutline,
    mdiFolderOutline,
    mdiHeart,
    mdiHeartOutline,
    mdiImageAlbum,
    mdiImageMultiple,
    mdiImageMultipleOutline,
    mdiInbox,
    mdiInboxOutline,
    mdiLock,
    mdiLockOutline,
    mdiMap,
    mdiMapOutline,
    mdiShareVariant,
    mdiShareVariantOutline,
    mdiTagMultipleOutline,
    mdiTelevisionPlay,
    mdiToolbox,
    mdiToolboxOutline,
    mdiTrashCan,
    mdiTrashCanOutline,
    mdiUploadOutline,
    mdiViewDashboard,
    mdiViewDashboardOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);

  // Local Omarchy layer: the owner's tools (the command center, Curator's inbox and chat, Utilities, Import) show for
  // the owner only, the server's admin ("Owner tools only for me"); a family account sees the library and what is
  // shared, and those pages send it to Photos (their loaders: authenticate's admin)
  const ownerTools = $derived(authManager.authenticated && authManager.user.isAdmin);

  // Local Omarchy layer: a pinned album on screen lights its row under Pinned, not Albums
  const pinnedOnScreen = () => {
    const id = /^\/albums\/([^/]+)/.exec(page.url.pathname)?.[1];
    return !!id && pinnedAlbums.has(id);
  };
</script>

<Sidebar ariaLabel={$t('primary')}>
  <!-- Local Omarchy layer: the command center, everything about the library on one screen (routes/(user)/command) -->
  {#if ownerTools}
    <SidebarNavItem
      title={$t('command_title')}
      href="/command"
      icon={mdiViewDashboardOutline}
      activeIcon={mdiViewDashboard}
    />
  {/if}

  <SidebarNavItem
    title={$t('photos')}
    href={Route.photos()}
    icon={mdiImageMultipleOutline}
    activeIcon={mdiImageMultiple}
  />

  {#if featureFlagsManager.value.search}
    <!-- Local Omarchy layer: a compass, since the bar's Search button already uses the magnifier -->
    <SidebarNavItem title={$t('explore')} href={Route.explore()} icon={mdiCompassOutline} activeIcon={mdiCompass} />
  {/if}

  {#if featureFlagsManager.value.map}
    <SidebarNavItem title={$t('map')} href={Route.map()} icon={mdiMapOutline} activeIcon={mdiMap} />
  {/if}

  {#if authManager.preferences.memories.enabled && authManager.preferences.memories.sidebarWeb}
    <SidebarNavItem title={$t('memories')} href={Route.memories()} icon={mdiCardsOutline} activeIcon={mdiCards} />
  {/if}

  <!-- Local Omarchy layer: Room, the archive across the room, full screen without the shell (components/room): today's
       memories, then the albums Curator keeps for the TV -->
  <SidebarNavItem title={$t('room')} href={Route.room()} icon={mdiTelevisionPlay} />

  {#if authManager.preferences.people.enabled && authManager.preferences.people.sidebarWeb}
    <SidebarNavItem title={$t('people')} href={Route.people()} icon={mdiAccountOutline} activeIcon={mdiAccount} />
  {/if}

  <!-- Local Omarchy layer: the albums pinned to the sidebar, first after the views as the Mac puts Pinned, and above
       Library so a long Albums tree never pushes them out of sight (components/sidebar/pinned-albums) -->
  <PinnedAlbums />

  <SidebarNavGroup title={$t('library')} />

  <SidebarNavItem title={$t('favorites')} href={Route.favorites()} icon={mdiHeartOutline} activeIcon={mdiHeart} />

  <!-- Local Omarchy layer: the special albums, photos kept out of Photos (To do, Villa: managers/special-albums), with
       how many each holds; the album itself lights its row, not Albums. Photos carried to one move there, as its key
       moves them (managers/sidebar-drop) -->
  {#each offeredSpecialAlbums() as special (special.key)}
    <SidebarNavItem
      title={$t(special.words.label)}
      href={special.route}
      isActive={() => page.url.pathname === special.route || special.isAlbumPath(page.url.pathname)}
      icon={special.icon}
      activeIcon={special.activeIcon}
      count={special.count}
      drop={{ kind: 'special', special, name: $t(special.words.label) }}
    />
  {/each}

  <!-- Local Omarchy layer: Albums opens into the albums' tree (folders and albums, like the Mac's My Albums), whose
       rows light the folder or album on screen; Albums itself is lit at the top of the Albums page, or for any album
       while its tree is closed -->
  <SidebarNavItem
    title={$t('albums')}
    href={Route.albums()}
    isActive={() =>
      page.url.pathname.startsWith(Route.albums()) &&
      specialAlbums.every((special) => !special.isAlbumPath(page.url.pathname)) &&
      !pinnedOnScreen() &&
      (!$recentAlbumsDropdown ||
        collapsed ||
        (page.url.pathname === Route.albums() && !page.url.searchParams.get('folder')))}
    icon={{ icon: mdiImageAlbum, flipped: true }}
    bind:expanded={$recentAlbumsDropdown}
  >
    {#snippet items()}
      <span in:fly={{ y: -20 }} class="hidden md:block">
        <AlbumsTree />
      </span>
    {/snippet}
  </SidebarNavItem>

  <!-- Local Omarchy layer (plan A, "Let's go with A"): one Shared section beside Albums, as the Mac keeps Shared Albums
       beside My Albums. It opens the Shared page (shared albums, Spaces, partners) and holds the Spaces (Library
       excepted: it is the Albums tree's engine), each opening into its own folder tree, then the public links. It
       replaces the separate Spaces, Sharing and Shared links rows; the share arrow, as in Ctrl+K. -->
  <SidebarNavItem
    title={$t('shared')}
    href={Route.sharing()}
    isActive={() => page.url.pathname === Route.sharing() || page.url.pathname === Route.spaces()}
    icon={mdiShareVariantOutline}
    activeIcon={mdiShareVariant}
    bind:expanded={$recentSpacesDropdown}
  >
    {#snippet items()}
      <span in:fly={{ y: -20 }} class="hidden md:block">
        <RecentSpaces />
        <SharedLinksRow />
      </span>
    {/snippet}
  </SidebarNavItem>

  {#if authManager.preferences.tags.enabled && authManager.preferences.tags.sidebarWeb}
    <SidebarNavItem title={$t('tags')} href={Route.tags()} icon={{ icon: mdiTagMultipleOutline, flipped: true }} />
  {/if}

  {#if authManager.preferences.recentlyAdded.sidebarWeb}
    <SidebarNavItem
      title={$t('recently_added')}
      href={Route.recentlyAdded()}
      icon={{ icon: mdiUploadOutline, flipped: true }}
    />
  {/if}

  {#if authManager.preferences.folders.enabled && authManager.preferences.folders.sidebarWeb}
    <SidebarNavItem title={$t('folders')} href={Route.folders()} icon={{ icon: mdiFolderOutline, flipped: true }} />
  {/if}

  {#if ownerTools}
    <!-- Local Omarchy layer: Curator's suggestions wait here for review (routes/(user)/inbox) -->
    <SidebarNavItem title={$t('ai_inbox')} href="/inbox" icon={mdiInboxOutline} activeIcon={mdiInbox} />

    <!-- Local Omarchy layer: a conversation with Curator's local model about the library (routes/(user)/chat) -->
    <SidebarNavItem title={$t('chat_title')} href="/chat" icon={mdiChatOutline} activeIcon={mdiChat} />

    <SidebarNavItem title={$t('utilities')} href={Route.utilities()} icon={mdiToolboxOutline} activeIcon={mdiToolbox} />

    <SidebarNavItem title={$t('import')} href={Route.import()} icon={mdiDatabaseImportOutline} />
  {/if}

  <SidebarNavItem
    title={$t('archive')}
    href={Route.archive()}
    icon={mdiArchiveArrowDownOutline}
    activeIcon={mdiArchiveArrowDown}
  />

  <SidebarNavItem title={$t('locked_folder')} href={Route.locked()} icon={mdiLockOutline} activeIcon={mdiLock} />

  {#if featureFlagsManager.value.trash}
    <SidebarNavItem title={$t('trash')} href={Route.trash()} icon={mdiTrashCanOutline} activeIcon={mdiTrashCan} />
  {/if}

  {#if collapsed}
    <RailStorage />
  {:else}
    <!-- BottomInfo's three sections carry a start inset only (StorageSpace `ms-4`, PurchaseInfo
         `ps-4`, ServerStatus `ps-5`) because upstream let the sidebar's scrollbar gutter stand in
         for the other side, which reads as lopsided. Supply the matching end inset here rather
         than in BottomInfo itself, which AdminPageLayout also renders with its own chrome.
         `mt-auto` moves onto the wrapper - it is the flex child now, so BottomInfo's own `mt-auto`
         no longer has the panel's free space to absorb - and `gap-1` keeps the row spacing the
         sections had as direct children of the panel. -->
    <div class="mt-auto flex flex-col gap-1 pe-4">
      <BottomInfo />
    </div>
  {/if}

  <!-- Local Omarchy layer: New album, at the sidebar's foot while photos are carried (managers/sidebar-drop) -->
  <NewAlbumDrop />
</Sidebar>
