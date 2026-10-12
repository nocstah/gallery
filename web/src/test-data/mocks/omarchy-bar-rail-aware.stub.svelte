<script lang="ts">
  // Local Omarchy layer: stands in for components/omarchy/OmarchyBar.svelte (which replaced NavigationBar in
  // UserPageLayout) the way navigation-bar-rail-aware.stub does for NavigationBar: it records the `railAware` prop,
  // and renders what the page sets into the bar (its title row), as the real bar does.
  import { barSlot } from '$lib/managers/bar-slot.svelte';

  interface Props {
    railAware?: boolean;
  }

  let { railAware }: Props = $props();
</script>

<div data-testid="navigation-bar-stub" data-rail-aware={String(railAware)}>
  {@render barSlot.content?.()}
</div>
