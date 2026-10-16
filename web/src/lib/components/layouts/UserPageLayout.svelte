<script lang="ts" module>
  export const headerId = 'user-page-header';
</script>

<script lang="ts">
  import { useActions, type ActionArray } from '$lib/actions/use-actions';
  import OmarchyBar from '$lib/components/omarchy/OmarchyBar.svelte';
  import { barSlot } from '$lib/managers/bar-slot.svelte';
  import UserSidebar from '$lib/components/shared-components/side-bar/UserSidebar.svelte';
  import { shortcuts } from '$lib/actions/shortcut';
  import { sidebarMedia } from '$lib/stores/sidebar-media.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import type { HeaderButtonActionItem } from '$lib/types';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { Button, ContextMenuButton, HStack, isMenuItemType, type MenuItemType } from '@immich/ui';
  import { tick, untrack, type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    hideNavbar?: boolean;
    /** Local Omarchy layer: the page's selection bar fits the navbar's 4rem, so swapping them moves nothing */
    barFitsNavbar?: boolean;
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
  let hasHeaderRow = $derived(!!(title || buttons));
  // Local Omarchy layer: the page's title row lives in the one bar (OmarchyBar, through the bar slot), so the content
  // starts at the top of the panel instead of under a second 64px bar
  let hasTitleClass = 'top-0 h-full';

  // The title row always fits the bar: the title keeps its width and the page's buttons tighten a step at a time until
  // the row fits: 1 drops the description, 2 the button labels (icons keep their tooltips), 3 the wide-screen extras
  // (an album search field, filter tabs), 4 (a phone) lets the page's own buttons scroll sideways rather than run under
  // the bar's icons. A title row that crowds its own room (the name squeezed by its dates) counts as not fitting too.
  // Re-fitted when the bar resizes or the page adds or removes a control, never by its own steps (they only flip an
  // attribute), so fitting cannot feed itself.
  const PAGE_TIGHTEST = 4;
  let pageTitleBox = $state<HTMLElement>();
  const crowded = (box: HTMLElement | undefined) => !!box && box.scrollWidth > box.clientWidth + 1;
  // a name cut short inside its own room (the title shrinks rather than overflow) is crowding too
  const squeezed = (box: HTMLElement | undefined) =>
    !!box && [...box.children].some((child) => child.scrollWidth > child.clientWidth + 1);
  let pageFit = $state(0);
  let pageFitting = false;
  let pageBarBox = $state<HTMLElement>();
  let pageActionsBox = $state<HTMLElement>();
  const refitPage = async () => {
    if (!pageBarBox || pageFitting) {
      return;
    }
    pageFitting = true;
    try {
      pageFit = 0;
      await tick();
      while (pageFit < PAGE_TIGHTEST && (crowded(pageBarBox) || crowded(pageTitleBox) || squeezed(pageTitleBox))) {
        pageFit++;
        await tick();
      }
    } finally {
      pageFitting = false;
    }
  };
  $effect(() => {
    void title;
    void description;
    if (!pageBarBox) {
      return;
    }
    const resized = new ResizeObserver(() => void untrack(refitPage));
    resized.observe(pageBarBox);
    const changed = new MutationObserver(() => void untrack(refitPage));
    if (pageActionsBox) {
      changed.observe(pageActionsBox, { childList: true, subtree: true, characterData: true });
    }
    void untrack(refitPage);
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  });
  $effect(() => {
    if (hideNavbar || !hasHeaderRow) {
      return;
    }
    barSlot.content = pageBar;
    return () => {
      if (barSlot.content === pageBar) {
        barSlot.content = undefined;
      }
    };
  });

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

<!-- Local Omarchy layer: the page's title row, set into the middle of the one bar: its leading control (a back
     button), the title in the bar's heading face, the description in mono, then the page's own buttons and actions
     at the end. In a tight bar the buttons drop their labels (icons keep their tooltips) and the wide-screen extras go -->
{#snippet pageBar()}
  <div class="ws-page-bar" data-fit={pageFit} bind:this={pageBarBox}>
    <!-- upstream's title row (title, description, its trailing control) and its constraints, kept as they were -->
    <div class="ws-page-bar-title min-w-0 overflow-hidden" data-testid="page-header-title-row" bind:this={pageTitleBox}>
      {@render leading?.()}
      {#if title}
        <div class="ws-page-title min-w-0 truncate" tabindex="-1" id={headerId} data-testid="page-header">{title}</div>
      {/if}
      {#if description}
        <p class="ws-page-description shrink-0 whitespace-nowrap" data-testid="page-header-description">
          {description}
        </p>
      {/if}
      {#if descriptionTrailing}
        <div class="shrink-0" data-testid="page-header-description-trailing">
          {@render descriptionTrailing()}
        </div>
      {/if}
    </div>

    <div class="ws-page-actions" bind:this={pageActionsBox}>
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
                title={action.data?.title ?? action.title}
              >
                <span class="ws-action-label">{action.title}</span>
              </Button>
            {/each}
          </HStack>
        </div>

        <ContextMenuButton aria-label={$t('open')} items={actions} class="md:hidden" />
      {/if}
    </div>
  </div>
{/snippet}

<header>
  {#if !hideNavbar}
    <!-- Local Omarchy layer: the one bar (upstream's NavigationBar stays for the admin shell) -->
    <OmarchyBar onUploadClick={() => openFileUploadDialog()} railAware={!sidebar} />
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

  <main class="relative">
    <div class="{scrollbarClass} absolute {hasTitleClass} w-full overflow-y-auto p-2" use:useActions={use}>
      {@render children?.()}
    </div>
  </main>
</div>

<style>
  .ws-page-bar {
    display: flex;
    flex: 1;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    height: 100%;
    padding-inline-end: 0.5rem;
  }
  .ws-page-bar-title {
    display: flex;
    flex: none;
    max-width: 45%;
    gap: 0.6rem;
    align-items: baseline;
    min-width: 0;
  }
  @media (max-width: 639px) {
    .ws-page-bar {
      gap: 0.25rem;
    }
    .ws-page-bar-title {
      max-width: 60%;
      gap: 0.375rem;
    }
    .ws-page-bar-title :global(button[class~='w-10']) {
      width: 2rem;
    }
    .ws-page-actions :global(:is(button, a):not(.ws-search-field *, .ws-seg *, [role='tablist'] *)) {
      min-width: 2rem;
      padding-inline: 0.375rem;
    }
    .ws-page-actions :global(button[class~='w-10']) {
      width: 2rem;
    }
  }
  .ws-page-title {
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--ws-text-bar);
    font-weight: 750;
    font-stretch: 75%;
    font-variation-settings:
      'wdth' 75,
      'opsz' 48;
    line-height: 1.15;
    letter-spacing: -0.025em;
    color: var(--immich-ui-dark);
    text-overflow: ellipsis;
    white-space: nowrap;
    outline: none;
  }
  .ws-page-description {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    white-space: nowrap;
  }
  .ws-page-actions {
    display: flex;
    flex: none;
    gap: 0.25rem;
    align-items: center;
  }
  /* the page's own controls take the desktop's corners in the bar */
  .ws-page-actions :global(:is(button, a, input, [class*='rounded'])) {
    border-radius: var(--ws-radius);
  }
  /* one rhythm for a page's own controls, as for the bar's icons: every button is 36px tall, its label or icon sits
     0.5rem inside its edge (an icon in its square, a label in its padding), and buttons stand 2px apart, so the glyphs
     step evenly however text and icon buttons mix (Albums mixed 16px-padded labels, bare 40px icon buttons and a gapless
     pair: 40, 33, 18 and 33px between neighbours) */
  .ws-page-actions,
  .ws-page-actions > :global(div),
  .ws-page-actions :global([class~='gap-0']) {
    gap: 2px;
  }
  .ws-page-actions :global(:is(button, a):not(.ws-search-field *, .ws-seg *, [role='tablist'] *)) {
    height: 2.25rem;
    min-width: 2.25rem;
    padding-inline: 0.5rem;
    gap: 0.375rem;
  }
  .ws-page-actions :global(:is(button, a):not(.ws-search-field *, .ws-seg *, [role='tablist'] *, [class~='w-10']) svg) {
    flex: none;
    width: 16px;
    height: 16px;
  }
  /* upstream pulls a title's trailing button back over the title's own pe-8 pad (-ms-6: the Map's filter toggle); the
     one bar's title has no such pad, so the pull laid the button over the word "Map" */
  .ws-page-bar :global([class~='-ms-6']) {
    margin-inline-start: 0.25rem;
  }
  .ws-page-bar[data-fit='4'] .ws-page-actions {
    flex: 0 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(to right, transparent, #000 0.75rem, #000 calc(100% - 0.75rem), transparent);
  }
  /* a field among the buttons is its own framed box: it stands a little apart from its neighbours */
  .ws-page-actions :global(:has(> .ws-search-field)) {
    margin-inline: 0.5rem;
  }
  .ws-page-actions :global([class~='h-10']) {
    height: 2.25rem;
  }
  /* icon-only buttons (the kit's IconButton, 40px with a 24px icon) are squares like the bar's icons: 36px with a 20px
     icon, which sits 8px in as a label does */
  .ws-page-actions :global(button[class~='w-10']) {
    width: 2.25rem;
    padding: 0;
  }
  .ws-page-actions :global(button[class~='w-10'] svg) {
    flex: none;
    width: 20px;
    height: 20px;
  }
  /* tightening steps (see refitPage) */
  .ws-page-bar:not([data-fit='0']) .ws-page-description {
    display: none;
  }
  .ws-page-bar:is([data-fit='2'], [data-fit='3'], [data-fit='4'])
    .ws-page-actions
    :global(:is(button, a) :is([class~='sm:block'], [class~='md:block'], [class~='lg:block'], .ws-action-label)) {
    display: none;
  }
  .ws-page-bar:is([data-fit='3'], [data-fit='4'])
    .ws-page-actions
    :global(:is([class~='xl:block'], [class~='xl:flex'])) {
    display: none;
  }
  /* a label upstream left bare in its button (People's Show & hide people) goes the same way, and on a phone every
     button with an icon is its icon from the start (Spaces' Create Space): the words stay in the accessibility tree */
  .ws-page-bar:is([data-fit='2'], [data-fit='3'], [data-fit='4'])
    .ws-page-actions
    :global(:is(button, a):has(svg):not(.ws-search-field *, .ws-seg *, [role='tablist'] *)) {
    gap: 0;
    font-size: 0;
  }
  @media (max-width: 639px) {
    .ws-page-actions :global(:is(button, a):has(svg):not(.ws-search-field *, .ws-seg *, [role='tablist'] *)) {
      gap: 0;
      font-size: 0;
    }
  }
</style>
