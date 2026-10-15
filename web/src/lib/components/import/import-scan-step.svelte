<script lang="ts">
  import type { ScanProgress } from '$lib/utils/google-takeout-scanner';
  import { Icon } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    progress: ScanProgress | undefined;
    onCancel: () => void;
  }

  let { progress, onCancel }: Props = $props();

  let progressPercent = $derived(
    progress && progress.zipCount > 0 ? Math.round((progress.zipIndex / progress.zipCount) * 100) : 0,
  );
</script>

<!-- Local Omarchy layer: the step on the gutter: its heading and a muted line, the desktop's 2px meter (an ink line on a
     hairline track), the zip and the file being read in data type, what was found as a line of counts (upstream: grey
     tiles with coloured icons), and Cancel, quiet: it only goes back to the files -->
<div class="ws-import-step">
  <div>
    <h2 class="ws-import-heading">{$t('import_scanning')}</h2>
    <p class="ws-import-note">{$t('import_scanning_description')}</p>
  </div>

  <div class="ws-import-progress">
    <div class="ws-meter">
      <span data-testid="scan-progress-bar" style="width: {progressPercent}%"></span>
    </div>
    {#if progress}
      <p class="ws-inbox-meta">{progress.currentZip} ({progress.zipIndex + 1} / {progress.zipCount})</p>
    {/if}
  </div>

  {#if progress?.currentFile}
    <p class="ws-inbox-meta ws-import-current">{progress.currentFile}</p>
  {/if}

  {#if progress}
    <dl class="ws-import-stats">
      <div>
        <dt>{$t('import_found_so_far')}</dt>
        <dd class="ws-import-count">{progress.mediaCount}</dd>
      </div>
      <div>
        <dt>{$t('location')}</dt>
        <dd class="ws-import-count">{progress.withLocation}</dd>
      </div>
      <div>
        <dt>{$t('favorites')}</dt>
        <dd class="ws-import-count">{progress.favorites}</dd>
      </div>
      <div>
        <dt>{$t('albums')}</dt>
        <dd class="ws-import-count">{progress.albumNames.size}</dd>
      </div>
    </dl>
  {/if}

  <div class="ws-import-nav">
    <button type="button" class="ws-import-outline" onclick={onCancel}>
      <Icon icon={mdiClose} size="16" />
      {$t('cancel')}
    </button>
  </div>
</div>

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
</style>
