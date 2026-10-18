<script lang="ts">
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { NavbarGroup } from '@immich/ui';

  interface Props {
    title: string;
    /** Local Omarchy layer: the sidebar's first heading, which the sidebar's own top padding already sets off */
    first?: boolean;
  }

  let { title, first = false }: Props = $props();

  const padding = $derived(first ? 'pt-0 pb-1.5' : 'pt-5 pb-1.5');

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
</script>

<!-- Local Omarchy layer: a group's title is a heading of the sidebar's (level 2, under the page's h1 in the bar), so a
     screen reader can move by the groups; in the rail, where the words give way to a rule, the heading stays for it.
     It sits close over its own rows, with the room above it (upstream's 24px above and below left it floating between
     two groups, and with four groups pushed Trash below the AORUS's fold) -->
{#if collapsed}
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
