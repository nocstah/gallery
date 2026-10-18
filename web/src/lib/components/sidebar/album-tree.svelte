<script lang="ts" module>
  import { SvelteSet } from 'svelte/reactivity';

  /** An album in a tree: where it sits (`folderId`, null at the top) is all the tree needs to place it. */
  export interface TreeAlbum {
    id: string;
    name: string;
    folderId: string | null;
    /** shared with people or by a link: marked at the row's end, as the Mac marks a shared album */
    shared?: boolean;
    /** hidden from my timeline: marked at the row's end too, its photos are not in Photos */
    hidden?: boolean;
  }

  // Local Omarchy layer: the long levels shown whole from their more row, by `<tree>:<folder id>`: for this page load
  // only, never remembered, and kept from page to page (the sidebar is made again on every page) while the level stays
  // open, so a person can go from album to album in it
  const shownWhole = new SvelteSet<string>();
</script>

<script lang="ts">
  // Local Omarchy layer: albums in their folders as a tree, the way the Mac's Photos sidebar shows them ("should be
  // like mac with tree structure thats collapsable.. expandable"). A folder opens and closes on its chevron and opens
  // its page on its name; the folders a person opened are remembered per tree; the folder or album on screen is lit
  // and the folders above it open so it can be seen, for as long as it is on screen. Photos carried over the tree go
  // into an album row, and a folder row springs open under them (managers/sidebar-drop); an album a drop just made
  // lights for a moment. The tree is one tab stop, a WAI-ARIA tree walked with the arrows (utils/album-tree): every row
  // was a chevron and a link, so an album page had 172 tab stops before its first photo, 142 of them in the sidebar.
  // A long folder the tree opened by itself shows only the way to what is on screen, the rest behind "+N more": the
  // whole folder opened under an album page, some 140 rows.
  import { dropSpring, dropTarget, sidebarDrop } from '$lib/managers/sidebar-drop.svelte';
  import { albumTreeOpen } from '$lib/stores/preferences.store';
  import { albumKey, folderKey, moreKey, shownAt, treeKey, visibleRows } from '$lib/utils/album-tree';
  import { showPinMenu } from '$lib/utils/pin-menu';
  import type { SharedSpaceAlbumFolderDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import {
    mdiChevronDown,
    mdiChevronRight,
    mdiFolderOpenOutline,
    mdiFolderOutline,
    mdiImageAlbum,
    mdiEyeOffOutline,
    mdiShareVariantOutline,
  } from '@mdi/js';
  import { tick, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';

  interface Props {
    /** Which tree this is ('albums', 'space:<id>'): each remembers its own open folders */
    scope: string;
    folders: SharedSpaceAlbumFolderDto[];
    albums: TreeAlbum[];
    folderHref: (folderId: string) => string;
    albumHref: (albumId: string) => string;
    activeFolderId?: string | null;
    activeAlbumId?: string | null;
    label: string;
    /** I may add photos to its albums (mine, or a Space I edit): its album rows take photos carried to them */
    canAdd?: boolean;
    /** its album rows' right-click pins them to the sidebar (the Albums tree: stores/pinned-albums) */
    pinnable?: boolean;
  }

  let {
    scope,
    folders,
    albums,
    folderHref,
    albumHref,
    activeFolderId,
    activeAlbumId,
    label,
    canAdd = false,
    pinnable = false,
  }: Props = $props();

  let tree = $state<HTMLUListElement>();

  // by name the way a person numbers them ("2" before "10", years in order), as on the Albums page
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  const parentOf = $derived(new Map(folders.map(({ id, parentId }) => [id, parentId ?? null])));

  // a folder whose parent is gone, or an album whose folder is, sits at the top rather than nowhere
  const placed = (folderId: string | null | undefined) => (folderId && parentOf.has(folderId) ? folderId : null);

  // what sits at each level, keyed by the folder ('' is the top), each level by name
  const group = <T,>(items: T[], at: (item: T) => string | null, name: (item: T) => string) => {
    const levels: Record<string, T[]> = {};
    for (const item of items) {
      (levels[at(item) ?? ''] ??= []).push(item);
    }
    for (const level of Object.values(levels)) {
      level.sort((a, b) => byName(name(a), name(b)));
    }
    return levels;
  };
  const foldersIn = $derived(
    group(
      folders,
      (folder) => placed(folder.parentId),
      (folder) => folder.name,
    ),
  );
  const albumsIn = $derived(
    group(
      albums,
      (album) => placed(album.folderId),
      (album) => album.name,
    ),
  );

  // A folder is open when the person opened it (remembered, albumTreeOpen) or while it holds what is on screen
  // (revealed, below; never remembered: after one visit to a deep album, every page carried its folders open)
  const key = (folderId: string) => `${scope}:${folderId}`;
  const revealed = new SvelteSet<string>();
  const isOpen = (folderId: string) => revealed.has(key(folderId)) || !!$albumTreeOpen[key(folderId)];
  const setOpen = (folderId: string, value: boolean) => {
    if (!value) {
      revealed.delete(key(folderId));
      shownWhole.delete(key(folderId));
    }
    albumTreeOpen.update((open) => ({ ...open, [key(folderId)]: value }));
  };
  const toggle = (folderId: string) => setOpen(folderId, !isOpen(folderId));

  // a folder springs open under carried photos, and closes again when they go elsewhere; so does a long level's rest
  // under its more row (a drop there keeps it, as a drop keeps the folders on the way open)
  const springOf = (folderId: string) => ({
    isOpen: () => revealed.has(key(folderId)) || !!get(albumTreeOpen)[key(folderId)],
    open: () => setOpen(folderId, true),
    close: () => setOpen(folderId, false),
  });
  const moreSpring = (folderId: string) => ({
    isOpen: () => shownWhole.has(key(folderId)),
    open: () => shownWhole.add(key(folderId)),
    close: () => shownWhole.delete(key(folderId)),
  });

  // an album a drop just made is brought into the sidebar's view once its row is there
  $effect(() => {
    const arrived = sidebarDrop.arrived;
    if (arrived && albums.some(({ id }) => id === arrived)) {
      void tick().then(() =>
        tree?.querySelector(`[data-testid="tree-album-${CSS.escape(arrived)}"]`)?.scrollIntoView({ block: 'nearest' }),
      );
    }
  });

  // What comes on screen is never hidden in a closed folder: the folders above it open when it arrives (a folder
  // closed by hand afterwards stays closed), and close again once something else is on screen, unless the person
  // opened them; they are never remembered. A chain is never longer than Gallery's depth cap, so a broken tree cannot
  // loop.
  const onScreen = $derived(
    activeFolderId ? `folder:${activeFolderId}` : activeAlbumId ? `album:${activeAlbumId}` : '',
  );
  const onScreenAlbum = $derived(activeAlbumId ? albums.find(({ id }) => id === activeAlbumId) : undefined);
  // the folders above what is on screen, nearest first
  const chain = $derived.by(() => {
    const ids: string[] = [];
    let folderId = activeFolderId ? parentOf.get(activeFolderId) : placed(onScreenAlbum?.folderId);
    while (folderId && ids.length < 32) {
      ids.push(folderId);
      folderId = parentOf.get(folderId) ?? null;
    }
    return ids;
  });
  // the way to what is on screen, which a long level the tree opened keeps to (the folder on screen included)
  const path = $derived(new Set(activeFolderId ? [...chain, activeFolderId] : chain));
  let revealedFor: string | undefined;
  $effect(() => {
    const keys = chain.map((folderId) => key(folderId));
    // what is on screen has been found in the tree (the albums and folders load after the tree is made)
    const found = activeAlbumId ? !!onScreenAlbum : activeFolderId ? parentOf.has(activeFolderId) : true;
    // revealed once per arrival and chain: the albums and folders loading in later find the chain, and loading again
    // with nothing changed leaves a folder closed by hand closed
    const reveal = `${onScreen}|${keys.join('/')}`;
    untrack(() => {
      if (reveal === revealedFor) {
        return;
      }
      revealedFor = reveal;
      revealed.clear();
      for (const k of keys) {
        revealed.add(k);
      }
      // a level shown whole goes back to its way there once it closes (something else on screen)
      if (found) {
        for (const k of shownWhole) {
          if (k.startsWith(`${scope}:`) && !revealed.has(k) && !get(albumTreeOpen)[k]) {
            shownWhole.delete(k);
          }
        }
      }
    });
  });

  const filledFolder = (folderId: string) => (foldersIn[folderId]?.length ?? 0) + (albumsIn[folderId]?.length ?? 0) > 0;

  // What each level shows (utils/album-tree): everything in a level the person opened (the top is Albums', or the
  // Space's, opened by its own chevron), and in a long level the tree opened only the way to what is on screen
  const shownOf = (folderId: string | null) =>
    shownAt(foldersIn[folderId ?? ''] ?? [], albumsIn[folderId ?? ''] ?? [], {
      opened: folderId === null || !!$albumTreeOpen[key(folderId)],
      more: folderId !== null && shownWhole.has(key(folderId)),
      path,
      album: activeAlbumId,
    });
  const showMore = (folderId: string) => shownWhole.add(key(folderId));
  const showLess = (folderId: string) => shownWhole.delete(key(folderId));
  const nameOf = $derived(new Map(folders.map(({ id, name }) => [id, name])));

  // The rows the keyboard walks, in the order they show (utils/album-tree). One of them is the tree's tab stop: the row
  // last focused while it still shows, else the one on screen, else the first; the rest are reached with the arrows.
  const rows = $derived(visibleRows({ shown: shownOf, filled: filledFolder, isOpen }));
  let focused = $state<string>();
  const onScreenKey = $derived(
    activeFolderId ? folderKey(activeFolderId) : activeAlbumId ? albumKey(activeAlbumId) : undefined,
  );
  const tabStop = $derived.by(() => {
    const showing = (rowKey: string | undefined) => !!rowKey && rows.some((row) => row.key === rowKey);
    if (showing(focused)) {
      return focused;
    }
    return showing(onScreenKey) ? onScreenKey : rows[0]?.key;
  });

  const focusRow = async (rowKey: string) => {
    focused = rowKey;
    await tick();
    tree?.querySelector<HTMLElement>(`[data-key="${CSS.escape(rowKey)}"]`)?.focus();
  };

  // the tree's own keys, on the row with the focus; prevented, so the page's keys (B, V, the grid's arrows) skip them
  const onKeydown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) {
      return;
    }
    const row = (event.target as Element | null)?.closest<HTMLElement>('[role="treeitem"]');
    const at = row?.dataset.key;
    if (!row || !at) {
      return;
    }
    const move = treeKey(rows, at, event.key, getComputedStyle(row).direction === 'rtl');
    if (!move) {
      return;
    }
    event.preventDefault();
    if ('focus' in move) {
      void focusRow(move.focus);
    } else if ('open' in move) {
      setOpen(move.open, true);
    } else if ('close' in move) {
      setOpen(move.close, false);
    } else if ('more' in move) {
      showMore(move.more);
    } else if ('less' in move) {
      showLess(move.less);
    } else {
      row.click();
    }
  };

  // a row that takes the focus (a click, the arrows, a Tab into the tree) becomes the tree's tab stop
  const onFocusin = (event: FocusEvent) => {
    const at = (event.target as HTMLElement | null)?.dataset?.key;
    if (at) {
      focused = at;
    }
  };
