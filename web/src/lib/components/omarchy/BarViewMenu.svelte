<script lang="ts">
  // Local Omarchy layer: the one bar's view menu. What you set now and then, not every minute, lives here instead of
  // in the bar: the order (on a page that can be sorted), and for photo grids the thumbnail size, day labels,
  // expanded stacks and the compact grid; then the theme (following Omarchy, the default, or held light or dark),
  // rounded corners, the inspector window and Cast (when a cast target is around). Ctrl+wheel and + - 0 still resize
  // the thumbnails directly.
  import { page } from '$app/state';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { inspectorFeed } from '$lib/managers/inspector-link.svelte';
  import { thumbnailZoomManager, ZOOM_MAX, ZOOM_MIN } from '$lib/managers/thumbnail-zoom-manager.svelte';
  import { getGlobalActions } from '$lib/services/app.service';
  import { corners } from '$lib/theme/corners.svelte';
  import { FOLLOW_OMARCHY, galleryThemes } from '$lib/theme/theme-manager.svelte';
  import { getSearchablePageState } from '$lib/utils/searchable-page-search';
  import { Icon, ThemePreference, themeManager } from '@immich/ui';
  import { mdiCast, mdiEyeSettingsOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  let open = $state(false);
  let box = $state<HTMLElement>();
  let hasGrid = $state(false);

  const searchable = $derived(getSearchablePageState(page.url));
  const order = $derived(searchable.sortOrder === 'asc' ? 'asc' : 'desc');
  const { Cast } = $derived(getGlobalActions($t));
  const canCast = $derived(Cast.$if?.() ?? true);
  const canInspect = $derived(authManager.authenticated && !authManager.isSharedLink);
  // the default: Omarchy's palette in the desktop's light or dark; Light or Dark hold that face whatever the desktop does
  const followsOmarchy = $derived(
    galleryThemes.current === FOLLOW_OMARCHY && themeManager.preference === ThemePreference.System,
  );

  const toggle = () => {
    hasGrid = document.querySelector('#asset-grid') !== null;
    // an inspector not heard from lately is gone, so the switch says what is there
    inspectorFeed.refresh();
    open = !open;
  };

  const close = (event: Event) => {
    if (!open) {
      return;
    }
    if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box?.contains(event.target as Node)) {
      open = false;
    }
  };

  const setOrder = (mode: 'asc' | 'desc') => {
    if (mode !== order) {
      void globalSearchManager.applySearchSort(mode, searchable.query);
    }
  };

  const toggles = $derived([
    {
      label: $t('day_labels'),
      on: thumbnailZoomManager.dayLabels,
      set: (v: boolean) => (thumbnailZoomManager.dayLabels = v),
    },
    {
      label: $t('expand_stacks'),
      on: thumbnailZoomManager.expandStacks,
      set: (v: boolean) => (thumbnailZoomManager.expandStacks = v),
    },
    {
      label: $t('compact_view'),
      on: thumbnailZoomManager.compact,
      set: (v: boolean) => (thumbnailZoomManager.compact = v),
    },
  ]);
</script>

<svelte:window onpointerdown={close} onkeyup={close} />

