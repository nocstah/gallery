<script lang="ts">
  import { page } from '$app/state';
  import SidebarNavGroup from '$lib/components/sidebar/sidebar-nav-group.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { Icon } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { canSwitchLibraries, switcherRows } from './switcher';

  // Local Omarchy layer: the Libraries switcher, a group of its own after the one that holds the Vaults launcher: every
  // library with its colour, this one marked as the sidebar marks what is open (inverted). Another library is a plain
  // link to its own address, a full navigation in this tab (SidebarNavItem's Link would open another origin in a new
  // tab), so the rows are drawn here with SidebarNavItem's own classes, and the sidebar's styles find them.
  let userAgent = $state('');
  onMount(() => {
    userAgent = navigator.userAgent;
  });
  const shown = $derived(canSwitchLibraries(page.url, userAgent));
  const rows = $derived(shown ? switcherRows() : []);
  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);

  // a square of the library's colour, in an icon's box so it sits where the other rows' icons sit
  const SWATCH = 'M6,6H18V18H6Z';

  const linkClass = (current: boolean) =>
    [
      'hover:bg-subtle hover:text-primary flex place-items-center gap-4 rounded-e-full py-3 transition-[padding,margin,width] delay-100 duration-100',
      'rounded-xs outline-primary outline-offset-1 focus-visible:outline-2',
      collapsed ? 'ms-4 w-12' : 'mx-3 w-[calc(100%-1.5rem)]',
      collapsed ? 'ps-[0.8125rem]' : 'ps-7',
      current ? 'bg-primary/10 text-primary' : '',
    ]
      .filter(Boolean)
      .join(' ');
</script>

{#if rows.length > 0}
  <SidebarNavGroup title={$t('sidebar_libraries')} />
  {#each rows as row (row.id)}
    <div class="relative flex items-center">
      <a
        href={row.href}
        class={linkClass(row.current)}
        draggable="false"
        data-active={String(row.current)}
        data-collapsed={String(collapsed)}
        data-testid="library-row"
        title={collapsed ? row.name : undefined}
        aria-current={row.current ? 'true' : undefined}
        rel={row.current ? undefined : 'noreferrer'}
      >
        <Icon icon={SWATCH} size="1.375em" color={row.colour} class="shrink-0" aria-hidden={true} />
        <span
          class="truncate text-sm font-medium transition-all duration-200 motion-reduce:transition-none"
          class:w-0={collapsed}
          class:opacity-0={collapsed}
        >
          {row.name}
        </span>
      </a>
    </div>
  {/each}
{/if}
