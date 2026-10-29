<script lang="ts">
  // Local Omarchy layer: the move under way, in one slim frame in the bottom-right corner of every page of both
  // libraries (gallery/moves; MOVE-TO-LIBRARY.md S4 to S7, D4 to D6), so closing a dialog or going to another page
  // loses nothing: how far it has got, a 1px line in the accent for the bytes, what it is doing, and Cancel; then how
  // it ended, with the photos that stayed. It mounts, polls and cleans up leftover keys only where the page conditions
  // hold (move-gates), so a page opened from another device or in a vault's Gallery never asks 127.0.0.1:2297
  // anything. The move page shows its own move, so the panel steps aside there and leaves the asking to it.
  import { page } from '$app/state';
  import { currentLibrary } from '$lib/gallery/libraries/library-context.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { Icon, modalManager } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import MoveHeldModal from './MoveHeldModal.svelte';
  import { libraryById, movePageUrl, moverPageAllowed, openMovePage } from './move-gates';
  import { moveManager } from './move-manager.svelte';
  import {
    byteShare,
    endWords,
    errorWords,
    moveNames,
    pauseWords,
    phaseWords,
    progressWords,
    sideOf,
    stayedCount,
  } from './move-words';
  import { isEnded, type MoveStatus } from './mover';

  let userAgent = $state('');
  onMount(() => {
    userAgent = navigator.userAgent;
  });

  const owner = $derived(authManager.authenticated && !authManager.isSharedLink ? authManager.user : undefined);
  const allowed = $derived(!!userAgent && moverPageAllowed(page.url, userAgent, owner));
  // the move page asks the mover for its own move, so the panel neither shows nor asks there
  const onMovePage = $derived(page.url.pathname === '/moves');

  $effect(() => {
    if (!allowed || onMovePage) {
      return;
    }
    moveManager.start();
    return () => moveManager.stop();
  });

  const here = $derived(currentLibrary()?.id);
  const shown = $derived(allowed && !onMovePage ? moveManager.shown : []);

  // what an action of the panel's last said, by move
  let notes = $state<Record<string, string>>({});
  let acting = $state<Record<string, boolean>>({});

  const act = async (move: MoveStatus, action: () => ReturnType<typeof moveManager.cancel>) => {
    acting = { ...acting, [move.move]: true };
    const outcome = await action();
    acting = { ...acting, [move.move]: false };
    notes = {
      ...notes,
      [move.move]: outcome.kind === 'error' ? errorWords($t, outcome.code, moveNames(move)) : '',
    };
  };

  const cancel = (move: MoveStatus) => act(move, () => moveManager.cancel(move.move));

  // S7 and D6: a fresh key for this side; from the source, the destination's move page opens in the same click
  const continueMove = (move: MoveStatus) => {
    const side = sideOf(move, here);
    const destination = libraryById(move.destination);
    if (side === 'source' && here && destination && move.needs.includes('destination')) {
      openMovePage(destination, move.move, here);
    }
    if (side && move.needs.includes(side)) {
      void act(move, () => moveManager.giveKey(move.move, side));
    }
  };

  const showHeld = (move: MoveStatus) => void modalManager.show(MoveHeldModal, { move });

  const close = (move: MoveStatus) => moveManager.dismiss(move.move);
</script>

