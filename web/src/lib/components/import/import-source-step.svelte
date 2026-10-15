<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiApple, mdiArrowRight, mdiGoogle } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    onNext: () => void;
  }

  let { onNext }: Props = $props();
</script>

<!-- Local Omarchy layer: where the photos come from is a choice of two in the segmented control (upstream: two big
     cards), the one chosen inverted, Apple Photos waiting with its "Coming soon"; what Google needs is one muted line
     with its link (upstream: a blue panel); Next is the step's one ink action -->
<div class="ws-import-step">
  <div class="ws-seg ws-import-sources" role="group" aria-label={$t('import_step_source')}>
    <button type="button" data-testid="source-google" aria-pressed="true">
      <Icon icon={mdiGoogle} size="16" />
      {$t('import_from_google_photos')}
    </button>
    <button type="button" data-testid="source-apple" aria-pressed="false" aria-disabled="true" disabled>
      <Icon icon={mdiApple} size="16" />
      {$t('import_from_apple_photos')}
      <span class="ws-import-soon">{$t('import_coming_soon')}</span>
    </button>
  </div>

  <p class="ws-import-note">
    {$t('import_takeout_info')}
    <a href="https://takeout.google.com" target="_blank" rel="noopener noreferrer" class="ws-empty-link">
      takeout.google.com
    </a>
  </p>

  <div class="ws-import-nav">
    <button type="button" class="ws-btn" onclick={onNext}>
      {$t('next')}
      <Icon icon={mdiArrowRight} size="16" />
    </button>
  </div>
</div>

<style>
  .ws-import-sources {
    flex-wrap: wrap;
    margin-inline-start: 0;
  }
  .ws-import-sources button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .ws-import-sources button:disabled {
    cursor: not-allowed;
  }
  .ws-import-sources button:disabled:hover {
    background: transparent;
    color: var(--immich-ui-muted);
  }
  .ws-import-soon {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
  }
</style>
