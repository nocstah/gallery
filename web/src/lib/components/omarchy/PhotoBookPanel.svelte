<script lang="ts">
  // Local Omarchy layer: the photo books Curator is making or has made (managers/photo-book-manager), in a square panel
  // in the corner above the videos for sharing: each with how far it has got (waiting, choosing the photos, then page
  // by page), then its page count and its three files, each to open in a new tab or to save: the book for the print
  // lab, its cover, and a light preview of the spreads for reading on screen. The close button clears the finished
  // ones. It also asks Curator, once someone is signed in, whether it makes books at all; the layout mounts it for
  // Curator's owner alone (utils/curator's curatorIsMine).
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { photoBooks, type BookItem } from '$lib/managers/photo-book-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import { bookFileUrl, type BookPart } from '$lib/utils/curator';
  import { Icon } from '@immich/ui';
  import { mdiClose, mdiDownload, mdiOpenInNew, mdiReload } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';

  $effect(() => {
    if (authManager.authenticated && !authManager.isSharedLink) {
      photoBooks.check();
    }
  });

  const parts: BookPart[] = ['book', 'cover', 'preview'];
  const partLabels = $derived<Record<BookPart, string>>({
    book: $t('photo_book_interior'),
    cover: $t('photo_book_cover'),
    preview: $t('photo_book_preview'),
  });

  const stage = (item: BookItem) => {
    switch (item.stage) {
      case 'waiting': {
        return $t('waiting');
      }
      case 'choosing': {
        return $t('photo_book_choosing');
      }
      case 'pages': {
        return $t('photo_book_page_of', { values: { done: item.done, total: item.total } });
      }
      case 'finishing': {
        return $t('photo_book_finishing');
      }
    }
  };
</script>

{#if photoBooks.items.length > 0}
  <section class="ws-books" aria-label={$t('photo_books')} transition:fly={{ y: 12, duration: 200 }}>
    <header class="ws-books-head">
      <h2>{$t('photo_books')}</h2>
      <button
        type="button"
        class="ws-books-tool"
        aria-label={$t('close')}
        title={$t('close')}
        onclick={() => photoBooks.clearDone()}
      >
        <Icon icon={mdiClose} size="16" />
      </button>
    </header>
    <ul class="ws-books-list">
      {#each photoBooks.items as item (item.key)}
        <li class="ws-books-item" data-status={item.status}>
          <div class="ws-books-row">
            <span class="ws-books-name" title={item.result?.folder ?? item.label}>{item.label}</span>
            {#if item.status === 'making'}
              <span class="ws-books-state">{stage(item)}</span>
            {:else if item.status === 'ready' && item.result}
              <span class="ws-books-state">
                {$t('photo_book_pages', { values: { count: item.result.pages } })}
              </span>
            {:else}
              <span class="ws-books-state ws-books-failed" title={item.error}>{$t('failed')}</span>
              <button
                type="button"
                class="ws-books-tool"
                aria-label={$t('retry')}
                title={$t('retry')}
                onclick={() => photoBooks.retry(item.key)}
              >
                <Icon icon={mdiReload} size="16" />
              </button>
            {/if}
          </div>
          {#if item.status === 'ready' && item.result && item.jobId !== undefined}
            <ul class="ws-books-files">
              {#each parts as part (part)}
                <li class="ws-books-file">
                  <span class="ws-books-part">{partLabels[part]}</span>
                  <span class="ws-books-size">{getByteUnitString(item.result.files[part].size, $locale)}</span>
                  <a
                    class="ws-books-tool"
                    href={bookFileUrl(item.jobId, part)}
                    target="_blank"
                    rel="noopener"
                    aria-label="{partLabels[part]}: {$t('photo_book_open')}"
                    title={$t('photo_book_open')}
                  >
                    <Icon icon={mdiOpenInNew} size="16" />
                  </a>
                  <a
                    class="ws-books-tool"
                    href={bookFileUrl(item.jobId, part, true)}
                    aria-label="{partLabels[part]}: {$t('download')}"
                    title={$t('download')}
                  >
                    <Icon icon={mdiDownload} size="16" />
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
          {#if item.status === 'making'}
            <span class="ws-books-bar" style:--done={item.progress} aria-hidden="true"></span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* the videos for sharing' frame: the theme's corners, rows split by hairlines from edge to edge */
  .ws-books {
    width: min(21rem, calc(100vw - 1.5rem));
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
    color: var(--immich-ui-dark);
  }
  .ws-books-head {
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
  .ws-books-list {
    max-height: 20rem;
    overflow-y: auto;
  }
  .ws-books-item {
    position: relative;
    padding: 0.5rem 0.35rem 0.5rem 0.75rem;
  }
  .ws-books-item + .ws-books-item {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-books-row,
  .ws-books-file {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 1.75rem;
  }
  .ws-books-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  .ws-books-state,
  .ws-books-size {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-books-failed {
    color: var(--immich-ui-danger-500);
  }
  /* a finished book's files, a line each under its title */
  .ws-books-part {
    flex: 1;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .ws-books-tool {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-books-tool:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-books-tool:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* the making: a 2px line along the row's foot, as far as it has got */
  .ws-books-bar {
    position: absolute;
    inset-inline-start: 0;
    bottom: 0;
    width: calc(var(--done, 0) * 100%);
    height: 2px;
    background: color-mix(in oklab, var(--immich-ui-dark) 55%, transparent);
    transition: width 400ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-books-bar {
      transition: none;
    }
  }
</style>
