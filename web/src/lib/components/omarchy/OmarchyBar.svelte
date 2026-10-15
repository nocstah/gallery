<script lang="ts">
  // Local Omarchy layer: the one bar. User pages get this in place of upstream's NavigationBar (which stays for the
  // admin shell): the menu and the mark on the left; the page's own content in the middle (Photos: its month heading
  // and time ruler, lib/managers/bar-slot); and on the right search (an icon that opens into the search field), undo
  // (the recent actions that can be taken back), the view menu, upload, notifications and the account. One 64px row, so the photos start right under it.
  import { page } from '$app/state';
  import { clickOutside } from '$lib/actions/click-outside';
  import BarSearch from '$lib/components/omarchy/BarSearch.svelte';
  import BarUndo from '$lib/components/omarchy/BarUndo.svelte';
  import BarViewMenu from '$lib/components/omarchy/BarViewMenu.svelte';
  import Logo from '$lib/components/shared-components/Logo.svelte';
  import AccountInfoPanel from '$lib/components/shared-components/navigation-bar/AccountInfoPanel.svelte';
  import NotificationPanel from '$lib/components/shared-components/navigation-bar/NotificationPanel.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import SkipLink from '$lib/elements/SkipLink.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { barSlot } from '$lib/managers/bar-slot.svelte';
  import { Route } from '$lib/route';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { notificationManager } from '$lib/stores/notification-manager.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { sidebarStore } from '$lib/stores/sidebar.svelte';
  import { Icon } from '@immich/ui';
  import { mdiBellBadgeOutline, mdiBellOutline, mdiMenu, mdiTrayArrowUp } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    onUploadClick?: () => void;
    /** as NavigationBar: the menu button and the first column follow the rail-aware sidebar */
    railAware?: boolean;
  };

  let { onUploadClick, railAware = false }: Props = $props();

  // the id upstream's NavigationBar gives its menu button (the sidebar returns focus to it), kept here rather than
  // imported, so the bar does not depend on the component it replaces
  const menuButtonId = 'top-menu-button';

  let showAccount = $state(false);
  let showNotifications = $state(false);
  const unread = $derived(notificationManager.notifications.length);

  onMount(async () => {
    try {
      await notificationManager.refresh();
    } catch (error) {
      console.error('Failed to load notifications on mount', error);
    }
  });

  // the menu button and the first column, exactly as NavigationBar sizes them, so the middle starts where the
  // content panel starts below
  const isRail = $derived(railAware && sidebarModeStore.layout === 'rail');
  const isExpandedLayout = $derived(
    railAware ? sidebarModeStore.layout === 'expanded' : mediaQueryManager.isFullSidebar,
  );
  const isHiddenLayout = $derived(railAware && sidebarModeStore.layout === 'hidden');
  const togglesHidden = $derived(railAware && (isExpandedLayout || isHiddenLayout));
  const column = $derived(isExpandedLayout ? 'wide' : isRail ? 'rail' : 'narrow');

  const toggleMenu = () => {
    if (togglesHidden) {
      sidebarModeStore.toggleHidden();
    } else if (isRail) {
      sidebarModeStore.toggleRailOverlay();
    } else {
      sidebarStore.toggle();
    }
  };
</script>

