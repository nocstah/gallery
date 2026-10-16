<script lang="ts">
  import { page } from '$app/state';
  import { focusTrap } from '$lib/actions/focus-trap';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import AvatarEditModal from '$lib/modals/AvatarEditModal.svelte';
  import HelpAndFeedbackModal from '$lib/modals/HelpAndFeedbackModal.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { getAboutInfo, type ServerAboutResponseDto } from '@immich/sdk';
  import { Button, Icon, IconButton, modalManager } from '@immich/ui';
  import { mdiBellBadgeOutline, mdiBellOutline, mdiCog, mdiLogout, mdiPencil, mdiWrench } from '@mdi/js';
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
    info = userInteraction.aboutInfo ?? (await getAboutInfo());
  });
</script>

<div
  in:fade={{ duration: 100 }}
  out:fade={{ duration: 100 }}
  id="account-info-panel"
  class="absolute inset-e-6 top-19 z-1 w-[min(360px,100vw-50px)] rounded-3xl bg-gray-200 shadow-lg dark:border dark:border-immich-dark-gray dark:bg-immich-dark-gray"
  use:focusTrap
>
  <div
    class="mx-4 mt-4 flex flex-col items-center justify-center gap-4 rounded-t-3xl bg-white p-4 dark:bg-immich-dark-primary/10"
  >
    <div class="relative">
      <UserAvatar user={authManager.user} size="xl" />
      <div class="absolute inset-e-0 bottom-0 size-6 rounded-full">
        <IconButton
          color="primary"
          icon={mdiPencil}
          aria-label={$t('edit_avatar')}
          size="tiny"
          shape="round"
          onclick={async () => {
            onClose?.();
            await modalManager.show(AvatarEditModal);
          }}
        />
      </div>
    </div>
    <div>
      <p class="text-center text-lg font-medium text-primary">
        {authManager.user.name}
      </p>
      <p class="text-sm text-gray-500 dark:text-immich-dark-fg">{authManager.user.email}</p>
    </div>

    <div class="flex flex-col gap-1">
      {#if notifications}
        <Button
          onclick={notifications.onOpen}
          size="small"
          color="secondary"
          variant="ghost"
          shape="round"
          class="border hover:bg-immich-primary/10 dark:border-immich-dark-gray dark:bg-gray-500 dark:text-white dark:hover:bg-immich-dark-primary/50"
          aria-label={notifications.count > 0
            ? `${$t('notifications')}: ${$t('notifications_unread_count', { values: { count: notifications.count } })}`
            : $t('notifications')}
          data-testid="account-notifications"
        >
          <div class="flex place-content-center place-items-center gap-2 px-2 text-center">
            <Icon icon={notifications.count > 0 ? mdiBellBadgeOutline : mdiBellOutline} size="18" aria-hidden />
            {$t('notifications')}
            {#if notifications.count > 0}
              <span class="ws-account-unread" aria-hidden="true">{notifications.count.toLocaleString($locale)}</span>
            {/if}
          </div>
        </Button>
      {/if}
      <Button
        href={Route.userSettings()}
        onclick={onClose}
        size="small"
        color="secondary"
        variant="ghost"
        shape="round"
        class="border hover:bg-immich-primary/10 dark:border-immich-dark-gray dark:bg-gray-500 dark:text-white dark:hover:bg-immich-dark-primary/50"
      >
        <div class="flex place-content-center place-items-center gap-2 px-2 text-center">
          <Icon icon={mdiCog} size="18" aria-hidden />
          {$t('account_settings')}
        </div>
      </Button>
      {#if authManager.user.isAdmin}
        <Button
          href={Route.systemSettings()}
          onclick={onClose}
          shape="round"
          variant="ghost"
          size="small"
          color="secondary"
          aria-current={page.url.pathname.includes('/admin') ? 'page' : undefined}
          class="border hover:bg-immich-primary/10 dark:border-immich-dark-gray dark:bg-gray-500 dark:text-white dark:hover:bg-immich-dark-primary/50"
        >
          <div class="flex place-content-center place-items-center gap-2 px-2 text-center">
            <Icon icon={mdiWrench} size="18" aria-hidden />
            {$t('administration')}
          </div>
        </Button>
      {/if}
    </div>
  </div>

  <div class="mb-4 flex flex-col">
    <Button
      class="m-1 mx-4 rounded-none rounded-b-3xl bg-white p-3 dark:bg-immich-dark-primary/10"
      href={Route.logout()}
      leadingIcon={mdiLogout}
      variant="ghost"
      color="secondary">{$t('sign_out')}</Button
    >

    <button
      type="button"
      class="mt-4 text-center text-xs text-primary underline"
      onclick={async () => {
        onClose?.();
        if (info) {
          await modalManager.show(HelpAndFeedbackModal, { info });
        }
      }}
    >
      {$t('support_and_feedback')}
    </button>
  </div>
</div>

<style>
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
