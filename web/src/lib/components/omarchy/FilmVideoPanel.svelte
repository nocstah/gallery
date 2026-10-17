<script lang="ts">
  // Local Omarchy layer: memories' films being saved as video (managers/film-video-manager), in the square panel of the
  // bottom-left corner, in the frame of the videos for sharing: each with how far Curator has got (waiting, reading
  // the photos, then the share of its frames drawn), then its size once the browser has saved it (save it again from
  // here), or that it failed (try again), or that it is longer than Curator saves. The close button clears the
  // finished ones. It also asks Curator, once someone is signed in, whether it saves films at all; the layout mounts
  // it for Curator's owner alone (utils/curator's curatorIsMine).
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { filmVideos, type FilmItem } from '$lib/managers/film-video-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import { Icon } from '@immich/ui';
  import { mdiClose, mdiDownload, mdiReload } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';

  $effect(() => {
    if (authManager.authenticated && !authManager.isSharedLink) {
      filmVideos.check();
    }
  });

  const stateOf = (item: FilmItem) => (item.stage === 'frames' ? `${Math.round(item.progress * 100)}%` : $t('waiting'));
</script>

{#if filmVideos.items.length > 0}
  <section class="ws-films" aria-label={$t('memory_film_videos')} transition:fly={{ y: 12, duration: 200 }}>
    <header class="ws-films-head">
      <h2>{$t('memory_film_videos')}</h2>
      <button
        type="button"
        class="ws-films-tool"
        aria-label={$t('close')}
        title={$t('close')}
        onclick={() => filmVideos.clearDone()}
      >
        <Icon icon={mdiClose} size="16" />
      </button>
    </header>
    <ul>
      {#each filmVideos.items as item (item.key)}
        <li data-status={item.status}>
          <div class="ws-films-row">
            <span class="ws-films-name" title={item.label}>{item.label}</span>
            {#if item.status === 'making'}
              <span class="ws-films-state">{stateOf(item)}</span>
            {:else if item.status === 'ready' && item.result}
              <span class="ws-films-state">{getByteUnitString(item.result.size, $locale)}</span>
              <button
                type="button"
                class="ws-films-tool"
                aria-label={$t('download')}
                title={$t('download')}
                onclick={() => filmVideos.save(item)}
              >
                <Icon icon={mdiDownload} size="16" />
              </button>
            {:else}
              <span class="ws-films-state ws-films-failed" title={item.error}>{$t('failed')}</span>
              {#if !item.tooLong}
                <button
                  type="button"
                  class="ws-films-tool"
                  aria-label={$t('retry')}
                  title={$t('retry')}
                  onclick={() => filmVideos.retry(item.key)}
                >
                  <Icon icon={mdiReload} size="16" />
                </button>
              {/if}
            {/if}
          </div>
          {#if item.tooLong}
            <p class="ws-films-note">{$t('memory_film_too_long')}</p>
          {/if}
          {#if item.status === 'making'}
            <span class="ws-films-bar" style:--done={item.progress} aria-hidden="true"></span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* the videos for sharing' frame: the theme's corners, rows split by hairlines from edge to edge */
  .ws-films {
    width: min(21rem, calc(100vw - 1.5rem));
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
    color: var(--immich-ui-dark);
  }
  .ws-films-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.35rem 0.35rem 0.75rem;
    border-bottom: 1px solid var(--ws-hairline);
  }
  h2 {
    font-size: var(--ws-text-meta);
    font-weight: 600;
  }
  ul {
    max-height: 16rem;
    overflow-y: auto;
  }
  li {
    position: relative;
    padding: 0.5rem 0.35rem 0.5rem 0.75rem;
  }
  li + li {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-films-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 1.75rem;
  }
  .ws-films-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  .ws-films-state {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-films-failed {
    color: var(--immich-ui-danger-500);
  }
  .ws-films-note {
    margin-top: 0.25rem;
    font-size: var(--ws-text-data);
    line-height: 1.4;
    color: var(--immich-ui-muted);
  }
  .ws-films-tool {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-films-tool:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-films-tool:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* the making: a 2px line along the row's foot, as far as it has got */
  .ws-films-bar {
    position: absolute;
    inset-inline-start: 0;
    bottom: 0;
    width: calc(var(--done, 0) * 100%);
    height: 2px;
    background: color-mix(in oklab, var(--immich-ui-dark) 55%, transparent);
    transition: width 400ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-films-bar {
      transition: none;
    }
  }
</style>
