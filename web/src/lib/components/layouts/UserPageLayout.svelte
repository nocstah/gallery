<script lang="ts" module>
  export const headerId = 'user-page-header';
</script>

<script lang="ts">
  import { useActions, type ActionArray } from '$lib/actions/use-actions';
  import OmarchyBar from '$lib/components/omarchy/OmarchyBar.svelte';
  import TimelineMonthHeading from '$lib/components/timeline/TimelineMonthHeading.svelte';
  import { barSlot } from '$lib/managers/bar-slot.svelte';
  import { monthInView, timelineHeading } from '$lib/managers/timeline-heading.svelte';
  import UserSidebar from '$lib/components/shared-components/side-bar/UserSidebar.svelte';
  import { shortcuts } from '$lib/actions/shortcut';
  import { sidebarMedia } from '$lib/stores/sidebar-media.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import type { HeaderButtonActionItem } from '$lib/types';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { getTabbable } from '$lib/utils/focus-util';
  import { generateId } from '$lib/utils/generate-id';
  import {
    countPageControls,
    foldsPageButtons,
    keepsSheetOpen,
    PAGE_FIT_FOLD,
    POPUP,
    POPUP_CHOICE,
    sheetOffset,
    tightensFurther,
  } from '$lib/utils/page-bar-fit';
  import { Button, ContextMenuButton, HStack, Icon, isMenuItemType, type MenuItemType } from '@immich/ui';
  import { mdiDotsVertical } from '@mdi/js';
  import { tick, untrack, type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    hideNavbar?: boolean;
    /** Local Omarchy layer: the page's selection bar fits the navbar's 4rem, so swapping them moves nothing */
    barFitsNavbar?: boolean;
    title?: string | undefined;
    /**
     * Local Omarchy layer: the page heads its body with its name as a poster (the AI inbox, Command center): the bar
     * leaves the name to it, and carries it only on a phone, where the poster gives way (styles/omarchy-world.css)
     */
    titleInBody?: boolean;
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
    titleInBody = false,
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
  const titleInBar = $derived(!!title && (!titleInBody || mediaQueryManager.isPhone));
  let hasHeaderRow = $derived(titleInBar || !!buttons);
  // Local Omarchy layer: the page's title row lives in the one bar (OmarchyBar, through the bar slot), so the content
  // starts at the top of the panel instead of under a second 64px bar
  let hasTitleClass = 'top-0 h-full';

  // The title row always fits the bar: the title keeps its width and the page's own buttons tighten a step at a time
  // until the row fits (utils/page-bar-fit): 1 drops the description, 2 the button labels (icons keep their tooltips),
  // 3 the wide-screen extras (an album search field, filter tabs) and the month in view, 4 folds the buttons into one
  // ⋮ whose sheet lists them with their labels, where that takes more than one control off the bar. A title row that
  // crowds its own room (the name squeezed by its dates) counts as not fitting too, so the fold comes before the name
  // is cut. Re-fitted when the bar resizes or the page adds or removes a control, never by its own steps (they only
  // flip attributes, and the fold moves nothing: the buttons stay where they are rendered, the sheet is their box
  // drawn under the ⋮), so fitting cannot feed itself.
  const PAGE_TIGHTEST = PAGE_FIT_FOLD;
  let pageTitleBox = $state<HTMLElement>();
  const crowded = (box: HTMLElement | undefined) => !!box && box.scrollWidth > box.clientWidth + 1;
  // a name cut short inside its own room (the title shrinks rather than overflow) is crowding too
  const squeezed = (box: HTMLElement | undefined) =>
    !!box && [...box.children].some((child) => child.scrollWidth > child.clientWidth + 1);
  let pageFit = $state(0);
  let pageFitting = false;
  // how many controls the page's own buttons show, counted while they stand in the bar, and the room they take there
  // at the step before the fold (rem)
  let pageControls = $state(0);
  let pageActionsWidth = $state(0);
  // a segmented control beside the title (a Space's sections) gives way first, so the row is not capped for it
  let segmentedTitle = $state(false);
  const folded = $derived(foldsPageButtons(pageFit, pageControls, pageActionsWidth));
  // the title row's share of the bar is capped while the page's own buttons share it, so they tighten before the name
  // is cut; nothing caps it on a page without buttons, at the fold (the buttons are one ⋮ then) or beside a
  // segmented control
  const capped = $derived(pageControls > 0 && pageFit < PAGE_TIGHTEST && !segmentedTitle);
  // Local Omarchy layer: the month in view of the page's timeline (Favorites, an album, a person, Archive, a Space's
  // photos...), kept at the end of the title row as Photos keeps its own heading: muted behind a hairline, the short
  // month name once the description has gone, and gone itself with the wide-screen extras
  const headingSource = $derived(timelineHeading.current);
  const headingMonth = $derived(
    headingSource ? monthInView(headingSource.timelineManager, headingSource.month) : undefined,
  );
  const hasHeading = $derived(!!headingMonth);
  let pageBarBox = $state<HTMLElement>();
  let pageToolsBox = $state<HTMLElement>();
  let pageActionsBox = $state<HTMLElement>();
  const refitPage = async () => {
    if (!pageBarBox || pageFitting) {
      return;
    }
    pageFitting = true;
    try {
      pageFit = 0;
      await tick();
      pageControls = pageActionsBox ? countPageControls(pageActionsBox) : 0;
      segmentedTitle = !!pageTitleBox?.querySelector('.ws-seg');
      await tick();
      while (tightensFurther(pageFit, crowded(pageBarBox) || crowded(pageTitleBox) || squeezed(pageTitleBox))) {
        if (pageFit === PAGE_TIGHTEST - 1 && pageActionsBox) {
          const rem = Number(getComputedStyle(document.documentElement).fontSize.replace('px', '')) || 16;
          pageActionsWidth = pageActionsBox.getBoundingClientRect().width / rem;
        }
        pageFit++;
        await tick();
      }
    } finally {
      pageFitting = false;
    }
    if (!folded) {
      sheetOpen = false;
    } else if (sheetOpen) {
      showSheet();
    }
  };
  $effect(() => {
    void title;
    void titleInBar;
    void description;
    void hasHeading;
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

  // Local Omarchy layer: the fold's sheet, under the bar's ⋮ like the View menu's. It opens on a click (on Enter or
  // Space with the first control focused); a press on one of its buttons or a choice in a menu or list one of them
  // opened, a click outside, Escape or the focus moving on closes it, and the ⋮ takes the focus back where the sheet
  // had it
  const sheetId = `page-tools-${generateId()}`;
  let sheetOpen = $state(false);
  const sheetShown = $derived(folded && sheetOpen);
  let foldButton = $state<HTMLButtonElement>();
  let sheetLeft = $state<number>();
  // an icon alone shows its name beside it in the sheet (its aria-label, drawn by the styles below)
  const labelIcons = () => {
    for (const control of pageActionsBox?.querySelectorAll<HTMLElement>('button, a[href]') ?? []) {
      const label =
        control.closest('[role="menu"]') || control.textContent?.trim() ? null : control.getAttribute('aria-label');
      if (label) {
        control.dataset.foldLabel = label;
      } else {
        delete control.dataset.foldLabel;
      }
    }
  };
  const showSheet = () => {
    labelIcons();
    if (pageToolsBox && pageActionsBox) {
      const rtl = getComputedStyle(pageToolsBox).direction === 'rtl';
      const anchor = pageToolsBox.getBoundingClientRect();
      sheetLeft = sheetOffset(anchor, pageActionsBox.offsetWidth, innerWidth, rtl);
    }
  };
  const openSheet = async (fromKeyboard: boolean) => {
    sheetOpen = true;
    await tick();
    showSheet();
    if (fromKeyboard && pageActionsBox) {
      getTabbable(pageActionsBox)[0]?.focus();
    }
  };
  const closeSheet = (refocus: boolean) => {
    if (!sheetOpen) {
      return;
    }
    const focus = document.activeElement;
    sheetOpen = false;
    // not from where an action took it (a dialog it opened)
    if (refocus && (!focus || focus === document.body || pageActionsBox?.contains(focus))) {
      foldButton?.focus();
    }
  };
  const onSheetClick = (event: MouseEvent) => {
    const control = (event.target as Element | null)?.closest('button, a[href], input, select, textarea, label');
    if (sheetShown && control && !keepsSheetOpen(control)) {
      closeSheet(true);
    }
  };
  const onSheetFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (
      sheetShown &&
      next instanceof Element &&
      !pageActionsBox?.contains(next) &&
      !foldButton?.contains(next) &&
      !next.closest(POPUP)
    ) {
      closeSheet(false);
    }
  };
  $effect(() => {
    if (!sheetShown) {
      return;
    }
    // a press outside closes it, but not one in a menu or list a control of the sheet opened at the end of <body> (a
    // select's options): a choice there closes it once the choice has run
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!pageActionsBox?.contains(target) && !foldButton?.contains(target) && !target?.closest?.(POPUP)) {
        closeSheet(false);
      }
    };
    const chosen = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!pageActionsBox?.contains(target) && target?.closest?.(POPUP_CHOICE)) {
        setTimeout(() => closeSheet(true), 0);
      }
    };
    // Escape closes the sheet before the page hears it (an album's Escape goes back to Albums); a menu or list of its
    // own, open with the focus in it, closes first
    const escape = (event: KeyboardEvent) => {
      const focus = document.activeElement;
      if (
        event.key !== 'Escape' ||
        focus?.closest(POPUP) ||
        (pageActionsBox?.contains(focus) && pageActionsBox.querySelector('[aria-expanded="true"]'))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeSheet(true);
    };
    addEventListener('pointerdown', outside, { capture: true });
    addEventListener('click', chosen, { capture: true });
    addEventListener('keydown', escape, { capture: true });
    return () => {
      removeEventListener('pointerdown', outside, { capture: true });
      removeEventListener('click', chosen, { capture: true });
      removeEventListener('keydown', escape, { capture: true });
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
     at the end. In a tight bar the buttons drop their labels (icons keep their tooltips), the wide-screen extras go,
     and at the last they fold into the ⋮ -->
{#snippet pageBar()}
  <div
    class="ws-page-bar"
    data-fit={pageFit}
    data-capped={capped ? '' : undefined}
    data-fold={folded ? '' : undefined}
    data-open={sheetShown ? '' : undefined}
    bind:this={pageBarBox}
  >
    <!-- upstream's title row (title, description, its trailing control) and its constraints, kept as they were -->
    <div
      class="ws-page-bar-title min-w-0 overflow-hidden"
      data-testid="page-header-title-row"
      data-now={headingMonth ? '' : undefined}
      bind:this={pageTitleBox}
    >
      {@render leading?.()}
      {#if titleInBar}
        <div class="ws-page-title min-w-0 truncate" tabindex="-1" id={headerId} data-testid="page-header">{title}</div>
      {/if}
      {#if description}
        <p class="ws-page-description shrink-0 whitespace-nowrap" data-testid="page-header-description">
          {description}
        </p>
      {/if}
      {#if descriptionTrailing}
        <div class="ws-page-trailing shrink-0" data-testid="page-header-description-trailing">
          {@render descriptionTrailing()}
        </div>
      {/if}
      {#if headingMonth}
        <!-- Local Omarchy layer: in the title row, so it stands on the title's baseline (a back button sets that low) -->
        <div class="ws-page-now">
          <TimelineMonthHeading month={headingMonth} onGrouping={headingSource?.onGrouping} short={pageFit > 0} quiet />
        </div>
      {/if}
    </div>

    <div class="ws-page-tools" bind:this={pageToolsBox}>
      <!-- the fold: the page's own buttons behind one ⋮ in the bar's icons' language, shown at the tightest step -->
      <button
        type="button"
        class="ws-bar-icon ws-page-fold"
        aria-label={$t('more')}
        title={$t('more')}
        aria-haspopup="true"
        aria-expanded={sheetShown}
        aria-controls={sheetId}
        data-testid="page-fold"
        bind:this={foldButton}
        onclick={(event) => (sheetOpen ? closeSheet(false) : openSheet(event.detail === 0))}
      >
        <Icon icon={mdiDotsVertical} size="20" />
      </button>
      <!-- the page's buttons are rendered once, here: inline in the bar, or (folded) drawn as the sheet under the ⋮ -->
      <div
        class="ws-page-actions"
        id={sheetId}
        role={folded ? 'group' : undefined}
        aria-label={folded ? $t('more') : undefined}
        data-testid="page-actions"
        style:left={sheetShown && sheetLeft !== undefined ? `${sheetLeft}px` : undefined}
        style:right={sheetShown && sheetLeft !== undefined ? 'auto' : undefined}
        bind:this={pageActionsBox}
        onclick={onSheetClick}
        onfocusout={onSheetFocusOut}
      >
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
    <div
      class="{scrollbarClass} absolute {hasTitleClass} w-full overflow-y-auto p-2"
      data-title-in-bar={titleInBody && titleInBar ? '' : undefined}
      use:useActions={use}
    >
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
  /* the title row takes the room it needs, the name shrinking inside it only at the last; while the page's own buttons
     share the bar its share is capped (refitPage), so they tighten before the name is cut */
  .ws-page-bar-title {
    display: flex;
    flex: 0 1 auto;
    gap: 0.6rem;
    align-items: baseline;
    min-width: 0;
  }
  .ws-page-bar[data-capped] .ws-page-bar-title {
    flex: none;
    max-width: 45%;
  }
  /* the month in view is the title row's last item: while it shows, the row's share of the bar grows by its room (the
     long month name, then the short one), so the title keeps what it had */
  .ws-page-bar[data-capped][data-fit='0'] .ws-page-bar-title[data-now] {
    max-width: calc(45% + 11rem);
  }
  .ws-page-bar[data-capped]:is([data-fit='1'], [data-fit='2']) .ws-page-bar-title[data-now] {
    max-width: calc(45% + 6rem);
  }
  /* a segmented control beside the title (a Space's sections) scrolls sideways before it crowds the name: it gives
     way first, down to about a section (it keeps the one on screen in view). Flex shares a shrink out by weight, so
     its weight is high enough that the name's share stays under a pixel's fraction: any share at all cut it */
  .ws-page-trailing:has(:global(.ws-seg)) {
    flex: 0 100000 auto;
    min-width: 3.5rem;
  }
  @media (max-width: 639px) {
    .ws-page-bar {
      gap: 0.25rem;
    }
    .ws-page-bar-title {
      gap: 0.375rem;
    }
    .ws-page-bar[data-capped] .ws-page-bar-title {
      max-width: 60%;
    }
    .ws-page-bar[data-capped]:is([data-fit='0'], [data-fit='1'], [data-fit='2']) .ws-page-bar-title[data-now] {
      max-width: calc(60% + 6rem);
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
  .ws-page-tools {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
  }
  .ws-page-actions {
    display: flex;
    flex: none;
    gap: 0.25rem;
    align-items: center;
  }
  /* the month in view of the page's timeline ends the title row behind a hairline, on the title's baseline */
  .ws-page-now {
    display: flex;
    flex: none;
    padding-block: 0.125rem;
    padding-inline-start: 0.75rem;
    margin-inline-start: 0.15rem;
    border-inline-start: 1px solid var(--ws-hairline);
  }
  .ws-page-bar:is([data-fit='3'], [data-fit='4']) .ws-page-now {
    display: none;
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
  .ws-page-bar:is([data-fit='2'], [data-fit='3'], [data-fit='4']):not([data-fold])
    .ws-page-actions
    :global(:is(button, a) :is([class~='sm:block'], [class~='md:block'], [class~='lg:block'], .ws-action-label)) {
    display: none;
  }
  .ws-page-bar:is([data-fit='3'], [data-fit='4']):not([data-fold])
    .ws-page-actions
    :global(:is([class~='xl:block'], [class~='xl:flex'])) {
    display: none;
  }
  /* a label upstream left bare in its button (People's Show & hide people) goes the same way, and on a phone every
     button with an icon is its icon from the start (Spaces' Create Space): the words stay in the accessibility tree */
  .ws-page-bar:is([data-fit='2'], [data-fit='3'], [data-fit='4']):not([data-fold])
    .ws-page-actions
    :global(:is(button, a):has(svg):not(.ws-search-field *, .ws-seg *, [role='tablist'] *)) {
    gap: 0;
    font-size: 0;
  }
  @media (max-width: 639px) {
    .ws-page-bar:not([data-fold])
      .ws-page-actions
      :global(:is(button, a):has(svg):not(.ws-search-field *, .ws-seg *, [role='tablist'] *)) {
      gap: 0;
      font-size: 0;
    }
  }

  /* ---- the fold (the tightest step): the page's own buttons behind one ⋮, the bar's own icon; the sheet under it is
     their box, drawn like the View menu's: one frame on the ground, the theme's corners, the popup shadow, rows ---- */
  .ws-page-fold {
    display: none;
  }
  .ws-page-bar[data-fold] .ws-page-fold {
    display: grid;
  }
  .ws-page-bar[data-fold] .ws-page-actions {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 60;
    display: none;
    flex-direction: column;
    align-items: stretch;
    width: max-content;
    min-width: 13rem;
    max-width: min(20rem, calc(100vw - 1rem));
    padding: 6px;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
  }
  .ws-page-bar[data-fold][data-open] .ws-page-actions {
    display: flex;
  }
  /* the page's own wrappers lay their controls out as one list (a wrapper upstream hides at this width stays hidden) */
  .ws-page-bar[data-fold]
    .ws-page-actions
    :global(
      :is(div, span):not(
        .fixed,
        .absolute,
        .ws-search-field,
        .ws-seg,
        fieldset,
        :is(.fixed, .absolute, .ws-search-field, .ws-seg, fieldset, button, a, [role='menu']) *
      )
    ) {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    width: 100%;
  }
  .ws-page-bar[data-fold]
    .ws-page-actions
    :global(
      :is(div, span):not(
        .hidden,
        .fixed,
        .absolute,
        .ws-search-field,
        .ws-seg,
        fieldset,
        :is(.fixed, .absolute, .ws-search-field, .ws-seg, fieldset, button, a, [role='menu']) *
      )
    ) {
    display: flex;
  }
  .ws-page-bar[data-fold] .ws-page-actions :global(:has(> .ws-search-field)) {
    margin-inline: 0;
  }
  /* a row: the icon, then the label the bar dropped (an icon alone shows its name, labelIcons) */
  .ws-page-bar[data-fold]
    .ws-page-actions
    :global(:is(button, a):not(:is(.fixed, .absolute, .ws-search-field, .ws-seg, fieldset, [role='menu']) *)) {
    justify-content: flex-start;
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: 2.1rem;
    padding: 0.3rem 0.55rem;
    gap: 0.6rem;
    font-size: var(--ws-text-meta);
    font-weight: 500;
    text-align: start;
    white-space: nowrap;
  }
  .ws-page-bar[data-fold]
    .ws-page-actions
    :global(:is(button, a):not(:is(.fixed, .absolute, .ws-search-field, .ws-seg, fieldset, [role='menu']) *) svg) {
    flex: none;
    width: 16px;
    height: 16px;
  }
  .ws-page-bar[data-fold]
    .ws-page-actions
    :global(
      :is(button, a):not(
          .bg-primary,
          .bg-dark,
          .bg-danger,
          :is(.fixed, .absolute, .ws-search-field, .ws-seg, fieldset, [role='menu']) *
        ):not(:disabled):hover
    ) {
    background: color-mix(in oklab, var(--ws-accent) 16%, transparent);
  }
  .ws-page-bar[data-fold] .ws-page-actions :global(:is(button, a):focus-visible) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-page-bar[data-fold] .ws-page-actions :global([data-fold-label]::after) {
    content: attr(data-fold-label);
  }
  .ws-page-bar[data-fold]
    .ws-page-actions
    :global(:is(button, a) :is([class~='sm:block'], [class~='md:block'], [class~='lg:block'], .ws-action-label)) {
    display: block;
  }
  .ws-page-bar[data-fold] .ws-page-actions :global(:is(button, a) :is([class~='sm:inline'], [class~='md:inline'])) {
    display: inline;
  }
  @media (max-width: 639px) {
    .ws-page-fold {
      width: 2rem;
    }
  }
  @media (pointer: coarse) {
    .ws-page-bar[data-fold]
      .ws-page-actions
      :global(:is(button, a):not(:is(.fixed, .absolute, .ws-search-field, .ws-seg, fieldset, [role='menu']) *)) {
      min-height: 2.75rem;
    }
  }
</style>
