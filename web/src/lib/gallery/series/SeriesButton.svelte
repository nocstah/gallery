<script lang="ts">
  // Local Omarchy layer: the Memories page's way to "From the beginning" (gallery/series), beside Room in its bar, for
  // the owner only: a family account sees nothing of it.
  import { Button } from '@immich/ui';
  import { mdiCalendarHeartOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { SERIES_ROUTE, seriesIsMine } from './series-route';
</script>

{#if seriesIsMine()}
  <Button
    href={SERIES_ROUTE}
    leadingIcon={mdiCalendarHeartOutline}
    variant="ghost"
    size="small"
    color="secondary"
    title={$t('memory_series_title')}
    aria-label={$t('memory_series_title')}
    data-testid="memories-series"
  >
    <span class="ws-action-label">{$t('memory_series_title')}</span>
  </Button>
{/if}