<nav id="dashboard-navbar" class="ws-bar h-(--navbar-height) w-dvw max-md:h-(--navbar-height-md)" data-column={column}>
  <SkipLink text={$t('skip_to_content')} />
  <div class="ws-bar-start">
    <button
      type="button"
      id={menuButtonId}
      class="ws-bar-icon"
      aria-label={isHiddenLayout ? $t('expand') : togglesHidden ? $t('collapse') : $t('main_menu')}
      title={isHiddenLayout ? $t('expand') : togglesHidden ? $t('collapse') : undefined}
      onclick={toggleMenu}
      onmousedown={(event: MouseEvent) => {
        if (sidebarStore.isOpen) {
          // stops event from reaching the default handler when clicking outside of the sidebar
          event.stopPropagation();
        }
      }}
    >
      <Icon icon={mdiMenu} size="20" />
    </button>
    <a class="ws-bar-mark" data-sveltekit-preload-data="hover" href={Route.photos()} aria-label={$t('photos')}>
      <!-- one step down the Logo scale (2.5rem -> 2rem): at 2.5rem the mark outweighed the 56px bar ("make the logo at
           the top slightly smaller") -->
      <Logo variant={barSlot.content || !isExpandedLayout ? 'icon' : 'inline'} size="tiny" />
    </a>
  </div>

  <!-- A page's content is drawn here, outside the page, so a page that is being closed can still be asked for its
       title after its data is gone (a Space left through Photos in the sidebar); each boundary keeps such a throw in the
       bar instead of stopping the whole navigation, and starts over with the next page's content. -->
  <div class="ws-bar-middle">
    {#key barSlot.content}
      <svelte:boundary>
        {@render barSlot.content?.()}
        {#snippet failed()}{/snippet}
      </svelte:boundary>
    {/key}
  </div>

  <div class="ws-bar-end">
    {#key barSlot.tools}
      <svelte:boundary>
        {@render barSlot.tools?.()}
        {#snippet failed()}{/snippet}
      </svelte:boundary>
    {/key}
    <BarSearch />
    <BarUndo />
    <BarViewMenu />

    {#if !page.url.pathname.includes('/admin') && onUploadClick}
      <button
        type="button"
        class="ws-bar-icon ws-bar-upload"
        aria-label={$t('upload')}
        title={$t('upload')}
        onclick={onUploadClick}
      >
        <Icon icon={mdiTrayArrowUp} size="20" />
      </button>
    {/if}

    <div
      class="ws-bar-anchor"
      use:clickOutside={{ onOutclick: () => (showNotifications = false), onEscape: () => (showNotifications = false) }}
    >
      <button
        type="button"
        class="ws-bar-icon"
        aria-label={$t('notifications')}
        title={$t('notifications')}
        aria-expanded={showNotifications}
        onclick={() => (showNotifications = !showNotifications)}
      >
        <Icon icon={unread > 0 ? mdiBellBadgeOutline : mdiBellOutline} size="20" />
        {#if unread > 0}<span class="ws-bar-dot" aria-hidden="true"></span>{/if}
      </button>
      {#if showNotifications}
        <NotificationPanel />
      {/if}
    </div>

    <!-- the account, once someone is signed in (authManager.user throws before) -->
    {#if authManager.authenticated}
      <div
        class="ws-bar-anchor"
        use:clickOutside={{ onOutclick: () => (showAccount = false), onEscape: () => (showAccount = false) }}
      >
        <button
          type="button"
          class="ws-bar-avatar"
          onclick={() => (showAccount = !showAccount)}
          title="{authManager.user.name} ({authManager.user.email})"
          aria-expanded={showAccount}
        >
          {#key authManager.user}
            <UserAvatar user={authManager.user} size="sm" noTitle interactive />
          {/key}
        </button>
        {#if showAccount}
          <AccountInfoPanel onClose={() => (showAccount = false)} />
        {/if}
      </div>
    {/if}
  </div>
</nav>

<style>
  .ws-bar {
    display: grid;
    grid-template-columns: var(--ws-bar-start, 16rem) minmax(0, 1fr) auto;
    align-items: center;
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-bar[data-column='rail'] {
    --ws-bar-start: 9rem;
  }
  .ws-bar[data-column='narrow'] {
    --ws-bar-start: 8rem;
  }
  .ws-bar-start {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding-inline-start: 0.75rem;
    min-width: 0;
  }
  .ws-bar-mark {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  /* the page's own part of the bar starts on the content's gutter (the grids and text columns sit 0.5rem in from the
     sidebar), so a title lines up with what it heads */
  .ws-bar-middle {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding-inline-start: 0.5rem;
  }
  /* the bar's own icons stand apart from the page's tools behind a full-height hairline, like the time strip's, with
     the same 0.5rem on each side, rather than behind a gap that read as an accident */
  .ws-bar-end {
    display: flex;
    gap: 0.125rem;
    align-items: center;
    align-self: stretch;
    padding-inline: 0.5rem 1rem;
    border-inline-start: 1px solid var(--ws-hairline);
  }
  .ws-bar-anchor {
    position: relative;
  }
  .ws-bar-avatar {
    display: flex;
    margin-inline-start: 0.5rem;
  }
  /* the account as a quiet ring with the initial in ink (a picture still fills it): upstream's colour discs put the
     initial at 2.9:1 under a dark theme's light ink, and the chrome recedes. The ring is filled with the surface, as
     the disc was, so a page's tools that overrun the bar on a phone stay hidden under it */
  .ws-bar-avatar > :global(*) {
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 38%, transparent);
  }
  .ws-bar-avatar:hover > :global(*) {
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, var(--immich-ui-light));
  }
  @media (max-width: 767px) {
    .ws-bar {
      --ws-bar-start: auto;
    }
    .ws-bar-end {
      padding-inline: 0.25rem 0.5rem;
    }
  }
  /* a phone keeps the bar for the page: the mark gives its room to the page's name, and upload (the app's job on a
     phone; Import stays in the sidebar) waits for a wider screen */
  @media (max-width: 639px) {
    /* the start column holds the menu button alone (the narrow sidebar's 8rem would keep room for the mark) */
    .ws-bar[data-column] {
      --ws-bar-start: auto;
    }
    .ws-bar-mark,
    .ws-bar-upload {
      display: none;
    }
    .ws-bar-end :global(.ws-bar-icon) {
      width: 2rem;
    }
    .ws-bar-avatar {
      margin-inline-start: 0.25rem;
    }
  }
</style>
