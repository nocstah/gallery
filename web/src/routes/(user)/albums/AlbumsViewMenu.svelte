<script lang="ts">
  // Local Omarchy layer: the Albums page's view in one sheet, drawn like the bar's View menu (components/omarchy/
  // BarViewMenu): how the albums are sorted and in which order, how they are grouped (and every group opened or
  // closed at once), covers or a list. Upstream gave each its own control in the bar (a sort menu, a group menu, expand
  // all, collapse all, list), which with the filter, the search and the two New buttons made eleven controls of equal
  // weight. Search, the All/Owned/Shared choice and New album stay in the bar.
  import {
    AlbumGroupBy,
    AlbumSortBy,
    AlbumViewMode,
    albumViewSettings,
    SortOrder,
  } from '$lib/stores/preferences.store';
  import {
    collapseAllAlbumGroups,
    expandAllAlbumGroups,
    findGroupOptionMetadata,
    findSortOptionMetadata,
    getSelectedAlbumGroupOption,
    groupOptionsMetadata,
    sortOptionsMetadata,
  } from '$lib/utils/album-utils';
  import { generateId } from '$lib/utils/generate-id';
  import { tick } from 'svelte';
  import { Icon } from '@immich/ui';
  import { mdiSortVariant, mdiUnfoldLessHorizontal, mdiUnfoldMoreHorizontal } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    /** the groups on the page, for Collapse all */
    albumGroups: string[];
  }

  let { albumGroups }: Props = $props();

  let open = $state(false);
  let box = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  const sheetId = `albums-view-${generateId()}`;

  const sortBy = $derived(findSortOptionMetadata($albumViewSettings.sortBy).id);
  // grouping by year is not offered while the albums are sorted by when they were made or changed
  const groupOff = $derived.by(() => {
    void sortBy;
    return new Set(groupOptionsMetadata.filter((option) => option.isDisabled()).map(({ id }) => id));
  });
  const groupBy = $derived(getSelectedAlbumGroupOption($albumViewSettings));
  const grouped = $derived(groupBy !== AlbumGroupBy.None);

  const sortNames = $derived<Record<AlbumSortBy, string>>({
    [AlbumSortBy.Title]: $t('sort_title'),
    [AlbumSortBy.ItemCount]: $t('sort_items'),
    [AlbumSortBy.DateModified]: $t('sort_modified'),
    [AlbumSortBy.DateCreated]: $t('sort_created'),
    [AlbumSortBy.MostRecentPhoto]: $t('sort_recent'),
    [AlbumSortBy.OldestPhoto]: $t('sort_oldest'),
  });
  const groupNames = $derived<Record<AlbumGroupBy, string>>({
    [AlbumGroupBy.None]: $t('albums_group_none'),
    [AlbumGroupBy.Year]: $t('year'),
    [AlbumGroupBy.Owner]: $t('owner'),
  });

  // the two orders in words that fit what is sorted, the natural one first: names A to Z, the fullest albums first, dates
  // newest first
  type Orders = [{ order: SortOrder; label: string }, { order: SortOrder; label: string }];
  const ordersFor = (kind: 'name' | 'count' | 'date'): Orders => {
    switch (kind) {
      case 'name': {
        return [
          { order: SortOrder.Asc, label: $t('albums_order_a_z') },
          { order: SortOrder.Desc, label: $t('albums_order_z_a') },
        ];
      }
      case 'count': {
        return [
          { order: SortOrder.Desc, label: $t('albums_order_largest') },
          { order: SortOrder.Asc, label: $t('albums_order_smallest') },
        ];
      }
      case 'date': {
        return [
          { order: SortOrder.Desc, label: $t('newest_first') },
          { order: SortOrder.Asc, label: $t('oldest_first') },
        ];
      }
    }
  };
  const sortOrders = $derived(
    ordersFor(sortBy === AlbumSortBy.Title ? 'name' : sortBy === AlbumSortBy.ItemCount ? 'count' : 'date'),
  );
  const groupOrders = $derived(ordersFor(groupBy === AlbumGroupBy.Owner ? 'name' : 'date'));

  const setSort = (id: AlbumSortBy) => {
    if (id !== sortBy) {
      $albumViewSettings.sortBy = id;
      $albumViewSettings.sortOrder = findSortOptionMetadata(id).defaultOrder;
    }
  };
  const setGroup = (id: AlbumGroupBy) => {
    if (id !== groupBy) {
      $albumViewSettings.groupBy = id;
      $albumViewSettings.groupOrder = findGroupOptionMetadata(id).defaultOrder;
    }
  };

  // under its button, its end on the button's end, moved in to stay 8px inside the window (a phone's button sits
  // mid-bar, and the sheet is wider than the room on its left)
  let sheet = $state<HTMLElement>();
  let shift = $state(0);
  const place = async () => {
    shift = 0;
    await tick();
    const rect = sheet?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const margin = 8;
    if (rect.left < margin) {
      shift = margin - rect.left;
    } else if (rect.right > innerWidth - margin) {
      shift = innerWidth - margin - rect.right;
    }
  };
  const toggle = () => {
    open = !open;
    if (open) {
      void place();
    }
  };
  // a press outside closes it; Escape closes it and gives the focus back to its button
  const onPointerdown = (event: PointerEvent) => {
    if (open && !box?.contains(event.target as Node)) {
      open = false;
    }
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      button?.focus();
    }
  };
</script>

