<script lang="ts">
  import { untrack } from 'svelte';
  import FilterPanel from './filter-panel.svelte';

  interface Props {
    initialCollapsed?: boolean;
    externalToggle?: boolean;
  }

  let { initialCollapsed = true, externalToggle = true }: Props = $props();

  // A page as the phone sees it: its own filter button opens the panel, and is there only while the panel is folded
  // away (the bar's tools on Photos, the toolbar's button on an album), so the sheet has to give the focus back to a
  // button that has just come back.
  let collapsed = $state(untrack(() => initialCollapsed));
</script>

{#if collapsed}
  <button type="button" data-testid="filter-toggle-btn" onclick={() => (collapsed = false)}>Filters</button>
{/if}
<span data-testid="sheet-collapsed">{String(collapsed)}</span>
<FilterPanel
  bind:collapsed
  {externalToggle}
  config={{ sections: ['rating', 'media'], providers: {} }}
  timeBuckets={[]}
/>
