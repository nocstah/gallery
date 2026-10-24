<script lang="ts">
  // Local Omarchy layer: the account menu is a sheet of the bar, drawn as the View menu's: one frame on the ground with
  // the theme's corners and the popup shadow, rows split by hairlines that run edge to edge. Upstream drew a grey slab
  // with a white rounded card inside, slab buttons and a blue avatar disc, the one colour in the app the theme did not
  // give. The person heads it as a quiet ring with the initial in ink (a picture fills it), as the bar draws them; then
  // the account's pages; then Help, which says who runs this Gallery (modals/HelpAndFeedbackModal); then Sign out.
  import { page } from '$app/state';
  import { focusTrap } from '$lib/actions/focus-trap';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import AvatarEditModal from '$lib/modals/AvatarEditModal.svelte';
  import HelpAndFeedbackModal from '$lib/modals/HelpAndFeedbackModal.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { getAboutInfo, type ServerAboutResponseDto } from '@immich/sdk';
  import { Icon, modalManager } from '@immich/ui';
  import {
    mdiBellBadgeOutline,
    mdiBellOutline,
    mdiCogOutline,
    mdiHelpCircleOutline,
    mdiLogout,
    mdiPencilOutline,
    mdiWrenchOutline,
  } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fade } from 'svelte/transition';
  import UserAvatar from '../UserAvatar.svelte';

  type Props = {
    onClose?: () => void;
    /** Local Omarchy layer: on a phone the bar's bell lives here (components/omarchy/OmarchyBar), with what is unread */
    notifications?: { count: number; onOpen: () => void };
  };

  let { onClose, notifications }: Props = $props();

  let info: ServerAboutResponseDto | undefined = $state();

  onMount(async () => {
    try {
      info = userInteraction.aboutInfo ?? (await getAboutInfo());
    } catch {
      // the Help sheet asks again when it opens
    }
  });

  const editAvatar = async () => {
    onClose?.();
    await modalManager.show(AvatarEditModal);
  };

  const openHelp = async () => {
    onClose?.();
    await modalManager.show(HelpAndFeedbackModal, { info });
  };
</script>

<div in:fade={{ duration: 100 }} out:fade={{ duration: 100 }} id="account-info-panel" class="ws-account" use:focusTrap>
  <div class="ws-account-head">
    <div class="ws-account-avatar">
      <UserAvatar user={authManager.user} size="lg" noTitle />
      <button
        type="button"
        class="ws-account-avatar-edit"
        aria-label={$t('edit_avatar')}
        title={$t('edit_avatar')}
        onclick={editAvatar}
      >
        <Icon icon={mdiPencilOutline} size="14" aria-hidden />
      </button>
    </div>
    <div class="ws-account-who">
      <p class="ws-account-name">{authManager.user.name}</p>
      <p class="ws-account-email" title={authManager.user.email}>{authManager.user.email}</p>
    </div>
  </div>

  <div class="ws-account-rows">
    {#if notifications}
      <button
        type="button"
        class="ws-account-row"
        onclick={notifications.onOpen}
        aria-label={notifications.count > 0
          ? `${$t('notifications')}: ${$t('notifications_unread_count', { values: { count: notifications.count } })}`
          : $t('notifications')}
        data-testid="account-notifications"
      >
        <Icon icon={notifications.count > 0 ? mdiBellBadgeOutline : mdiBellOutline} size="18" aria-hidden />
        <span class="ws-account-label">{$t('notifications')}</span>
        {#if notifications.count > 0}
          <span class="ws-account-unread" aria-hidden="true">{notifications.count.toLocaleString($locale)}</span>
        {/if}
      </button>
    {/if}
    <a class="ws-account-row" href={Route.userSettings()} onclick={onClose}>
      <Icon icon={mdiCogOutline} size="18" aria-hidden />
      <span class="ws-account-label">{$t('account_settings')}</span>
    </a>
    {#if authManager.user.isAdmin}
      <a
        class="ws-account-row"
        href={Route.systemSettings()}
        onclick={onClose}
        aria-current={page.url.pathname.includes('/admin') ? 'page' : undefined}
      >
        <Icon icon={mdiWrenchOutline} size="18" aria-hidden />
        <span class="ws-account-label">{$t('administration')}</span>
      </a>
    {/if}
    <button type="button" class="ws-account-row" onclick={openHelp} data-testid="account-help">
      <Icon icon={mdiHelpCircleOutline} size="18" aria-hidden />
      <span class="ws-account-label">{$t('help_title')}</span>
    </button>
  </div>

  <div class="ws-account-rows">
    <a class="ws-account-row" href={Route.logout()}>
      <Icon icon={mdiLogout} size="18" aria-hidden />
      <span class="ws-account-label">{$t('sign_out')}</span>
    </a>
  </div>
</div>

<style>
  /* a sheet under the account, as the View menu hangs under its icon: one frame on the ground, the theme's corners,
     the popup shadow; it starts where the View menu's does (the ring is shorter than an icon button) */
  .ws-account {
    position: absolute;
    top: calc(100% + 0.75rem);
    right: 0;
    z-index: 60;
    width: min(17.5rem, calc(100vw - 1rem));
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.28);
    overflow: hidden;
  }
  /* the person: the ring, the name in ink, the address under it */
  .ws-account-head {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.85rem 0.85rem 0.8rem;
  }
  .ws-account-avatar {
    position: relative;
    flex: none;
  }
  /* the account as the bar draws it: a quiet ring with the initial in ink, a picture filling it */
  .ws-account-avatar > :global(figure) {
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 38%, transparent);
  }
  /* changing the avatar: a small square on the ring's corner, a 24px target */
  .ws-account-avatar-edit {
    position: absolute;
    right: -0.45rem;
    bottom: -0.35rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
  }
  .ws-account-avatar-edit:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, var(--immich-ui-light));
  }
  .ws-account-who {
    min-width: 0;
  }
  .ws-account-name {
    overflow: hidden;
    font-size: var(--ws-text-ui);
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-account-email {
    overflow: hidden;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* the rows, as the View menu's: meta size at 500, the icon muted until the row is pointed at; a hairline over each
     group, edge to edge */
  .ws-account-rows {
    display: grid;
    gap: 2px;
    padding: 6px;
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-account-row {
    display: flex;
    gap: 0.65rem;
    align-items: center;
    width: 100%;
    min-height: 2.25rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    text-align: start;
  }
  .ws-account-row :global(svg) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-account-row:hover {
    background: color-mix(in oklab, var(--ws-accent) 16%, transparent);
  }
  .ws-account-row:hover :global(svg),
  .ws-account-row[aria-current='page'] :global(svg) {
    color: inherit;
  }
  .ws-account-row:focus-visible,
  .ws-account-avatar-edit:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-account-label {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* what is unread, as data: the desktop's mono at the data size, after the accent's dot like the bar's */
  .ws-account-unread {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ws-account-unread::before {
    content: '';
    width: 6px;
    height: 6px;
    background: var(--ws-accent);
  }
</style>
