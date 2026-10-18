<script lang="ts">
  import { page } from '$app/state';
  import { isWritableSpace } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
  import AlbumTree from '$lib/components/sidebar/album-tree.svelte';
  import { isLibrarySpace } from '$lib/managers/album-folders.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { dropSpring, dropTarget } from '$lib/managers/sidebar-drop.svelte';
  import { Route } from '$lib/route';
  import {
    isSpaceAlbumsExpanded,
    recentSpaceAlbumsExpanded,
    setSpaceAlbumsExpanded,
  } from '$lib/stores/preferences.store';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { pinnedSpaceIds } from '$lib/stores/space-view.store';
  import { loadSpaces, userInteraction } from '$lib/stores/user.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { splitPinnedSpaces } from '$lib/utils/space-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getSharedSpaceAlbumFolders, getSharedSpaceAlbums } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';

  const sortByActivity = <T extends { lastActivityAt?: string | null }>(a: T, b: T): number => {
    const aTime = a.lastActivityAt ?? '';
    const bTime = b.lastActivityAt ?? '';
    return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
  };

  let allSpaces = $state(userInteraction.recentSpaces);

  let spaces = $derived.by(() => {
    if (!allSpaces) {
      return [];
    }
    // Local Omarchy layer: Library is the Albums tree's engine, not a Space to list (managers/album-folders)
    const shown = allSpaces.filter((space) => !isLibrarySpace(space));
    const { pinned, unpinned } = splitPinnedSpaces(shown, $pinnedSpaceIds);
    return [...pinned.sort(sortByActivity), ...unpinned.sort(sortByActivity)].slice(0, 3);
  });

  const topSpaceIds = $derived(spaces.map((s) => s.id));

  // Spaces with a fetch currently in flight — guards against a duplicate `getSharedSpaceAlbums`
  // call when the mount/refresh effect below re-runs while the cache is still unset.
  const inFlightSpaceAlbumFetches = new SvelteSet<string>();

  const loadAlbums = async (spaceId: string, fresh = false) => {
    const cachedAlbums = userInteraction.spaceAlbums?.[spaceId];
    if ((cachedAlbums && !fresh) || inFlightSpaceAlbumFetches.has(spaceId)) {
      return; // already fetched (possibly an empty list), or a fetch is already in flight — never refetch
    }
    inFlightSpaceAlbumFetches.add(spaceId);
    try {
      // Local Omarchy layer: the space's folders come with its albums, for its tree
      const [albums, folders] = await Promise.all([
        getSharedSpaceAlbums({ id: spaceId }),
        getSharedSpaceAlbumFolders({ id: spaceId }),
      ]);
      const sorted = [...albums].sort((a, b) => b.linkedAt.localeCompare(a.linkedAt));
      userInteraction.spaceFolders = { ...userInteraction.spaceFolders, [spaceId]: folders };
      userInteraction.spaceAlbums = { ...userInteraction.spaceAlbums, [spaceId]: sorted };
    } catch (error) {
      handleError(error, $t('failed_to_load_albums'));
      setSpaceAlbumsExpanded(spaceId, false, topSpaceIds); // cache stays unset → retry on next expand
    } finally {
      inFlightSpaceAlbumFetches.delete(spaceId);
    }
  };

  const toggleAlbums = (spaceId: string) => {
    const nowExpanded = !isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, spaceId);
    setSpaceAlbumsExpanded(spaceId, nowExpanded, topSpaceIds);
    if (nowExpanded) {
      void loadAlbums(spaceId);
    }
  };

  // Local Omarchy layer: photos carried over a Space go into it, and its tree springs open under them
  // (managers/sidebar-drop); its albums take them when I may add to the Space (owner or editor)
  const me = $derived(authManager.authenticated ? authManager.user.id : null);
  const springOf = (spaceId: string) => ({
    isOpen: () => isSpaceAlbumsExpanded(get(recentSpaceAlbumsExpanded), spaceId),
    open: () => toggleAlbums(spaceId),
    close: () => setSpaceAlbumsExpanded(spaceId, false, topSpaceIds),
  });

  // Re-fetch albums for any currently-shown space whose expansion state was persisted as `true`
  // (e.g. from a prior session) but whose in-memory album cache hasn't been populated yet — covers
  // both a fresh page load (cache always starts undefined) and an in-session cache eviction after
  // a link/unlink while the space is still marked expanded.
  $effect(() => {
    for (const space of spaces) {
      if (
        isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id) &&
        userInteraction.spaceAlbums?.[space.id] === undefined
      ) {
        void loadAlbums(space.id);
      }
    }
  });

  // Local Omarchy layer: folders are made, moved and renamed on a space's albums page, so arriving there refreshes the
  // space's open tree (in place: the tree stays on screen meanwhile)
  $effect(() => {
    const path = page.url.pathname;
    for (const space of untrack(() => spaces)) {
      if (
        path === `/spaces/${space.id}/albums` &&
        untrack(() => isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id))
      ) {
        void loadAlbums(space.id, true);
      }
    }
  });

  // Shares the People pages' fetch of the spaces list. The last list stays on screen while a
  // cache reset refetches it.
  $effect(() => {
    if (userInteraction.recentSpaces) {
      allSpaces = userInteraction.recentSpaces;
    }
    loadSpaces();
  });

  // These rows stay rendered in the rail so it keeps the sidebar's vertical rhythm; collapsed
  // they show only their thumbnail, centred, the way Google Photos' rail does.
  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
