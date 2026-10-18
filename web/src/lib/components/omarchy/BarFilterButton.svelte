<script lang="ts">
  // Local Omarchy layer: a page's filter button among the bar's own icons (the bar's tools, managers/bar-slot), drawn as
  // Photos draws its own there: the funnel, with the accent's dot while a filter is on. An album on a narrow screen
  // puts it there, where it had stood alone in a row above the photos (DESIGN.md, Album page). Its test id is the one
  // the phone's filter sheet hands the focus back to (filter-panel.svelte).
  import { Icon } from '@immich/ui';
  import { mdiFilterOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    /** a filter is on */
    active?: boolean;
    onclick: () => void;
  };

  const { active = false, onclick }: Props = $props();
</script>

<button
  type="button"
  class="ws-bar-icon"
  aria-label={$t('filters')}
  title={$t('filters')}
  data-testid="filter-toggle-btn"
  {onclick}
>
  <!-- the funnel, as every filter affordance; sliders are Adjust's -->
  <Icon icon={mdiFilterOutline} size="20" />
  {#if active}<span class="ws-bar-dot" aria-hidden="true"></span>{/if}
</button>