<div class="ws-view" bind:this={box}>
  <button
    type="button"
    class="ws-bar-icon"
    aria-label={$t('display_options')}
    title={$t('display_options')}
    aria-expanded={open}
    onclick={toggle}
  >
    <Icon icon={mdiEyeSettingsOutline} size="20" />
  </button>

  {#if open}
    <div class="ws-view-sheet" role="group" aria-label={$t('display_options')}>
      {#if searchable.isSearchable}
        <div class="ws-view-seg" role="radiogroup" aria-label={$t('display_options')}>
          <button type="button" role="radio" aria-checked={order === 'desc'} onclick={() => setOrder('desc')}>
            {$t('newest_first')}
          </button>
          <button type="button" role="radio" aria-checked={order === 'asc'} onclick={() => setOrder('asc')}>
            {$t('oldest_first')}
          </button>
        </div>
      {/if}

      {#if hasGrid}
        <label class="ws-view-row ws-view-size">
          <span>{$t('thumbnail_size')}</span>
          <!-- one way: the slider shows the size and sets it only when moved (never writes back on its own) -->
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.01"
            value={thumbnailZoomManager.scale}
            oninput={(event) => (thumbnailZoomManager.scale = Number(event.currentTarget.value))}
          />
        </label>
        {#each toggles as item (item.label)}
          <button
            type="button"
            class="ws-view-row"
            role="switch"
            aria-checked={item.on}
            onclick={() => item.set(!item.on)}
          >
            <span>{item.label}</span>
            <span class="ws-view-switch" aria-hidden="true"></span>
          </button>
        {/each}
      {/if}

      <hr />
      <div class="ws-view-seg ws-view-theme" role="radiogroup" aria-label={$t('theme')}>
        <button
          type="button"
          role="radio"
          aria-checked={followsOmarchy}
          onclick={() => galleryThemes.choose(FOLLOW_OMARCHY)}
        >
          {$t('theme_follow_omarchy')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!followsOmarchy && themeManager.preference === ThemePreference.Light}
          onclick={() => themeManager.setPreference(ThemePreference.Light)}
        >
          {$t('light')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!followsOmarchy && themeManager.preference === ThemePreference.Dark}
          onclick={() => themeManager.setPreference(ThemePreference.Dark)}
        >
          {$t('dark')}
        </button>
      </div>
      <button
        type="button"
        class="ws-view-row"
        role="switch"
        aria-checked={corners.rounded}
        onclick={() => corners.set(!corners.rounded)}
      >
        <span>{$t('rounded_corners')}</span>
        <span class="ws-view-switch" aria-hidden="true"></span>
      </button>
      <!-- the inspector, a window of its own for a second screen (managers/inspector-link), for a signed-in account;
           like Cast it opens something else, so the menu closes behind it -->
      {#if canInspect}
        <button
          type="button"
          class="ws-view-row"
          role="switch"
          aria-checked={inspectorFeed.listening}
          aria-keyshortcuts="Shift+I"
          onclick={() => {
            open = false;
            inspectorFeed.toggle();
          }}
        >
          <span>{$t('inspector_window')}</span>
          <span class="ws-view-end">
            <kbd class="ws-view-key" aria-hidden="true">⇧I</kbd>
            <span class="ws-view-switch" aria-hidden="true"></span>
          </span>
        </button>
      {/if}
      {#if canCast}
        <button
          type="button"
          class="ws-view-row"
          onclick={(event) => {
            open = false;
            Cast.onAction?.({ action: Cast, event });
          }}
        >
          <span>{$t('cast')}</span>
          <Icon icon={mdiCast} size="16" />
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ws-view {
    position: relative;
  }
  /* a sheet under the icon: one frame, the theme's corners, rows edge to edge */
  .ws-view-sheet {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 60;
    display: grid;
    gap: 2px;
    width: 16.5rem;
    padding: 6px;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
  }
  .ws-view-sheet hr {
    margin: 4px -6px;
    border-color: var(--ws-hairline);
  }
  .ws-view-seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    margin-bottom: 4px;
    padding: 2px;
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    border-radius: var(--ws-radius);
  }
  /* the default's name keeps its one line; Light and Dark share the rest */
  .ws-view-theme {
    grid-template-columns: max-content 1fr 1fr;
    margin-block: 2px 0;
  }
  .ws-view-theme button {
    white-space: nowrap;
  }
  .ws-view-seg button {
    padding: 0.35rem 0.5rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    font-weight: 600;
  }
  .ws-view-seg button[aria-checked='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-view-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    min-height: 2.1rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    text-align: start;
  }
  button.ws-view-row:hover {
    background: color-mix(in oklab, var(--ws-accent) 16%, transparent);
  }
  .ws-view-row:focus-visible,
  .ws-view-seg button:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-view-size input {
    width: 7.5rem;
    accent-color: var(--immich-ui-dark);
    cursor: pointer;
  }
  /* a switch drawn square: the track, and its knob that crosses on */
  .ws-view-switch {
    position: relative;
    flex: none;
    width: 1.9rem;
    height: 1.05rem;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 30%, transparent);
    border-radius: var(--ws-radius);
    transition:
      background-color 140ms,
      border-color 140ms;
  }
  .ws-view-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(1.05rem - 6px);
    height: calc(1.05rem - 6px);
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 55%, transparent);
    transition:
      translate 160ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 140ms;
  }
  [aria-checked='true'] > .ws-view-switch,
  [aria-checked='true'] > .ws-view-end > .ws-view-switch {
    border-color: var(--ws-accent);
    background: color-mix(in oklab, var(--ws-accent) 22%, transparent);
  }
  [aria-checked='true'] > .ws-view-switch::after,
  [aria-checked='true'] > .ws-view-end > .ws-view-switch::after {
    translate: calc(1.9rem - 1.05rem) 0;
    background: var(--ws-accent);
  }
  /* a row's key, in data type before its switch */
  .ws-view-end {
    display: inline-flex;
    gap: 0.6rem;
    align-items: center;
  }
  .ws-view-key {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    color: var(--immich-ui-muted);
  }
</style>