</script>

{#each spaces as space (space.id)}
  {@const spacePath = `/spaces/${space.id}`}
  {@const hasAlbums = (space.albumCount ?? 0) > 0}
  {@const cachedAlbums = userInteraction.spaceAlbums?.[space.id]}
  {@const expanded =
    isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id) &&
    (cachedAlbums === undefined || cachedAlbums.length > 0)}
  <!-- Local Omarchy layer: the space opens into its tree (its folders and albums, like the Mac's sidebar), and a
       folder or album on screen lights its own row in it, so only one row ever reads as selected; the space keeps
       the light everywhere else, including its albums page at the top. -->
  {@const activeAlbumId = new RegExp(`^${spacePath}/albums/([^/]+)`).exec(page.url.pathname)?.[1] ?? null}
  {@const activeFolderId =
    expanded && page.url.pathname === `${spacePath}/albums` ? page.url.searchParams.get('folder') : null}
  {@const active =
    page.url.pathname.startsWith(spacePath) && !(expanded && !collapsed && (activeAlbumId || activeFolderId))}
  {@const writable = isWritableSpace(space, me)}
  <div data-drop-group>
    <!-- The chevron is absolutely positioned against this wrapper, so it must enclose the space row
         alone: with the expanded album rows inside it, `top-1/2` would centre the chevron on the
         whole group instead of on the space it belongs to. -->
    <div class="relative">
      <!-- No chevron in the rail: it is unreadable beside a 24px thumbnail at 5rem, and the
           sub-tree it toggles is already showing. Expansion is driven from the expanded
           sidebar and persists, exactly as the parent nav item's own chevron does.
           `inset-s-8` indents it past the Spaces row's own chevron at `inset-s-3`: stacked at
           the same inset the parent caret sat directly above its children's, reading as one
           column rather than a hierarchy. The 20px step mirrors the rows' own indent. -->
      {#if hasAlbums && !collapsed}
        <!-- Local Omarchy layer: the chevron names the Space it opens -->
        <button
          type="button"
          aria-label={$t(expanded ? 'collapse_named' : 'expand_named', { values: { name: space.name } })}
          aria-expanded={expanded}
          data-testid="sidebar-space-chevron-{space.id}"
          class="absolute inset-s-8 top-1/2 z-10 hidden -translate-y-1/2 rounded-lg p-0.5 hover:bg-subtle md:block"
          onclick={() => toggleAlbums(space.id)}
        >
          <!-- 1.25em matches the chevron the Spaces row above renders: 1em read too faint next to
               a 1.375em nav icon and a 1.5em thumbnail. -->
          <Icon icon={expanded ? mdiChevronDown : mdiChevronRight} size="1.25em" />
        </button>
      {/if}
      <!-- Expanded, the pill carries the sidebar's shared 0.75rem inset on both ends rather than
           `w-full`, and its `ps-*` is 0.75rem short of the thumbnail's distance from the sidebar
           edge to compensate - the same pairing SidebarNavItem uses, so the two indent scales stay
           in step. -->
      <a
        href={Route.viewSpace({ id: space.id })}
        title={space.name}
        aria-current={active ? 'page' : undefined}
        data-active={String(active)}
        data-testid="sidebar-space-{space.id}"
        use:dropTarget={{ kind: 'space', space, writable }}
        use:dropSpring={hasAlbums ? springOf(space.id) : undefined}
        class="flex place-items-center gap-4 rounded-e-full py-3 transition-[padding,margin,width] delay-100 duration-100 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary {collapsed
          ? 'ms-4 w-12 ps-3'
          : 'mx-3 w-[calc(100%-1.5rem)] ps-12 group-hover:sm:pe-4 md:pe-4'}"
      >
        <div class="flex size-6 items-center justify-center">
          <!-- Always the thumbnail: the sidebar identifies a space, it doesn't report on it. New
               activity is surfaced on the Spaces page and by the in-timeline new-assets divider. -->
          <div
            class="size-6 rounded-sm bg-gray-200 bg-cover dark:bg-gray-600"
            style={space.thumbnailAssetId
              ? `background-image:url('${getAssetMediaUrl({ id: space.thumbnailAssetId })}')`
              : ''}
            data-testid="sidebar-space-thumbnail-{space.id}"
          ></div>
        </div>
        <!-- Kept mounted and collapsed to zero width rather than unmounted, so rail <-> expanded
             stays a CSS transition. `grow` has to go with it or the name would still claim width. -->
        <div
          class="truncate text-sm font-medium"
          class:grow={!collapsed}
          class:w-0={collapsed}
          class:opacity-0={collapsed}
        >
          {space.name}
        </div>
      </a>
    </div>
    {#if expanded && !collapsed && cachedAlbums}
      <AlbumTree
        scope="space:{space.id}"
        label={space.name}
        folders={userInteraction.spaceFolders?.[space.id] ?? []}
        albums={cachedAlbums.map(({ id, albumName, folderId }) => ({
          id,
          name: albumName,
          folderId: folderId ?? null,
        }))}
        folderHref={(folderId) => Route.viewSpaceAlbums({ id: space.id, folderId })}
        albumHref={(albumId) => Route.viewSpaceAlbum({ spaceId: space.id, albumId })}
        {activeFolderId}
        {activeAlbumId}
        canAdd={writable}
      />
    {/if}
  </div>
{/each}
