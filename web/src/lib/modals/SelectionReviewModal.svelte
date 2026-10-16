<script lang="ts">
  // Local Omarchy layer: Show selected (step 2 of albums Mac-style; the owner: "easy album management"). The selection
  // bar's count opens the selected photos alone, in the grid's own tiles, to look them over before acting on them: a
  // click takes a photo out of the selection (its check goes off and it fades) and a second click puts it back, and the
  // page's selection follows each click at once. The selection's main actions on that page (AssetSelectControlBar's
  // reviewActions: Share, New album, Add to album or space) sit at the foot beside Done, with their keys (L, N); Escape
  // and a click beside the sheet close it too, and focus goes back to the count. Only the rows in view are drawn
  // (utils/review-grid), so a selection of thousands opens as fast as one of ten.
  import { matchesShortcut, type Shortcut } from '$lib/actions/shortcut';
  import {
    assetMultiSelectManager,
    type AssetMultiSelectManager,
  } from '$lib/managers/asset-multi-select-manager.svelte';
  import { getAssetMediaUrl, isEnabled } from '$lib/utils';
  import { moveCaret, pxOf, reviewGrid, tilePosition, visibleRange } from '$lib/utils/review-grid';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { AssetMediaSize } from '@immich/sdk';
  import { Icon, Modal, ModalBody, ModalFooter, type ActionEvent, type ActionItem } from '@immich/ui';
  import { mdiCheckboxBlankCircleOutline, mdiCheckCircle, mdiPlayCircleOutline } from '@mdi/js';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    /**
     * With the action chosen at its foot, for the caller to run once the sheet is gone (a modal the action opens must
     * not share the screen with this one); without, when it was simply closed.
     */
    onClose: (chosen?: ActionEvent) => void;
    /** the selection's main actions on the page, made from the selection as it is when asked */
    actions?: () => ActionItem[];
    selection?: AssetMultiSelectManager;
  }

  let { onClose, actions = () => [], selection = assetMultiSelectManager }: Props = $props();

  // the photos as they were selected when it opened: one taken out stays here, faded, to be put back
  // svelte-ignore state_referenced_locally
  const items = selection.assets.slice();

  let width = $state(0);
  let height = $state(0);
  let scrollTop = $state(0);
  // the keyboard's caret: the tile that takes the focus (roving tabindex)
  let active = $state(0);
  let gap = $state(10);
  let scroller = $state<HTMLElement>();

  // square tiles on the desktop's gap: about six to a row on a wide sheet, three on a phone (a size until the sheet is
  // measured, so a test without layout still draws a screenful)
  const grid = $derived.by(() => {
    const room = width || 720;
    return reviewGrid(room, items.length, { min: Math.min(168, Math.max(96, room / 6.5)), gap });
  });
  const viewport = $derived(height || 480);
  const range = $derived(visibleRange(grid, items.length, scrollTop, viewport));
  const drawn = $derived.by(() => {
    const indices: number[] = [];
    for (let index = range.start; index < range.end; index++) {
      indices.push(index);
    }
    // the caret's tile stays drawn while it is scrolled out of view, so the focus never goes with it
    if (items.length > 0 && (active < range.start || active >= range.end)) {
      indices.push(active);
    }
    return indices;
  });
  const pageRows = $derived(Math.max(1, Math.floor(viewport / (grid.tile + grid.gap)) - 1));

  const count = $derived(selection.assets.length);
  const leftOut = $derived(Math.max(0, items.length - count));
  const offered = $derived(count > 0 ? actions().filter((action) => isEnabled(action)) : []);

  const tileId = (index: number) => `ws-review-${items[index].id}`;
  const thumbnail = (index: number) =>
    getAssetMediaUrl({ id: items[index].id, size: AssetMediaSize.Thumbnail, cacheKey: items[index].thumbhash });

  /** In or out of the selection; the page's own selection, so its tiles and its count follow at once. */
  const toggle = (index: number) => {
    active = index;
    const asset = items[index];
    if (selection.hasSelectedAsset(asset.id)) {
      selection.removeAssetFromMultiselectGroup(asset.id);
      // not every photo of the page any more: the bar's Select all offers itself again
      selection.selectAll = false;
    } else {
      selection.selectAsset(asset);
    }
  };

  const putBack = () => {
    selection.selectAssets(items.filter((asset) => !selection.hasSelectedAsset(asset.id)));
  };

  const focusTile = async (index: number) => {
    active = index;
    await tick();
    const tile = document.querySelector<HTMLElement>(`#${tileId(index)}`);
    tile?.focus({ preventScroll: true });
    tile?.scrollIntoView({ block: 'nearest' });
  };

  const onGridKeydown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || items.length === 0) {
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle(active);
      return;
    }
    // Delete only ever leaves a photo out here: the page's Delete (trash the selection) is not this sheet's
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (selection.hasSelectedAsset(items[active].id)) {
        toggle(active);
      }
      return;
    }
    const next = moveCaret(active, event.key, { columns: grid.columns, count: items.length, pageRows });
    if (next !== undefined) {
      event.preventDefault();
      void focusTile(next);
    }
  };

  /** An action closes the sheet, to run on the selection as it now is. */
  const run = (action: ActionItem, event: Event) => onClose({ action, event });

  // the actions' keys (L, N) work here too, as on the page behind
  const shortcutsOf = (action: ActionItem): Shortcut[] =>
    Array.isArray(action.shortcuts) ? action.shortcuts : action.shortcuts ? [action.shortcuts] : [];
  const onDocumentKeydown = (event: KeyboardEvent) => {
    const dialog = scroller?.closest('[role="dialog"]');
    if (event.defaultPrevented || !dialog?.contains(event.target as Node)) {
      return;
    }
    const action = offered.find((candidate) => shortcutsOf(candidate).some((key) => matchesShortcut(event, key)));
    if (action) {
      event.preventDefault();
      run(action, event);
    }
  };

  const onOpenAutoFocus = (event: Event) => {
    event.preventDefault();
    gap = pxOf(getComputedStyle(document.documentElement).getPropertyValue('--ws-gap'), 10);
    if (items.length > 0) {
      void focusTile(0);
    }
  };
