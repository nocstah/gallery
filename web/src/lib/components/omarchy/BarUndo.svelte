<script lang="ts">
  // Local Omarchy layer: the one bar's undo. Everything that can still be taken back (managers/undo-manager), newest
  // first, in a sheet under the icon: a row takes its action back. The icon shows only while there is something to
  // undo (one less icon in the bar the rest of the time). Ctrl+Z belongs to the user pages' layout, so it also works on
  // pages without this bar (an album).
  import { undoManager } from '$lib/managers/undo-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { relativeTime } from '$lib/utils/relative-time';
  import { Icon } from '@immich/ui';
  import { mdiUndoVariant } from '@mdi/js';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fade } from 'svelte/transition';

  let open = $state(false);
  let box = $state<HTMLElement>();
  let now = $state(Date.now());

  const entries = $derived(undoManager.entries);
  const newest = $derived(entries[0]);

  $effect(() => {
    if (entries.length === 0) {
      open = false;
    }
  });

  // the times read "now", "3m ago"... and move on while the sheet is open
  $effect(() => {
    if (!open) {
      return;
    }
    now = Date.now();
    const clock = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(clock);
  });

  // how long ago, as every time that says so (utils/relative-time): minutes and hours today, then by the calendar
  const ago = (at: number) => relativeTime(at, now, $locale);

  const toggle = async () => {
    open = !open;
    if (open) {
      await tick();
      box?.querySelector<HTMLElement>('.ws-undo-row')?.focus();
    }
  };

  const close = (event: Event) => {
    if (!open) {
      return;
    }
    if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box?.contains(event.target as Node)) {
      open = false;
    }
  };
</script>

<svelte:window onpointerdown={close} onkeyup={close} />

<div class="ws-undo" bind:this={box}>
  {#if newest}
    <button
      type="button"
      class="ws-bar-icon"
      aria-label={$t('undo')}
      title={`${$t('undo')}: ${newest.label}`}
      aria-expanded={open}
      onclick={toggle}
      in:fade={{ duration: 160 }}
    >
      <Icon icon={mdiUndoVariant} size="20" />
    </button>
  {/if}

  {#if open}
    <div class="ws-undo-sheet" role="group" aria-label={$t('undo')}>
      {#each entries as entry, index (entry.id)}
        <button
          type="button"
          class="ws-undo-row"
          disabled={undoManager.busy}
          title="{$t('undo')}: {entry.label}"
          onclick={() => void undoManager.undo(entry.id)}
        >
          <span class="ws-undo-label">{entry.label}</span>
          <span class="ws-undo-when">{ago(entry.at)}</span>
          {#if index === 0}<kbd class="ws-undo-key">Ctrl Z</kbd>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ws-undo {
    position: relative;
  }
  /* a sheet under the icon, like the view menu: one frame, the theme's corners, rows edge to edge */
  .ws-undo-sheet {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 60;
    display: grid;
    gap: 2px;
    width: 20rem;
    max-height: min(26rem, 70vh);
    overflow-y: auto;
    padding: 6px;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
  }
  .ws-undo-row {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    min-height: 2.1rem;
    padding: 0.45rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    text-align: start;
  }
  .ws-undo-row:not(:disabled):hover {
    background: color-mix(in oklab, var(--ws-accent) 16%, transparent);
  }
  /* pointed at, the row's time and key take its words' ink: on the accent's wash the muted ones fell under AA
     (2026-10-18, as a menu's key hints) */
  .ws-undo-row:not(:disabled):hover :is(.ws-undo-when, .ws-undo-key) {
    color: inherit;
  }
  .ws-undo-row:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  .ws-undo-row:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-undo-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-undo-when,
  .ws-undo-key {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-micro);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-undo-key {
    padding-inline: 0.3rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
  }
</style>
