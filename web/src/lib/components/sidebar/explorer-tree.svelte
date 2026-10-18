<script lang="ts">
  // Local Omarchy layer: the tree Tags and Folders keep in their own sidebar (upstream's "Explorer"), drawn like the
  // albums' tree under Albums (sidebar/album-tree.svelte): the page itself is the first row, as Albums is in the main
  // sidebar, lit at the top level; below it the tree, a level one rem further in, each row with a chevron when it holds
  // more, the row on screen inverted and the rows above it open. Names are read in the UI face, not upstream's mono.
  import SidebarNavItem from '$lib/components/sidebar/sidebar-nav-item.svelte';
  import type { TreeNode } from '$lib/utils/tree-utils';
  import { Icon, type IconLike, type IconProps } from '@immich/ui';
  import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
  import { tick, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    /** the tree's root (TreeNode.fromTags, the folders store): its children are the top level */
    tree: TreeNode;
    /** the path on screen, '' at the top level */
    active: string;
    getLink: (path: string) => string;
    /** the page itself, the tree's first row (Tags, Folders) */
    title: string;
    icon: IconLike | IconProps;
    /** a row's icon, and the one it shows while open (a folder opens; a tag stays a tag) */
    nodeIcon: { closed: string; open: string };
    /** names the tree for its ids and for assistive technology */
    scope: string;
  }

  let { tree, active, getLink, title, icon, nodeIcon, scope }: Props = $props();

  let expanded = $state(true);
  const open = new SvelteSet<string>();

  // by name the way a person numbers them ("2" before "10", years in order), as the albums' tree and page sort
  const byName = (a: TreeNode, b: TreeNode) =>
    a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' });
  const sorted = new WeakMap<TreeNode, TreeNode[]>();
  const childrenOf = (node: TreeNode) => {
    let children = sorted.get(node);
    if (!children) {
      children = [...node.children].sort(byName);
      sorted.set(node, children);
    }
    return children;
  };

  // What comes on screen is never hidden in a closed branch: it and the rows above it open, once, when it arrives (a
  // row closed by hand afterwards stays closed). The one on screen opens too, since a tag's page shows its photos and
  // only the tree shows the tags inside it.
  $effect(() => {
    const chain: string[] = [];
    for (let node: TreeNode | null = tree.traverse(active); node?.parent; node = node.parent) {
      chain.push(node.path);
    }
    untrack(() => {
      for (const path of chain) {
        open.add(path);
      }
    });
  });

  // ...and is brought into the sidebar's view: a tag deep in a long list would otherwise be lit out of sight
  let element = $state<HTMLElement>();
  $effect(() => {
    void active;
    void tree;
    void tick().then(() =>
      element?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }),
    );
  });

  const toggle = (path: string) => (open.has(path) ? open.delete(path) : open.add(path));
  const idFor = (path: string) => `ws-explorer-${scope}-${encodeURIComponent(path)}`;
</script>

{#snippet level(parent: TreeNode, depth: number)}
  {#each childrenOf(parent) as node (node.path)}
    {@const filled = node.size > 0}
    {@const isOpen = filled && open.has(node.path)}
    {@const current = node.path === active}
    <li>
      <div class="ws-tree-row" style:--depth={depth} data-active={current}>
        {#if filled}
          <button
            type="button"
            class="ws-tree-toggle"
            aria-expanded={isOpen}
            aria-controls={idFor(node.path)}
            aria-label={$t(isOpen ? 'collapse_named' : 'expand_named', { values: { name: node.value } })}
            onclick={() => toggle(node.path)}
          >
            <Icon icon={isOpen ? mdiChevronDown : mdiChevronRight} size="16" aria-hidden={true} />
          </button>
        {:else}
          <span class="ws-tree-toggle" aria-hidden="true"></span>
        {/if}
        <a
          class="ws-tree-link"
          href={getLink(node.path)}
          title={node.value}
          aria-current={current ? 'page' : undefined}
          data-sveltekit-keepfocus
          data-testid="explorer-row"
        >
          <!-- a tag keeps the colour it was given; the row on screen inverts whole -->
          <Icon
            icon={isOpen ? nodeIcon.open : nodeIcon.closed}
            size="18"
            class="ws-tree-icon"
            color={current ? undefined : node.color}
            aria-hidden={true}
          />
          <span class="ws-tree-name">{node.value}</span>
        </a>
      </div>
      {#if isOpen}
        <ul id={idFor(node.path)} class="ws-tree-group">
          {@render level(node, depth + 1)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<!-- upstream's Sidebar insets its content 0.5rem; taken back here so the rows stand where the main sidebar's do -->
<div class="ws-explorer" data-testid="explorer-tree-{scope}" bind:this={element}>
  <SidebarNavItem {title} href={getLink('')} {icon} isActive={() => active === '' || !expanded} bind:expanded>
    {#snippet items()}
      <ul class="ws-tree" aria-label={title}>
        {@render level(tree, 0)}
      </ul>
    {/snippet}
  </SidebarNavItem>
</div>

<style>
  .ws-explorer {
    margin-inline-start: -0.5rem;
    padding-bottom: 1.5rem;
  }
  /* the albums' tree's rows (sidebar/album-tree.svelte), measure for measure */
  .ws-tree,
  .ws-tree-group {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ws-tree {
    padding-block: 2px 6px;
  }
  .ws-tree-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 2rem;
    margin-inline: 0.75rem;
    padding-inline: calc(1.25rem + var(--depth) * 1rem) 0.5rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
  }
  .ws-tree-row:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-tree-row[data-active='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-tree-toggle {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  button.ws-tree-toggle:hover {
    color: var(--immich-ui-dark);
  }
  .ws-tree-row[data-active='true'] .ws-tree-toggle {
    color: inherit;
  }
  .ws-tree-link {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding-block: 0.3rem;
    color: inherit;
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ws-tree-link :global(.ws-tree-icon) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-tree-row[data-active='true'] .ws-tree-link :global(.ws-tree-icon) {
    color: inherit;
  }
  .ws-tree-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-tree-toggle:focus-visible,
  .ws-tree-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
    border-radius: var(--ws-radius);
  }
</style>