</script>

<!-- A navigation tree (WAI-ARIA's treeview of links): each row's link is its tree item, so Enter follows it; a folder's
     link owns the group of rows under it; the row on screen is the selected one (selected and current, and no other
     row says either); the chevrons are the pointer's, since → and ← open and close a folder -->
{#snippet level(parentId: string | null, depth: number)}
  {@const shown = shownOf(parentId)}
  {#each shown.folders as folder (folder.id)}
    {@const open = isOpen(folder.id)}
    {@const filled = filledFolder(folder.id)}
    {@const active = folder.id === activeFolderId}
    {@const rowKey = folderKey(folder.id)}
    {@const group = `ws-tree-${scope}-${folder.id}`}
    <li role="none" data-drop-group>
      <div
        class="ws-tree-row"
        style:--depth={depth}
        data-active={active}
        use:dropSpring={filled ? springOf(folder.id) : undefined}
      >
        {#if filled}
          <span
            class="ws-tree-toggle"
            aria-hidden="true"
            title={$t(open ? 'collapse_named' : 'expand_named', { values: { name: folder.name } })}
            data-toggle
            data-testid="tree-toggle-{folder.id}"
            onclick={() => {
              focused = rowKey;
              toggle(folder.id);
            }}
          >
            <Icon icon={open ? mdiChevronDown : mdiChevronRight} size="16" aria-hidden={true} />
          </span>
        {:else}
          <span class="ws-tree-toggle" aria-hidden="true"></span>
        {/if}
        <a
          role="treeitem"
          class="ws-tree-link"
          href={folderHref(folder.id)}
          title={folder.name}
          tabindex={rowKey === tabStop ? 0 : -1}
          aria-level={depth + 1}
          aria-expanded={filled ? open : undefined}
          aria-owns={filled && open ? group : undefined}
          aria-selected={active || undefined}
          aria-current={active ? 'page' : undefined}
          data-key={rowKey}
          data-testid="tree-folder-{folder.id}"
        >
          <Icon
            icon={open && filled ? mdiFolderOpenOutline : mdiFolderOutline}
            size="18"
            class="ws-tree-icon"
            aria-hidden={true}
          />
          <span class="ws-tree-name">{folder.name}</span>
        </a>
      </div>
      {#if open && filled}
        <ul id={group} role="group" class="ws-tree-group">
          {@render level(folder.id, depth + 1)}
        </ul>
      {/if}
    </li>
  {/each}
  {#each shown.albums as album (album.id)}
    {@const active = album.id === activeAlbumId}
    {@const rowKey = albumKey(album.id)}
    <li role="none">
      <!-- the right-click menu is a shortcut (the context menu key opens it on a focused row too): the album's own
           menus carry the same item -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="ws-tree-row"
        style:--depth={depth}
        data-active={active}
        data-arrived={album.id === sidebarDrop.arrived ? '' : undefined}
        use:dropTarget={{ kind: 'album', id: album.id, name: album.name, writable: canAdd }}
        oncontextmenu={pinnable ? (event) => showPinMenu(event, album.id) : undefined}
      >
        <span class="ws-tree-toggle" aria-hidden="true"></span>
        <a
          role="treeitem"
          class="ws-tree-link"
          href={albumHref(album.id)}
          title={album.name}
          tabindex={rowKey === tabStop ? 0 : -1}
          aria-level={depth + 1}
          aria-selected={active || undefined}
          aria-current={active ? 'page' : undefined}
          data-key={rowKey}
          data-testid="tree-album-{album.id}"
        >
          <Icon icon={mdiImageAlbum} size="18" flipped class="ws-tree-icon" aria-hidden={true} />
          <span class="ws-tree-name">{album.name}</span>
          {#if album.shared || album.hidden}
            <span class="ws-tree-marks">
              {#if album.hidden}
                <span title={$t('album_not_in_photos')} data-testid="tree-album-hidden-{album.id}">
                  <Icon icon={mdiEyeOffOutline} size="14" class="ws-tree-mark" aria-label={$t('album_not_in_photos')} />
                </span>
              {/if}
              {#if album.shared}
                <Icon icon={mdiShareVariantOutline} size="14" class="ws-tree-mark" aria-label={$t('shared')} />
              {/if}
            </span>
          {/if}
        </a>
      </div>
    </li>
  {/each}
  {#if parentId !== null && (shown.hidden > 0 || shown.less)}
    {@const folderId = parentId}
    {@const rowKey = moreKey(folderId)}
    <!-- a long level the tree opened keeps to the way to what is on screen: the rest wait here, shown in place on a
         press (or under carried photos), and the row then offers less again -->
    <li role="none">
      <div class="ws-tree-row" style:--depth={depth} use:dropSpring={moreSpring(folderId)}>
        <span class="ws-tree-toggle" aria-hidden="true"></span>
        <!-- the tree takes its keys (Enter and Space here), and only the row on screen says it is selected -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_role_has_required_aria_props -->
        <span
          role="treeitem"
          class="ws-tree-link ws-tree-more"
          tabindex={rowKey === tabStop ? 0 : -1}
          aria-level={depth + 1}
          aria-label={shown.less
            ? undefined
            : $t('album_tree_more_label', { values: { count: shown.hidden, name: nameOf.get(folderId) ?? label } })}
          data-key={rowKey}
          data-testid="tree-more-{folderId}"
          onclick={() => (shown.less ? showLess(folderId) : showMore(folderId))}
        >
          {shown.less ? $t('show_less') : $t('album_tree_more', { values: { count: shown.hidden } })}
        </span>
      </div>
    </li>
  {/if}
{/snippet}

<!-- one tab stop: the rows carry the focus (one of them at a time is in the tab order), so the tree itself takes none -->
<ul
  bind:this={tree}
  class="ws-tree"
  role="tree"
  aria-label={label}
  data-testid="album-tree-{scope}"
  onkeydown={onKeydown}
  onfocusin={onFocusin}
>
  {@render level(null, 0)}
</ul>

<style>
  .ws-tree,
  .ws-tree-group {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ws-tree {
    padding-block: 2px 6px;
  }
  /* a row starts under its parent's label, one step further in for each level, on the sidebar's own pill inset */
  .ws-tree-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 2rem;
    margin-inline: 0.75rem;
    padding-inline: calc(1.25rem + var(--depth) * 1rem) 0.5rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
  }
  .ws-tree-row:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  /* what is on screen inverts, like the sidebar's own active row and the Omarchy bar's active workspace */
  .ws-tree-row[data-active='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-tree-toggle {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  /* the chevron answers the pointer; the keyboard opens and closes a folder with the arrows on its row */
  .ws-tree-toggle[data-toggle] {
    cursor: pointer;
  }
  .ws-tree-toggle[data-toggle]:hover {
    color: var(--immich-ui-dark);
  }
  .ws-tree-row[data-active='true'] .ws-tree-toggle {
    color: inherit;
  }
  .ws-tree-link {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding-block: 0.3rem;
    color: inherit;
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ws-tree-link :global(.ws-tree-icon) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-tree-row[data-active='true'] .ws-tree-link :global(.ws-tree-icon) {
    color: inherit;
  }
  .ws-tree-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* a long level's more row: quiet, in data type (a count), its words where its rows' names start */
  .ws-tree-more {
    padding-inline-start: calc(18px + 0.5rem);
    color: var(--immich-ui-muted);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .ws-tree-row:hover .ws-tree-more {
    color: var(--immich-ui-dark);
  }
  .ws-tree-marks {
    display: inline-flex;
    flex: none;
    gap: 0.3rem;
    align-items: center;
    margin-inline-start: auto;
  }
  .ws-tree-link :global(.ws-tree-mark) {
    color: var(--immich-ui-muted);
  }
  .ws-tree-row[data-active='true'] .ws-tree-link :global(.ws-tree-mark) {
    color: inherit;
  }
  .ws-tree-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
    border-radius: var(--ws-radius);
  }
</style>
