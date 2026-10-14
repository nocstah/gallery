<script lang="ts">
  // Local Omarchy layer (plan A): the public links, the last row under Shared, laid out like the Spaces above it
  import { page } from '$app/state';
  import { Route } from '$lib/route';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { Icon } from '@immich/ui';
  import { mdiLinkVariant } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
  const active = $derived(page.url.pathname.startsWith(Route.sharedLinks()));
</script>

<a
  href={Route.sharedLinks()}
  title={collapsed ? $t('shared_links') : undefined}
  aria-current={active ? 'page' : undefined}
  data-active={String(active)}
  data-testid="sidebar-shared-links"
  class="flex place-items-center gap-4 rounded-e-full py-3 transition-[padding,margin,width] delay-100 duration-100 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary {collapsed
    ? 'ms-4 w-12 ps-3'
    : 'mx-3 w-[calc(100%-1.5rem)] ps-12 md:pe-4'}"
>
  <div class="flex size-6 items-center justify-center">
    <Icon icon={mdiLinkVariant} size="1.25em" aria-hidden={true} />
  </div>
  <div class="truncate text-sm font-medium" class:grow={!collapsed} class:w-0={collapsed} class:opacity-0={collapsed}>
    {$t('shared_links')}
  </div>
</a>
