<script lang="ts">
  import { Button } from '@immich/ui';
  import { mdiPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    total: number;
    onclick: () => void;
  }

  const { total, onclick }: Props = $props();
</script>

<!-- Local Omarchy layer: the pages this shows on (Favorites, Archive, a person's or a partner's photos) are not searches,
     so it adds their photos, not "results" (TimelineRouteGroupingBar) -->
{#if total > 0}
  <Button
    size="small"
    color="secondary"
    shape="round"
    leadingIcon={mdiPlus}
    {onclick}
    data-testid="add-all-to-collection"
  >
    {$t('add_all_photos_to', { values: { count: total } })}
  </Button>
{/if}
