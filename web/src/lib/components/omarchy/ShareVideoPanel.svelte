<script lang="ts">
  // Local Omarchy layer: the videos being made ready for a chat app (managers/share-video-manager), in a square panel
  // in the corner: each with its progress while Curator makes it, then its size once the browser has saved it (save it
  // again from here), or that it failed (try again). The close button clears the finished ones.
  import { SHARE_APPS, shareVideos } from '$lib/managers/share-video-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import { Icon } from '@immich/ui';
  import { mdiClose, mdiDownload, mdiReload } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
</script>

{#if shareVideos.items.length > 0}
  <section class="ws-share" aria-label={$t('videos_for_sharing')} transition:fly={{ y: 12, duration: 200 }}>
    <header class="ws-share-head">
      <h2>{$t('videos_for_sharing')}</h2>
      <button
        type="button"
        class="ws-share-tool"
        aria-label={$t('close')}
        title={$t('close')}
        onclick={() => shareVideos.clearDone()}
      >
        <Icon icon={mdiClose} size="16" />
      </button>
    </header>
    <ul>
      {#each shareVideos.items as item (item.key)}
        <li data-status={item.status}>
          <div class="ws-share-row">
            <span class="ws-share-name" title={item.label}>{item.label}</span>
            <span class="ws-share-app">{SHARE_APPS[item.app]}</span>
            {#if item.status === 'making'}
              <span class="ws-share-state">{Math.round(item.progress * 100)}%</span>
            {:else if item.status === 'ready' && item.result}
              <span class="ws-share-state">{getByteUnitString(item.result.size, $locale)}</span>
              <button
                type="button"
                class="ws-share-tool"
                aria-label={$t('download')}
                title={$t('download')}
                onclick={() => shareVideos.save(item)}
              >
                <Icon icon={mdiDownload} size="16" />
              </button>
            {:else}
              <span class="ws-share-state ws-share-failed" title={item.error}>{$t('failed')}</span>
              <button
                type="button"
                class="ws-share-tool"
                aria-label={$t('retry')}
                title={$t('retry')}
                onclick={() => shareVideos.retry(item.key)}
              >
                <Icon icon={mdiReload} size="16" />
              </button>
            {/if}
          </div>
          {#if item.status === 'ready' && item.result && !item.result.fits}
            <p class="ws-share-note">
              {$t('video_over_limit', {
                values: { app: SHARE_APPS[item.app], size: getByteUnitString(item.result.limit, $locale) },
              })}
            </p>
          {/if}
          {#if item.status === 'making'}
            <span class="ws-share-bar" style:--done={item.progress} aria-hidden="true"></span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* one frame, the theme's corners, rows split by hairlines from edge to edge; the root layout puts it in the
     bottom-left corner, under the photo books */
  .ws-share {
    width: min(21rem, calc(100vw - 1.5rem));
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
    color: var(--immich-ui-dark);
  }
  .ws-share-head {
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
  .ws-share-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 1.75rem;
  }
  .ws-share-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  .ws-share-app,
  .ws-share-state {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-share-failed {
    color: oklch(0.66 0.19 25);
  }
  .ws-share-note {
    margin-top: 0.25rem;
    font-size: var(--ws-text-data);
    line-height: 1.4;
    color: var(--immich-ui-muted);
  }
  .ws-share-tool {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-share-tool:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-share-tool:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* the making: a 2px line along the row's foot, as far as it has got */
  .ws-share-bar {
    position: absolute;
    inset-inline-start: 0;
    bottom: 0;
    width: calc(var(--done, 0) * 100%);
    height: 2px;
    background: color-mix(in oklab, var(--immich-ui-dark) 55%, transparent);
    transition: width 400ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-share-bar {
      transition: none;
    }
  }
</style>
