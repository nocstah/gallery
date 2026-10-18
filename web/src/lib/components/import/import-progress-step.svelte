<script lang="ts">
  import type { ImportProgress } from '$lib/managers/import-manager.svelte';
  import { Route } from '$lib/route';
  import { Icon } from '@immich/ui';
  import { mdiPause, mdiPlay } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    progress: ImportProgress;
    total: number;
    isPaused: boolean;
    isComplete: boolean;
    onTogglePause: () => void;
  }

  let { progress, total, isPaused, isComplete, onTogglePause }: Props = $props();

  let progressPercent = $derived(
    total > 0 ? Math.round(((progress.imported + progress.skipped + progress.errors) / total) * 100) : 0,
  );

  let remaining = $derived(total - progress.imported - progress.skipped - progress.errors);
</script>

<!-- Local Omarchy layer: the step on the gutter. While it runs: its heading and a muted line, the desktop's meter with the
     count in data type, what happened as a line of counts (upstream: green, yellow and red tiles; errors take the danger
     colour on their number only, and only when there are some), the file in hand, Pause framed by a hairline. Done: an
     empty state's headline, the counts, View Photos in ink and View Albums as a link (upstream: a green badge) -->
{#if isComplete}
  <div class="ws-import-step">
    <h2 class="ws-empty-title">{$t('import_complete')}</h2>

    <div class="ws-import-stats">
      <span><span class="ws-import-count">{progress.imported}</span> {$t('import_status_imported')}</span>
      <span><span class="ws-import-count">{progress.skipped}</span> {$t('import_status_skipped')}</span>
      <span>
        <span class="ws-import-count" class:ws-import-failed={progress.errors > 0}>{progress.errors}</span>
        {$t('import_status_errors')}
      </span>
      <span>{$t('albums')} <span class="ws-import-count">{progress.albumsCreated}</span></span>
    </div>

    <div class="ws-empty-actions ws-import-done">
      <a class="ws-empty-action" href={Route.photos()}>{$t('import_view_photos')}</a>
      <a class="ws-empty-link" href={Route.albums()}>{$t('import_view_albums')}</a>
    </div>
  </div>
{:else}
  <div class="ws-import-step">
    <div>
      <h2 class="ws-import-heading">{$t('import_importing')}</h2>
      <p class="ws-import-note">{$t('import_keep_tab_open')}</p>
    </div>

    <div class="ws-import-progress">
      <div class="ws-meter">
        <span data-testid="import-progress-bar" style="width: {progressPercent}%"></span>
      </div>
      <p class="ws-inbox-meta">{progress.imported + progress.skipped + progress.errors} / {total}</p>
    </div>

    <div class="ws-import-stats">
      <span data-testid="status-imported">
        <span class="ws-import-count">{progress.imported}</span>
        {$t('import_status_imported')}
      </span>
      <span data-testid="status-skipped">
        <span class="ws-import-count">{progress.skipped}</span>
        {$t('import_status_skipped')}
      </span>
      <span data-testid="status-errors">
        <span class="ws-import-count" class:ws-import-failed={progress.errors > 0}>{progress.errors}</span>
        {$t('import_status_errors')}
      </span>
      <span data-testid="status-remaining">
        <span class="ws-import-count">{remaining}</span>
        {$t('import_status_remaining')}
      </span>
    </div>

    {#if progress.currentFile}
      <p class="ws-inbox-meta ws-import-current">{progress.currentFile}</p>
    {/if}

    <div class="ws-import-nav">
      <button type="button" class="ws-import-outline" data-testid="pause-button" onclick={onTogglePause}>
        <Icon icon={isPaused ? mdiPlay : mdiPause} size="16" />
        {isPaused ? $t('import_resume') : $t('import_pause')}
      </button>
    </div>
  </div>
{/if}

<style>
  .ws-import-progress {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }
  .ws-import-current {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* errors are the one count that means something is wrong: the theme's danger role on the number, nothing more (in
     the stats, so it outranks the wizard's ink for every count) */
  .ws-import-stats .ws-import-failed {
    color: var(--ws-danger);
  }
  .ws-import-done {
    margin-top: 0.5rem;
  }
</style>
