<script lang="ts">
  // Local Omarchy layer: the setup steps as a calm list on the ground (DESIGN.md, Space page), where the fork drew a
  // white rounded slab with a shadow, the Space's gradient in a progress bar and on each done step's tile, and
  // tinted icon tiles: a muted line that counts the steps, the desktop's 2px meter under it in ink, then a row per
  // step split by hairlines, as Settings draws its rows (a muted icon that turns ink under the pointer, the label, what
  // it does in muted meta); a done step keeps its row, its check in ink and its label muted.
  import type { SharedSpaceResponseDto } from '@immich/sdk';
  import {
    mdiAccountPlusOutline,
    mdiCheck,
    mdiChevronDown,
    mdiChevronRight,
    mdiChevronUp,
    mdiClose,
    mdiImageFilterHdrOutline,
    mdiImagePlusOutline,
  } from '@mdi/js';
  import { Icon } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import { dismissedOnboardingSpaceIds } from '$lib/stores/space-view.store';

  interface Props {
    space: SharedSpaceResponseDto;
    onAddPhotos: () => void;
    onInviteMembers: () => void;
    onSetCover: () => void;
  }

  let { space, onAddPhotos, onInviteMembers, onSetCover }: Props = $props();

  let collapsed = $state(false);

  const dismissed = $derived($dismissedOnboardingSpaceIds.includes(space.id));

  const dismiss = () => {
    dismissedOnboardingSpaceIds.update((ids) => (ids.includes(space.id) ? ids : [...ids, space.id]));
  };

  const hasPhotos = $derived((space.assetCount ?? 0) > 0);
  const hasMembers = $derived((space.memberCount ?? 0) > 1);
  const hasCover = $derived(space.thumbnailAssetId !== null && space.thumbnailAssetId !== undefined);

  const completedCount = $derived((hasPhotos ? 1 : 0) + (hasMembers ? 1 : 0) + (hasCover ? 1 : 0));
  const allComplete = $derived(completedCount === 3);
  const progressPercent = $derived(Math.round((completedCount / 3) * 100));

  const steps = $derived([
    {
      id: 'add-photos',
      icon: mdiImagePlusOutline,
      label: $t('spaces_onboarding_add_photos'),
      description: $t('spaces_onboarding_add_photos_description'),
      complete: hasPhotos,
      action: onAddPhotos,
    },
    {
      id: 'invite-members',
      icon: mdiAccountPlusOutline,
      label: $t('spaces_onboarding_invite_members'),
      description: $t('spaces_onboarding_invite_members_description'),
      complete: hasMembers,
      action: onInviteMembers,
    },
    {
      id: 'set-cover',
      icon: mdiImageFilterHdrOutline,
      label: $t('spaces_onboarding_set_cover'),
      description: $t('spaces_onboarding_set_cover_description'),
      complete: hasCover,
      action: onSetCover,
    },
  ]);
</script>

{#if !allComplete && !dismissed}
  <section
    class="ws-onboarding"
    data-testid="onboarding-banner"
    data-collapsed={collapsed}
    aria-label={$t('spaces_onboarding_title')}
  >
    <div class="ws-onboarding-head">
      <p class="ws-onboarding-count" data-testid="progress-text">
        {$t('spaces_setup_steps_done', { values: { completed: completedCount, total: 3 } })}
      </p>
      <button
        type="button"
        class="ws-onboarding-tool"
        onclick={() => (collapsed = !collapsed)}
        data-testid="banner-collapse-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? $t('expand') : $t('collapse')}
        title={collapsed ? $t('expand') : $t('collapse')}
      >
        <Icon icon={collapsed ? mdiChevronDown : mdiChevronUp} size="20" />
      </button>
      <button
        type="button"
        class="ws-onboarding-tool"
        onclick={dismiss}
        data-testid="banner-dismiss"
        aria-label={$t('spaces_onboarding_hide')}
        title={$t('spaces_onboarding_hide')}
      >
        <Icon icon={mdiClose} size="20" />
      </button>
    </div>

    <!-- how far the setup is, on the desktop's meter: a hairline, filled in ink -->
    <div class="ws-meter" aria-hidden="true">
      <span style="width: {progressPercent}%" data-testid="progress-bar-fill"></span>
    </div>

    {#if !collapsed}
      <ul class="ws-onboarding-steps">
        {#each steps as step (step.id)}
          <li>
            {#if step.complete}
              <div class="ws-onboarding-step" data-done>
                <span class="ws-onboarding-icon" data-testid="step-{step.id}-check">
                  <Icon icon={mdiCheck} size="20" />
                </span>
                <span class="ws-onboarding-text">
                  <span class="ws-onboarding-label">{step.label}</span>
                </span>
              </div>
            {:else}
              <button
                type="button"
                class="ws-onboarding-step"
                onclick={step.action}
                data-testid="step-{step.id}-action"
              >
                <span class="ws-onboarding-icon"><Icon icon={step.icon} size="20" /></span>
                <span class="ws-onboarding-text">
                  <span class="ws-onboarding-label">{step.label}</span>
                  <span class="ws-onboarding-description">{step.description}</span>
                </span>
                <span class="ws-onboarding-chevron"><Icon icon={mdiChevronRight} size="20" /></span>
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .ws-onboarding {
    max-width: 60rem;
    margin: 0 0 0.75rem;
    color: var(--immich-ui-dark);
  }
  .ws-onboarding-head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 2.5rem;
  }
  .ws-onboarding-count {
    flex: 1;
    min-width: 0;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .ws-onboarding-tool {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-onboarding-tool:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    color: var(--immich-ui-dark);
  }
  .ws-onboarding-steps {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ws-onboarding-steps > li {
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-onboarding-step {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    min-height: 3.25rem;
    padding: 0.55rem 0.5rem 0.55rem 0;
    text-align: start;
  }
  button.ws-onboarding-step:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 4%, transparent);
  }
  .ws-onboarding-tool:focus-visible,
  button.ws-onboarding-step:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-onboarding-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    color: var(--immich-ui-muted);
  }
  button.ws-onboarding-step:hover .ws-onboarding-icon,
  [data-done] .ws-onboarding-icon {
    color: var(--immich-ui-dark);
  }
  .ws-onboarding-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .ws-onboarding-label {
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  [data-done] .ws-onboarding-label {
    font-weight: 500;
    color: var(--immich-ui-muted);
  }
  .ws-onboarding-description {
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .ws-onboarding-chevron {
    flex: none;
    color: var(--immich-ui-muted);
  }
</style>
