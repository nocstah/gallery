<script lang="ts">
  import type { Snippet } from 'svelte';

  // Local Omarchy layer: a group of the selection bar's actions (the selection itself, what keeps or shares it, the
  // special albums, the ⋮); a hairline stands between two groups that hold something (omarchy-world.css,
  // .ws-select-group), so a group a page or a selection leaves empty leaves no rule
  let { children }: { children: Snippet } = $props();
</script>

<div class="ws-select-group">{@render children()}</div>
