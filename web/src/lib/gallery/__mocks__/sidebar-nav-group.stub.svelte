<script lang="ts">
  import type { Snippet } from 'svelte';

  // Local Omarchy layer: a sidebar group's heading and, for a group that folds (Manage, Hidden and deleted), its rows
  interface Props {
    title: string;
    children?: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<div>{title}</div>
{@render children?.()}
