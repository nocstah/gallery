<script lang="ts">
  import { Icon } from '@immich/ui';
  import type { Snippet } from 'svelte';

  interface Props {
    icon: string;
    children: Snippet;
    title: string;
    tooltip?: string;
  }

  let { icon, children, title, tooltip }: Props = $props();
</script>

<!-- Local Omarchy layer: a row of a duplicate's details on the ground: the icon and the label in muted meta, the value in
     data type at the row's end, a hairline below -->
<div class="ws-dup-row" title={title ?? tooltip}>
  <Icon {icon} size="16" />
  <span class="ws-dup-row-label">{title}</span>
  <span class="ws-dup-row-value">{@render children()}</span>
</div>

<style>
  .ws-dup-row {
    display: grid;
    grid-template-columns: 16px auto minmax(0, 1fr);
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--ws-hairline);
    color: var(--immich-ui-muted);
  }
  .ws-dup-row :global(svg) {
    align-self: center;
  }
  .ws-dup-row-label {
    overflow: hidden;
    font-size: var(--ws-text-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-dup-row-value {
    justify-self: end;
    min-width: 0;
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: end;
    overflow-wrap: anywhere;
  }
</style>