<svelte:window onpointerdown={onPointerdown} onresize={() => open && void place()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ws-albums-view" bind:this={box} onkeydown={onKeydown}>
  <button
    type="button"
    class="ws-albums-view-button"
    title={$t('albums_view_hint')}
    aria-haspopup="true"
    aria-expanded={open}
    aria-controls={sheetId}
    data-testid="albums-view"
    bind:this={button}
    onclick={toggle}
  >
    <Icon icon={mdiSortVariant} size="18" aria-hidden={true} />
    <span class="hidden md:inline">{$t('albums_view')}</span>
  </button>

  {#if open}
    <!-- its controls are the button's: the bar counts the button, not them, as it fits itself, and leaves them their
         own look when it tightens or folds the page's buttons (utils/page-bar-fit, layouts/UserPageLayout) -->
    <div
      id={sheetId}
      class="ws-albums-view-sheet absolute"
      style:translate="{shift}px 0"
      bind:this={sheet}
      role="group"
      aria-label={$t('albums_view_hint')}
      data-bar-sheet
    >
      <p class="ws-albums-view-head" id="{sheetId}-sort">{$t('albums_sort_by')}</p>
      <div class="ws-albums-view-list" role="group" aria-labelledby="{sheetId}-sort">
        {#each sortOptionsMetadata as { id } (id)}
          <button type="button" aria-pressed={id === sortBy} onclick={() => setSort(id)}>{sortNames[id]}</button>
        {/each}
      </div>
      <div class="ws-seg" role="group" aria-label={$t('albums_sort_order')}>
        {#each sortOrders as { order, label } (order)}
          <button
            type="button"
            aria-pressed={$albumViewSettings.sortOrder === order}
            onclick={() => ($albumViewSettings.sortOrder = order)}
          >
            {label}
          </button>
        {/each}
      </div>

      <hr />
      <p class="ws-albums-view-head" id="{sheetId}-group">{$t('albums_group_by')}</p>
      <div class="ws-seg" role="group" aria-labelledby="{sheetId}-group">
        {#each groupOptionsMetadata as option (option.id)}
          <button
            type="button"
            aria-pressed={option.id === groupBy}
            disabled={groupOff.has(option.id)}
            onclick={() => setGroup(option.id)}
          >
            {groupNames[option.id]}
          </button>
        {/each}
      </div>
      {#if grouped}
        <div class="ws-seg" role="group" aria-label={$t('albums_group_order')}>
          {#each groupOrders as { order, label } (order)}
            <button
              type="button"
              aria-pressed={$albumViewSettings.groupOrder === order}
              onclick={() => ($albumViewSettings.groupOrder = order)}
            >
              {label}
            </button>
          {/each}
        </div>
        <div class="ws-albums-view-pair">
          <button type="button" class="ws-albums-view-row" onclick={() => expandAllAlbumGroups()}>
            <Icon icon={mdiUnfoldMoreHorizontal} size="16" aria-hidden={true} />
            {$t('expand_all')}
          </button>
          <button type="button" class="ws-albums-view-row" onclick={() => collapseAllAlbumGroups(albumGroups)}>
            <Icon icon={mdiUnfoldLessHorizontal} size="16" aria-hidden={true} />
            {$t('collapse_all')}
          </button>
        </div>
      {/if}

      <hr />
      <div class="ws-seg" role="group" aria-label={$t('albums_show_as')}>
        <button
          type="button"
          aria-pressed={$albumViewSettings.view !== AlbumViewMode.List}
          onclick={() => ($albumViewSettings.view = AlbumViewMode.Cover)}
        >
          {$t('covers')}
        </button>
        <button
          type="button"
          aria-pressed={$albumViewSettings.view === AlbumViewMode.List}
          onclick={() => ($albumViewSettings.view = AlbumViewMode.List)}
        >
          {$t('list')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .ws-albums-view {
    position: relative;
  }
  /* a quiet button as the page's others (its label goes with theirs when the bar tightens) */
  .ws-albums-view-button {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    height: 2rem;
    padding-inline: 0.6rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ws-albums-view-button:hover,
  .ws-albums-view-button[aria-expanded='true'] {
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-albums-view-button:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* the View menu's sheet: one frame on the ground, the theme's corners, the popup shadow, rows edge to edge */
  .ws-albums-view-sheet {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 60;
    display: grid;
    gap: 4px;
    width: max-content;
    min-width: 16.5rem;
    max-width: min(24rem, calc(100vw - 1rem));
    padding: 6px;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
    text-align: start;
  }
  .ws-albums-view-sheet hr {
    margin: 4px -6px;
    border-color: var(--ws-hairline);
  }
  .ws-albums-view-head {
    padding: 0.2rem 0.55rem 0;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  /* the sorts as rows, the one in use inverted, as the sidebar marks the page on screen */
  .ws-albums-view-list {
    display: grid;
    gap: 2px;
  }
  .ws-albums-view-list button,
  .ws-albums-view-row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    min-height: 2rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    text-align: start;
  }
  .ws-albums-view-list button:hover,
  .ws-albums-view-row:hover {
    background: color-mix(in oklab, var(--ws-accent) 16%, transparent);
  }
  .ws-albums-view-list button[aria-pressed='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  /* the layer's segmented control (.ws-seg) across the sheet, its options sharing the width */
  .ws-albums-view-sheet :global(.ws-seg) {
    display: flex;
    margin: 0;
  }
  .ws-albums-view-sheet :global(.ws-seg > button) {
    flex: 1;
    padding-inline: 0.4rem;
    font-size: var(--ws-text-meta);
    text-wrap: balance;
  }
  .ws-albums-view-sheet :global(.ws-seg > button:disabled) {
    opacity: 0.45;
    pointer-events: none;
  }
  .ws-albums-view-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
  }
  .ws-albums-view-list button:focus-visible,
  .ws-albums-view-row:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
</style>
