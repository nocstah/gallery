<script lang="ts">
  import { isWritableSpace } from '#lib/components/shared-components/collection-selection/collection-selection-utils.ts';
  import AlbumTree from '#lib/components/sidebar/album-tree.svelte';
  import {
    getAllSpacesQuery,
    getSpaceAlbumFoldersQuery,
    getSpaceAlbumsQuery,
  } from '#lib/gallery/spaces/space.query.ts';
  import {
    isSpaceAlbumsExpanded,
    recentSpaceAlbumsExpanded,
    setSpaceAlbumsExpanded,
  } from '#lib/gallery/stores/preferences.store.ts';
  import { isLibrarySpace } from '#lib/managers/album-folders.svelte.ts';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { dropSpring, dropTarget } from '#lib/managers/sidebar-drop.svelte.ts';
  import { queryClient } from '#lib/queries/client.ts';
  import { Route } from '#lib/route.ts';
  import { sidebarModeStore } from '#lib/stores/sidebar-mode.svelte.ts';
  import { pinnedSpaceIds } from '#lib/stores/space-view.store.ts';
  import { getAssetMediaUrl } from '#lib/utils.ts';
  import { handleError } from '#lib/utils/handle-error.ts';
  import { splitPinnedSpaces } from '#lib/utils/space-utils.ts';
  import { Icon } from '@immich/ui';
  import { mdiAccountMultipleOutline, mdiChevronDown, mdiChevronRight } from '@mdi/js';
  import { createQueries, createQuery } from '@tanstack/svelte-query';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';
  import { get } from 'svelte/store';
  import { page } from '$app/state';

  const sortByActivity = <T extends { lastActivityAt?: string | null }>(a: T, b: T): number => {
    const aTime = a.lastActivityAt ?? '';
    const bTime = b.lastActivityAt ?? '';
    return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
  };

  // Shares the People pages' spaces list (space.query.ts); the last list stays on screen while an
  // invalidation refetches it.
  const spacesQuery = createQuery(getAllSpacesQuery, () => queryClient);
  const allSpaces = $derived(spacesQuery.data);

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

  // One albums query per shown space, enabled while its row is expanded — including an expansion
  // persisted from a prior session. The cache outlives collapse/expand; linking or unlinking an album
  // invalidates it (space.query.ts).
  const albumQueries = createQueries(
    () => ({
      queries: spaces.map((space) => ({
        ...getSpaceAlbumsQuery(space.id),
        enabled: isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id),
        // Local Omarchy layer: report every change. By default a query only reports the fields read through its
        // tracking proxy, and a row expanded before its lists load reads them only through derived values, so their
        // arrival went unreported and the tree never drew
        notifyOnChangeProps: 'all',
      })),
    }),
    () => queryClient,
  );
  const spaceAlbums = $derived(Object.fromEntries(spaces.map((space, index) => [space.id, albumQueries[index]?.data])));

  // Local Omarchy layer: the space's folders come with its albums, for its tree (space.query.ts keeps them under the
  // albums' key, so they refresh together)
  const folderQueries = createQueries(
    () => ({
      queries: spaces.map((space) => ({
        ...getSpaceAlbumFoldersQuery(space.id),
        enabled: isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id),
        notifyOnChangeProps: 'all', // as the albums above
      })),
    }),
    () => queryClient,
  );
  const spaceFolders = $derived(
    Object.fromEntries(spaces.map((space, index) => [space.id, folderQueries[index]?.data])),
  );

  // A failed load collapses the row again; its cache stays unset, so the next expand retries.
  const reportedErrors = new SvelteSet<string>();
  $effect(() => {
    for (const [index, space] of spaces.entries()) {
      for (const [kind, result] of [
        ['albums', albumQueries[index]],
        ['folders', folderQueries[index]],
      ] as const) {
        if (!result?.isError) {
          continue;
        }
        const key = `${space.id}:${kind}:${result.errorUpdatedAt}`;
        if (reportedErrors.has(key)) {
          continue;
        }
        reportedErrors.add(key);
        handleError(result.error, $t('failed_to_load_albums'));
        setSpaceAlbumsExpanded(space.id, false, topSpaceIds);
      }
    }
  });

  const toggleAlbums = (spaceId: string) => {
    setSpaceAlbumsExpanded(spaceId, !isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, spaceId), topSpaceIds);
  };

  // Local Omarchy layer: photos carried over a Space go into it, and its tree springs open under them
  // (managers/sidebar-drop); its albums take them when I may add to the Space (owner or editor)
  const me = $derived(authManager.authenticated ? authManager.user.id : null);
  const springOf = (spaceId: string) => ({
    isOpen: () => isSpaceAlbumsExpanded(get(recentSpaceAlbumsExpanded), spaceId),
    open: () => toggleAlbums(spaceId),
    close: () => setSpaceAlbumsExpanded(spaceId, false, topSpaceIds),
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
        void queryClient.invalidateQueries({ queryKey: getSpaceAlbumsQuery(space.id).queryKey });
      }
    }
  });

  // These rows stay rendered in the rail so it keeps the sidebar's vertical rhythm; collapsed
  // they show only their thumbnail, centred, the way Google Photos' rail does.
  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
</script>

{#each spaces as space (space.id)}
  {const spacePath = $derived(`/spaces/${space.id}`)}
  {const hasAlbums = $derived((space.albumCount ?? 0) > 0)}
  {const cachedAlbums = $derived(spaceAlbums[space.id])}
  {const cachedFolders = $derived(spaceFolders[space.id])}
  {const expanded = $derived(
    isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id) &&
      (cachedAlbums === undefined || cachedAlbums.length > 0),
  )}
  <!-- Local Omarchy layer: the space opens into its tree (its folders and albums, like the Mac's sidebar), and a
       folder or album on screen lights its own row in it, so only one row ever reads as selected; the space keeps
       the light everywhere else, including its albums page at the top. -->
  {const activeAlbumId = $derived(new RegExp(`^${spacePath}/albums/([^/]+)`).exec(page.url.pathname)?.[1] ?? null)}
  {const activeFolderId = $derived(
    expanded && page.url.pathname === `${spacePath}/albums` ? page.url.searchParams.get('folder') : null,
  )}
  {const active = $derived(
    page.url.pathname.startsWith(spacePath) && !(expanded && !collapsed && (activeAlbumId || activeFolderId)),
  )}
  {const writable = $derived(isWritableSpace(space, me))}
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
          {#if space.thumbnailAssetId}
            <div
              class="size-6 rounded-sm bg-cover"
              style={`background-image:url('${getAssetMediaUrl({ id: space.thumbnailAssetId })}')`}
              data-testid="sidebar-space-thumbnail-{space.id}"
            ></div>
          {:else}
            <!-- Local Omarchy layer: a Space without a cover wears the Space's mark (people together, as the pickers
                 draw a Space), the size of the Shared links row's icon below it, where a grey square stood in -->
            <span class="flex size-6 items-center justify-center" data-testid="sidebar-space-thumbnail-{space.id}">
              <Icon icon={mdiAccountMultipleOutline} size="1.25em" aria-hidden={true} />
            </span>
          {/if}
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
    {#if expanded && !collapsed && cachedAlbums && cachedFolders}
      <AlbumTree
        scope="space:{space.id}"
        label={space.name}
        folders={cachedFolders}
        albums={cachedAlbums.map(({ id, albumName, folderId = null }) => ({
          id,
          name: albumName,
          folderId,
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
