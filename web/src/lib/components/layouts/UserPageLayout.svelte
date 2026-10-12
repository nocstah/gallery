<script lang="ts" module>
  export const headerId = 'user-page-header';
</script>

<script lang="ts">
  import { useActions, type ActionArray } from '$lib/actions/use-actions';
  import NavigationBar from '$lib/components/shared-components/navigation-bar/NavigationBar.svelte';
  import UserSidebar from '$lib/components/shared-components/side-bar/UserSidebar.svelte';
  import { shortcuts } from '$lib/actions/shortcut';
  import { sidebarMedia } from '$lib/stores/sidebar-media.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import type { HeaderButtonActionItem } from '$lib/types';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { Button, ContextMenuButton, HStack, isMenuItemType, type MenuItemType } from '@immich/ui';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    hideNavbar?: boolean;
    /** Local Omarchy layer: the page's selection bar fits the navbar's 4rem, so swapping them moves nothing */
    barFitsNavbar?: boolean;
    /** Local Omarchy layer: keep the slim 4rem title bar instead of the display masthead (the map fills the page) */
    slimHeader?: boolean;
    title?: string | undefined;
    description?: string | undefined;
    scrollbar?: boolean;
    use?: ActionArray;
    actions?: Array<HeaderButtonActionItem | MenuItemType>;
    leading?: Snippet;
    descriptionTrailing?: Snippet;
    sidebar?: Snippet;
    buttons?: Snippet;
    children?: Snippet;
  }

  let {
    hideNavbar = false,
    barFitsNavbar = false,
    slimHeader = false,
    title = undefined,
    description = undefined,
    scrollbar = true,
    use = [],
    actions = [],
    leading,
    descriptionTrailing,
    sidebar,
    buttons,
    children,
  }: Props = $props();

  const enabledActions = $derived(
    actions
      .filter((action): action is HeaderButtonActionItem => !isMenuItemType(action))
      .filter((action) => action.$if?.() ?? true),
  );

  let scrollbarClass = $derived(scrollbar ? 'immich-scrollbar' : 'scrollbar-hidden');
  let hasHeaderRow = $derived(!hideNavbar && !!(title || buttons));

  // /tags and /folders supply a tree explorer wrapping upstream Sidebar.svelte, which is
  // always 16rem above 850px. Collapsing their grid column to the rail width would clip it,
  // and a tag tree has no meaningful icon-only form, so those pages opt out of the rail.
  const sidebarWidth = $derived.by(() => {
    if (sidebar) {
      return sidebarModeStore.layout === 'overlay' ? '0' : 'expanded';
    }
    const layout = sidebarModeStore.layout;
    return layout === 'overlay' || layout === 'hidden' ? '0' : layout;
  });

  // Local Omarchy layer: Ctrl+B hides and shows the sidebar, like the navbar's menu button (not on the tag and folder
  // pages, whose tree is their navigation, nor below 850px, where the sidebar is an overlay anyway)
  const sidebarShortcuts = $derived(
    !sidebar && sidebarMedia.isFullSidebar
      ? [{ shortcut: { key: 'b', ctrl: true }, onShortcut: () => sidebarModeStore.toggleHidden() }]
      : [],
  );

  const sidebarWidthValue = $derived(
    { '0': '0px', rail: 'calc(var(--spacing) * 20)', expanded: 'calc(var(--spacing) * 64)' }[sidebarWidth],
  );
</script>

<svelte:document use:shortcuts={sidebarShortcuts} />

<header>
  {#if !hideNavbar}
    <NavigationBar onUploadClick={() => openFileUploadDialog()} railAware={!sidebar} />
  {/if}
</header>
<!-- The two height sources are not interchangeable: with a navbar the grid sits *below* a real
     4rem element, so it subtracts --navbar-height; with `hideNavbar` the page floats an 80px
     ControlAppBar over itself instead and pads by --control-bar-height to clear it.

     The reserve gets the content panel's 8px chrome gutter added to it. The panel drops its top
     margin so the navbar can own that gutter and centre its search field in the band the two of
     them form (see --navbar-height), but a hidden navbar owns nothing - the reserve is all that
     stands between the panel and an 80px bar it would otherwise slide under, since the reserve
     is 76px and only ever cleared the bar with the panel's margin on top of it. The literal
     matches the gutter in gallery-theme.css; --control-bar-height itself cannot absorb it,
     because the album, person, partner and shared-link viewers spend it on full-bleed <main>
     elements that never had the margin. -->
<div
  tabindex="-1"
  data-testid="user-page-grid"
  data-sidebar-width={sidebarWidth}
  style:--sidebar-width={sidebarWidthValue}
  class="relative z-0 grid grid-cols-[var(--sidebar-width)_auto] overflow-hidden
    {hideNavbar ? 'h-dvh' : 'h-[calc(100dvh-var(--navbar-height))] max-md:h-[calc(100dvh-var(--navbar-height-md))]'}
    {hideNavbar && barFitsNavbar ? 'pt-(--navbar-height) max-md:pt-(--navbar-height-md)' : ''}
    {hideNavbar && !barFitsNavbar ? 'pt-[calc(var(--control-bar-height)+8px)]' : ''}
    {hideNavbar && !barFitsNavbar ? 'max-md:pt-[calc(var(--control-bar-height-md)+8px)]' : ''}"
>
  {#if sidebar}
    {@render sidebar()}
  {:else}
    <UserSidebar />
  {/if}

  <!-- Local Omarchy layer: the page head is the masthead (ws-page-head, omarchy-world.css), the AI inbox's display
       title on every page, with the page's tools beside it or on a row of their own beneath. It sits above the
       scroller in a column instead of floating over a fixed 4rem gap, so it can grow to the title and wrap. -->
  <main class="relative flex min-h-0 min-w-0 flex-col">
    {#if hasHeaderRow}
      <div class="ws-page-head text-dark" class:is-slim={slimHeader}>
        <div class="ws-page-title-row" data-testid="page-header-title-row">
          {@render leading?.()}
          {#if title}
            <h1 class="ws-page-title outline-none" tabindex="-1" id={headerId} data-testid="page-header">
              {title}
            </h1>
          {/if}
          {#if description}
            <p class="ws-page-count" data-testid="page-header-description">
              {description}
            </p>
          {/if}
          {#if descriptionTrailing}
            <div class="shrink-0" data-testid="page-header-description-trailing">
              {@render descriptionTrailing()}
            </div>
          {/if}
        </div>

        {#if buttons || enabledActions.length > 0}
          <div class="ws-page-tools">
            {@render buttons?.()}

            {#if enabledActions.length > 0}
              <div class="hidden md:block">
                <HStack gap={0}>
                  {#each enabledActions as action, i (i)}
                    <Button
                      variant="ghost"
                      size="small"
                      color={action.color ?? 'secondary'}
                      leadingIcon={action.icon}
                      onclick={(event: MouseEvent) => action.onAction({ event, action })}
                      title={action.data?.title}
                    >
                      {action.title}
                    </Button>
                  {/each}
                </HStack>
              </div>

              <ContextMenuButton aria-label={$t('open')} items={actions} class="md:hidden" />
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div class="{scrollbarClass} ws-page-scroll relative min-h-0 w-full flex-1 overflow-y-auto p-2" use:useActions={use}>
      {@render children?.()}
    </div>
  </main>
</div>
