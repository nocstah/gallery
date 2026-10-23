<script lang="ts">
  // Local Omarchy layer: search in the one bar is an icon until you want it. Clicking it opens the search field in
  // place, growing leftwards over the middle of the bar, with the results dropping below as before; it folds back to
  // the icon once the search is closed and the field left. Ctrl+K still opens the full search window.
  import GlobalSearch from '$lib/components/global-search/global-search.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { Icon } from '@immich/ui';
  import { mdiMagnify } from '@mdi/js';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';

  let open = $state(false);
  let box = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();

  const expand = async () => {
    open = true;
    await tick();
    box?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const fold = (refocus = false) => {
    open = false;
    if (refocus) {
      void tick().then(() => trigger?.focus());
    }
  };

  // the field stays while the search is open or still holds focus; it folds once both are gone
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && box?.contains(next)) {
      return;
    }
    setTimeout(() => {
      if (!globalSearchManager.isOpen && !box?.contains(document.activeElement)) {
        fold();
      }
    }, 0);
  };

  // Escape with nothing left to close (the search's own Escape clears, then closes) folds the field
  const onKeyUp = (event: KeyboardEvent) => {
    if (box?.contains(event.target as Node) && event.key === 'Escape' && !globalSearchManager.isOpen) {
      fold(true);
    }
  };
</script>

<svelte:window onkeyup={onKeyUp} />

<div role="search" class="ws-bar-search" data-open={open ? '' : undefined} bind:this={box} onfocusout={onFocusOut}>
  {#if open}
    <div class="ws-bar-search-field">
      <GlobalSearch manager={globalSearchManager} variant="dropdown" />
    </div>
  {:else}
    <button
      type="button"
      class="ws-bar-icon"
      bind:this={trigger}
      aria-label={$t('search')}
      title={$t('search')}
      onclick={expand}
    >
      <Icon icon={mdiMagnify} size="20" />
    </button>
  {/if}
</div>

<style>
  .ws-bar-search {
    position: relative;
    display: flex;
    align-items: center;
    height: 2.25rem;
    min-width: 2.25rem;
  }
  /* open: the field lies over the bar's middle, anchored at the icon's right edge */
  .ws-bar-search-field {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 30;
    display: flex;
    width: min(38rem, 52vw);
    translate: 0 -50%;
    transition:
      width 240ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms;
  }
  @starting-style {
    .ws-bar-search-field {
      width: 2.25rem;
      opacity: 0.4;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-bar-search-field {
      transition: none;
    }
  }
  /* the stock field, squared to the desktop and set on the bar's ground */
  .ws-bar-search-field :global([data-testid='cmdk-input-trigger']) {
    height: 2.5rem;
    border-radius: var(--ws-radius);
    border-color: color-mix(in oklab, var(--immich-ui-dark) 18%, transparent);
    background: var(--immich-ui-light);
    box-shadow: 0 8px 24px -10px rgb(0 0 0 / 0.45);
  }
  .ws-bar-search-field :global([data-testid='cmdk-input-trigger'] > span:first-child),
  .ws-bar-search-field :global([data-testid='cmdk-input-trigger'] kbd) {
    border-radius: var(--ws-radius);
  }
  .ws-bar-search-field :global(.top-full) {
    border-radius: var(--ws-radius);
  }
</style>
