<script lang="ts">
  import { t } from 'svelte-i18n';
</script>

<p class="locked-folder-notice" role="note" data-testid="locked-folder-privacy-note">
  {$t('locked_folder_privacy_note')}
</p>

<style>
  .locked-folder-notice {
    max-width: 75ch;
    padding: 0.75rem 1rem;
    font-size: var(--ws-text-small, 0.875rem);
    line-height: 1.5;
    color: var(--immich-ui-muted);
    text-wrap: pretty;
  }
</style>
