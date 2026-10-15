<script lang="ts">
  // Local Omarchy layer: what a level of Tags or Folders holds, as a calm list on the page's gutter instead of
  // upstream's grid of 64px icons on a grey slab: a row per tag or folder, its name in the UI face, what it holds in
  // data type at the row's end, a hairline under each row; wide windows set the rows in columns.
  import type { TreeNode } from '$lib/utils/tree-utils';
  import { Icon } from '@immich/ui';

  interface Props {
    node: TreeNode;
    getLink: (path: string) => string;
    icon: string;
    /** what a row holds, in data type (its tags or folders), or nothing */
    count?: (node: TreeNode) => string | undefined;
    label: string;
  }

  let { node, getLink, icon, count, label }: Props = $props();

  // by name the way a person numbers them ("2" before "10", years in order), as the tree beside it
  const children = $derived(
    [...node.children].sort((a, b) =>
      a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }),
    ),
  );
</script>

{#if children.length > 0}
  <ul class="ws-explorer-list" aria-label={label} data-testid="explorer-list">
    {#each children as child (child.path)}
      {@const holds = count?.(child)}
      <li>
        <a class="ws-explorer-row" href={getLink(child.path)} title={child.value}>
          <Icon {icon} size="18" class="ws-explorer-icon" color={child.color} aria-hidden={true} />
          <span class="ws-explorer-name">{child.value}</span>
          {#if holds}
            <span class="ws-explorer-count">{holds}</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .ws-explorer-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
    column-gap: calc(var(--ws-gap) * 2.4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ws-explorer-list > li {
    min-width: 0;
    border-bottom: 1px solid var(--ws-hairline);
  }
  /* a row as Settings draws one: the hairline on the row, the pointer's tint inside it */
  .ws-explorer-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-explorer-row:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 4%, transparent);
  }
  .ws-explorer-row:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .ws-explorer-row :global(.ws-explorer-icon) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-explorer-row:hover :global(.ws-explorer-icon) {
    color: var(--immich-ui-dark);
  }
  .ws-explorer-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-explorer-count {
    flex: none;
    margin-inline-start: auto;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  /* a finger needs a taller row */
  @media (pointer: coarse) {
    .ws-explorer-row {
      min-height: 2.75rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-explorer-row {
      transition: none;
    }
  }
</style>
