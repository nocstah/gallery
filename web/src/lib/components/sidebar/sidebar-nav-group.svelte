<script lang="ts">
  import { page } from '$app/state';
  import { sidebarGroupsClosed } from '$lib/stores/preferences.store';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { generateId } from '$lib/utils/generate-id';
  import { Icon, NavbarGroup } from '@immich/ui';
  import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    title: string;
    /** Local Omarchy layer: the sidebar's first heading, which the sidebar's own top padding already sets off */
    first?: boolean;
    /**
     * Local Omarchy layer: a group the person can fold away under its heading (Manage, Hidden and deleted), by this
     * name in what the browser remembers; open until folded. Its rows are the children.
     */
    collapse?: string;
    /** the pages the group's rows open: while one is on screen its row shows, the group folded or not */
    holds?: string[];
    children?: Snippet;
  }

  let { title, first = false, collapse, holds = [], children }: Props = $props();

  const padding = $derived(first ? 'pt-0 pb-1.5' : 'pt-5 pb-1.5');

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);

  // Local Omarchy layer: folded by hand (remembered), but never over what is on screen: a page of the group shows its
  // rows until it is folded on that page too, like the album tree's folders. Open by default.
  const rowsId = `sidebar-group-${generateId()}`;
  const folded = $derived(!!collapse && !!$sidebarGroupsClosed[collapse]);
  const onPage = $derived(holds.some((path) => page.url.pathname === path || page.url.pathname.startsWith(`${path}/`)));
  let tucked = $state(false);
  const open = $derived(!folded || (onPage && !tucked));
  const toggle = () => {
    if (!collapse) {
      return;
    }
    const fold = open;
    tucked = fold;
    sidebarGroupsClosed.update((closed) => ({ ...closed, [collapse]: fold }));
  };
</script>

<!-- Local Omarchy layer: a group's title is a heading of the sidebar's (level 2, under the page's h1 in the bar), so a
     screen reader can move by the groups; in the rail, where the words give way to a rule, the heading stays for it.
     It sits close over its own rows, with the room above it (upstream's 24px above and below left it floating between
     two groups, and with four groups pushed Trash below the AORUS's fold) -->
{#if collapse}
  <!-- Local Omarchy layer: a group that folds: its heading holds the button that folds and unfolds it (WAI-ARIA's
       accordion: a heading around a button that says whether it is open). The button stays one element in the rail and
       the open sidebar, so the focus stays on it when the rail opens under it -->
  <div class="relative">
    <div role="heading" aria-level={2} class={collapsed ? 'sr-only' : undefined}>
      <button
        type="button"
        class="ws-group-toggle {padding}"
        aria-expanded={open}
        aria-controls={rowsId}
        title={$t(open ? 'collapse_named' : 'expand_named', { values: { name: title } })}
        data-testid="sidebar-group-toggle-{collapse}"
        onclick={toggle}
      >
        <span class="text-xs">{title}</span>
        <Icon icon={open ? mdiChevronDown : mdiChevronRight} size="1rem" class="ws-group-chevron" aria-hidden={true} />
      </button>
    </div>
    {#if collapsed}
      <div class="invisible" aria-hidden="true"><NavbarGroup {title} size="tiny" class={padding} /></div>
      <hr data-testid="sidebar-group-divider" class="absolute inset-x-0 top-1/2 mx-3 border-subtle" />
    {/if}
  </div>
  <div id={rowsId} class="flex flex-col gap-1" data-testid="sidebar-group-rows-{collapse}">
    {#if open}
      {@render children?.()}
    {/if}
  </div>
{:else if collapsed}
  <!-- A text heading is unreadable at 5rem, so the group boundary becomes a rule - the same
       treatment Google Photos uses in its rail. The heading itself stays mounted, hidden, to
       reserve its height: swapping it for a bare rule made the group boundary 47px shorter
       than in the expanded sidebar, so every row below it jumped that far when the rail
       collapsed and back again on hover. Reserving via the real component rather than a
       hard-coded height keeps the two in step if @immich/ui restyles NavbarGroup. -->
  <div class="relative">
    <div class="sr-only" role="heading" aria-level={2}>{title}</div>
    <div class="invisible" aria-hidden="true"><NavbarGroup {title} size="tiny" class={padding} /></div>
    <hr data-testid="sidebar-group-divider" class="absolute inset-x-0 top-1/2 mx-3 border-subtle" />
  </div>
{:else}
  <div role="heading" aria-level={2}><NavbarGroup {title} size="tiny" class={padding} /></div>
{/if}

<style>
  /* the heading's own line, as wide as the sidebar's rows: its words where every heading's stand (NavbarGroup's ps-6),
     a muted chevron at the row's end where the counts end; pointing at it raises the chevron to ink */
  .ws-group-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: calc(100% - 1.5rem);
    margin-inline: 0.75rem;
    padding-inline: 0.75rem 1rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    text-align: start;
  }
  .ws-group-toggle :global(.ws-group-chevron) {
    color: var(--immich-ui-muted);
  }
  .ws-group-toggle:hover :global(.ws-group-chevron) {
    color: var(--immich-ui-dark);
  }
  .ws-group-toggle:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
</style>
