<script lang="ts" module>
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
</script>

<script lang="ts">
  // Local Omarchy layer: albums in their folders as a tree, the way the Mac's Photos sidebar shows them ("should be
  // like mac with tree structure thats collapsable.. expandable"). A folder opens and closes on its chevron and opens
  // its page on its name; the folders a person opened are remembered per tree; the folder or album on screen is lit
  // and the folders above it open so it can be seen, for as long as it is on screen. Photos carried over the tree go
  // into an album row, and a folder row springs open under them (managers/sidebar-drop); an album a drop just made
  // lights for a moment.
  import { dropSpring, dropTarget, sidebarDrop } from '$lib/managers/sidebar-drop.svelte';
  import { albumTreeOpen } from '$lib/stores/preferences.store';
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
  import { SvelteSet } from 'svelte/reactivity';
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
    }
    albumTreeOpen.update((open) => ({ ...open, [key(folderId)]: value }));
  };
  const toggle = (folderId: string) => setOpen(folderId, !isOpen(folderId));

  // a folder springs open under carried photos, and closes again when they go elsewhere
  const springOf = (folderId: string) => ({
    isOpen: () => revealed.has(key(folderId)) || !!get(albumTreeOpen)[key(folderId)],
    open: () => setOpen(folderId, true),
    close: () => setOpen(folderId, false),
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
  let revealedFor: string | undefined;
  $effect(() => {
    const album = activeAlbumId ? albums.find(({ id }) => id === activeAlbumId) : undefined;
    const chain: string[] = [];
    let folderId = activeFolderId ? parentOf.get(activeFolderId) : placed(album?.folderId);
    while (folderId && chain.length < 32) {
      chain.push(key(folderId));
      folderId = parentOf.get(folderId) ?? null;
    }
    // revealed once per arrival and chain: the albums and folders loading in later find the chain, and loading again
    // with nothing changed leaves a folder closed by hand closed
    const reveal = `${onScreen}|${chain.join('/')}`;
    untrack(() => {
      if (reveal === revealedFor) {
        return;
      }
      revealedFor = reveal;
      revealed.clear();
      for (const k of chain) {
        revealed.add(k);
      }
    });
  });
</script>

{#snippet level(parentId: string | null, depth: number)}
  {#each foldersIn[parentId ?? ''] ?? [] as folder (folder.id)}
    {@const open = isOpen(folder.id)}
    {@const filled = (foldersIn[folder.id]?.length ?? 0) + (albumsIn[folder.id]?.length ?? 0) > 0}
    {@const active = folder.id === activeFolderId}
    <li data-drop-group>
      <div
        class="ws-tree-row"
        style:--depth={depth}
        data-active={active}
        use:dropSpring={filled ? springOf(folder.id) : undefined}
      >
        {#if filled}
          <button
            type="button"
            class="ws-tree-toggle"
            aria-expanded={open}
            aria-controls="ws-tree-{scope}-{folder.id}"
            aria-label={$t(open ? 'collapse_named' : 'expand_named', { values: { name: folder.name } })}
            onclick={() => toggle(folder.id)}
          >
            <Icon icon={open ? mdiChevronDown : mdiChevronRight} size="16" aria-hidden={true} />
          </button>
        {:else}
          <span class="ws-tree-toggle" aria-hidden="true"></span>
        {/if}
        <a
          class="ws-tree-link"
          href={folderHref(folder.id)}
          title={folder.name}
          aria-current={active ? 'page' : undefined}
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
        <ul id="ws-tree-{scope}-{folder.id}" class="ws-tree-group">
          {@render level(folder.id, depth + 1)}
        </ul>
      {/if}
    </li>
  {/each}
  {#each albumsIn[parentId ?? ''] ?? [] as album (album.id)}
    {@const active = album.id === activeAlbumId}
    <li>
      <!-- the right-click menu is a shortcut: the album's own menus carry the same item for the keyboard -->
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
          class="ws-tree-link"
          href={albumHref(album.id)}
          title={album.name}
          aria-current={active ? 'page' : undefined}
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
{/snippet}

<ul bind:this={tree} class="ws-tree" aria-label={label} data-testid="album-tree-{scope}">
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
  button.ws-tree-toggle:hover {
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
  .ws-tree-toggle:focus-visible,
  .ws-tree-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
    border-radius: var(--ws-radius);
  }
</style>