</script>

<svelte:document onkeydown={onDocumentKeydown} />

<Modal
  title={$t('selected_count', { values: { count } })}
  size="giant"
  closeOnBackdropClick
  onClose={() => onClose()}
  {onOpenAutoFocus}
>
  <ModalBody class="ws-review-body overflow-hidden py-3">
    <div
      class="ws-review-scroll"
      bind:this={scroller}
      bind:clientWidth={width}
      bind:clientHeight={height}
      onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
    >
      <div
        class="ws-review-grid"
        role="listbox"
        aria-multiselectable="true"
        aria-label={$t('selected')}
        tabindex="-1"
        style:height="{grid.height}px"
        onkeydown={onGridKeydown}
      >
        {#each drawn as index (items[index].id)}
          {@const asset = items[index]}
          {@const kept = selection.hasSelectedAsset(asset.id)}
          {@const at = tilePosition(grid, index)}
          <!-- the listbox takes the keys (Space, Enter, the arrows) for the option that has the focus -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            id={tileId(index)}
            class="ws-review-tile"
            role="option"
            aria-selected={kept}
            aria-posinset={index + 1}
            aria-setsize={items.length}
            aria-label={$getAltText(asset)}
            tabindex={index === active ? 0 : -1}
            style:width="{grid.tile}px"
            style:height="{grid.tile}px"
            style:transform="translate({at.x}px, {at.y}px)"
            onclick={() => toggle(index)}
          >
            <img src={thumbnail(index)} alt="" loading="lazy" decoding="async" draggable="false" />
            <span class={['ws-review-check', { 'ws-review-check-on': kept }]} aria-hidden="true">
              <Icon icon={kept ? mdiCheckCircle : mdiCheckboxBlankCircleOutline} size="24" />
            </span>
            {#if asset.isVideo}
              <span class="ws-review-video" aria-hidden="true"><Icon icon={mdiPlayCircleOutline} size="20" /></span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </ModalBody>
  <ModalFooter>
    <div class="ws-review-foot">
      <p class="ws-review-status" aria-live="polite">
        {#if leftOut > 0}
          <span class="ws-review-count">{$t('selection_review_left_out', { values: { count: leftOut } })}</span>
          <button type="button" class="ws-review-put-back" onclick={putBack}>
            {$t('selection_review_put_back', { values: { count: leftOut } })}
          </button>
        {:else}
          {$t('selection_review_hint')}
        {/if}
      </p>
      <div class="ws-review-actions">
        {#each offered as action (action.title)}
          <button
            type="button"
            class="ws-review-action"
            title={action.title}
            aria-label={action.title}
            onclick={(event) => run(action, event)}
          >
            {#if action.icon}<Icon icon={action.icon} size="18" aria-hidden="true" />{/if}
            <span class="ws-review-action-label">{action.title}</span>
          </button>
        {/each}
        <button type="button" class="ws-review-done" onclick={() => onClose()}>{$t('done')}</button>
      </div>
    </div>
  </ModalFooter>
</Modal>

<style>
  /* the grid scrolls inside the sheet: as tall as its rows up to most of the window, all of a phone's */
  .ws-review-scroll {
    position: relative;
    max-height: min(64vh, 46rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  /* the layer frames a listbox as a floating popup (omarchy-world.css); this one lies flat in the sheet */
  .ws-review-grid {
    position: relative;
    border: 0;
    box-shadow: none;
  }
  .ws-review-grid:focus {
    outline: none;
  }
  @media (max-width: 639px) {
    :global(.ws-review-body) {
      display: flex;
      flex-direction: column;
    }
    .ws-review-scroll {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
    }
  }

  /* a tile in the grid's own language: the window radius, a hairline inside it, the accent for focus and hover, the
     ink frame of a selected photo with its ink check on a surface disc; a photo left out loses both and fades */
  .ws-review-tile {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    border-radius: var(--tile-radius, var(--ws-radius));
    clip-path: inset(0 round var(--tile-radius, var(--ws-radius)));
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    cursor: pointer;
  }
  .ws-review-tile:focus {
    outline: none;
  }
  .ws-review-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition:
      opacity 140ms cubic-bezier(0.22, 1, 0.36, 1),
      filter 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-review-tile::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
    transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-review-tile[aria-selected='true']::after {
    box-shadow:
      inset 0 0 0 calc(var(--ws-border) + 2px) var(--immich-ui-dark),
      inset 0 0 0 calc(var(--ws-border) + 3px) var(--immich-ui-light);
  }
  .ws-review-tile:is(:hover, :focus-visible)::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-review-tile[aria-selected='true']:is(:hover, :focus-visible)::after {
    box-shadow:
      inset 0 0 0 var(--ws-border) var(--ws-accent),
      inset 0 0 0 calc(var(--ws-border) + 2px) var(--immich-ui-dark),
      inset 0 0 0 calc(var(--ws-border) + 3px) var(--immich-ui-light);
  }
  .ws-review-tile[aria-selected='false'] img {
    opacity: 0.35;
    filter: grayscale(1);
  }
  .ws-review-check {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 1;
    display: grid;
    place-items: center;
    border-radius: 9999px;
    color: #fff;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.55));
  }
  .ws-review-check-on {
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    filter: none;
  }
  .ws-review-video {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 1;
    color: #fff;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.55));
  }

  /* the foot: what was left out (or how it works) on the left, the selection's actions and Done on the right */
  .ws-review-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.25rem;
    width: 100%;
  }
  .ws-review-status {
    display: flex;
    flex: 1 1 14rem;
    align-items: baseline;
    gap: 0.6rem;
    min-width: 0;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
  }
  .ws-review-count {
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ws-review-put-back {
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-color: var(--ws-hairline);
  }
  .ws-review-put-back:hover {
    text-decoration-color: var(--ws-accent);
  }
  .ws-review-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-inline-start: auto;
  }
  .ws-review-action,
  .ws-review-done {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.8rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    transition: background-color 120ms;
  }
  .ws-review-action {
    border: 1px solid var(--ws-hairline);
    color: var(--immich-ui-dark);
  }
  .ws-review-action:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-review-done {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-review-done:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 85%, var(--ws-accent));
  }
  :is(.ws-review-action, .ws-review-done, .ws-review-put-back):focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* a phone keeps the actions' icons (their names stay theirs: aria-label and tooltip) */
  @media (max-width: 639px) {
    .ws-review-action-label {
      display: none;
    }
    .ws-review-action {
      padding-inline: 0.6rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-review-tile img,
    .ws-review-tile::after {
      transition: none;
    }
  }
</style>