{#if shown.length > 0}
  <div class="ws-moves-corner fixed inset-e-3 bottom-3 z-60 flex flex-col items-end gap-3">
    {#each shown as move (move.move)}
      {@const side = sideOf(move, here)}
      {@const names = moveNames(move)}
      {@const ended = isEnded(move.state)}
      {@const destination = libraryById(move.destination)}
      {@const source = libraryById(move.source)}
      <section class="ws-moves" data-testid="move-progress" data-state={move.state}>
        <header class="ws-moves-head">
          {#if ended}
            <h2>{endWords($t, move, side)[0]}</h2>
            <button
              type="button"
              class="ws-moves-tool"
              aria-label={$t('close')}
              title={$t('close')}
              onclick={() => close(move)}
            >
              <Icon icon={mdiClose} size="16" />
            </button>
          {:else}
            <h2>{progressWords($t, move, side)}</h2>
          {/if}
        </header>
        <div class="ws-moves-body">
          {#if ended}
            {#each endWords($t, move, side).slice(1) as line, index (index)}
              <p>{line}</p>
            {/each}
          {:else if move.state === 'paused'}
            <p>{$t('moves_paused', { values: { reason: pauseWords($t, move) } })}</p>
            {#if side === 'destination' && move.needs.includes('source')}
              <p class="ws-moves-muted">{$t('moves_needs_key', { values: { library: names.source } })}</p>
            {/if}
          {:else if move.state === 'running'}
            {@const phase = phaseWords($t, move)}
            {#if phase}
              <p class="ws-moves-muted">{phase}</p>
            {/if}
          {:else if move.state === 'ready' && side === 'source'}
            <p>{$t('moves_confirm_there', { values: names })}</p>
          {:else if side === 'destination' && (move.state === 'checking' || move.state === 'planning')}
            <p class="ws-moves-muted">{$t('moves_reading', { values: names })}</p>
          {:else}
            <p class="ws-moves-muted">{$t('moves_checking')}</p>
          {/if}
          {#if notes[move.move]}
            <p class="ws-moves-muted" role="alert">{notes[move.move]}</p>
          {/if}
        </div>
        <footer class="ws-moves-actions">
          {#if ended}
            {#if side === 'source' && stayedCount(move) > 0 && move.state !== 'expired' && move.state !== 'refused'}
              <button type="button" class="ws-moves-link" onclick={() => showHeld(move)}>{$t('moves_show_held')}</button
              >
            {/if}
            {#if side === 'destination' && move.state === 'done'}
              <a class="ws-moves-link" href={Route.recentlyAdded()}>{$t('moves_recently_added')}</a>
            {/if}
          {:else}
            {#if move.state === 'paused' && side && (move.needs.includes(side) || (side === 'source' && move.needs.includes('destination')))}
              <button
                type="button"
                class="ws-moves-link"
                disabled={acting[move.move]}
                onclick={() => continueMove(move)}>{$t('moves_continue')}</button
              >
            {/if}
            {#if side === 'source' && move.state === 'ready' && destination && here}
              <a class="ws-moves-link" href={movePageUrl(destination, move.move, here)} target="_blank" rel="noopener"
                >{$t('moves_open', { values: names })}</a
              >
            {/if}
            {#if side === 'destination'}
              <a class="ws-moves-link" href={`/moves?move=${move.move}`}>{$t('moves_show')}</a>
            {/if}
            {#if side === 'destination' && move.state === 'paused' && move.needs.includes('source') && source}
              <a class="ws-moves-link" href={source.url} target="_blank" rel="noopener"
                >{$t('moves_open', { values: { library: names.source } })}</a
              >
            {/if}
            <button type="button" class="ws-moves-link" disabled={acting[move.move]} onclick={() => void cancel(move)}
              >{$t('moves_cancel')}</button
            >
          {/if}
        </footer>
        {#if move.state === 'running'}
          <span class="ws-moves-bar" style:--done={byteShare(move)} aria-hidden="true"></span>
        {/if}
      </section>
    {/each}
  </div>
{/if}

<style>
  /* one frame on the theme's ground, its parts split by hairlines that run edge to edge, the counts in data type */
  .ws-moves {
    position: relative;
    width: min(22rem, calc(100vw - 1.5rem));
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.28);
    color: var(--immich-ui-dark);
    overflow: hidden;
  }
  .ws-moves-head {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    min-height: 2.25rem;
    padding: 0.35rem 0.35rem 0.35rem 0.75rem;
  }
  h2 {
    font-size: var(--ws-text-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ws-moves-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0 0.75rem 0.5rem;
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    font-variant-numeric: tabular-nums;
  }
  .ws-moves-body:empty {
    display: none;
  }
  .ws-moves-muted {
    color: var(--immich-ui-muted);
  }
  .ws-moves-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
    padding: 0.35rem 0.75rem;
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-moves-actions:empty {
    display: none;
  }
  /* actions as plain words, never a primary: nothing here deletes anything */
  .ws-moves-link {
    min-height: 2rem;
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: var(--immich-ui-dark);
    text-decoration: none;
  }
  .ws-moves-link:hover {
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
    text-underline-offset: 0.2em;
  }
  .ws-moves-link:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ws-moves-link:focus-visible,
  .ws-moves-tool:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-moves-tool {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-moves-tool:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  /* the bytes gone so far: one hairline in the accent along the frame's foot */
  .ws-moves-bar {
    position: absolute;
    inset-inline-start: 0;
    bottom: 0;
    width: calc(var(--done, 0) * 100%);
    height: 1px;
    background: var(--ws-accent);
    transition: width 400ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-moves-bar {
      transition: none;
    }
  }
</style>
