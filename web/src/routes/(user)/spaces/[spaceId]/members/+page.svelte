<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import SpaceAddMemberModal from '$lib/modals/SpaceAddMemberModal.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { spaceRoleLabelKey } from '$lib/utils/space-utils';
  import { formatTimeAgo } from '$lib/utils/timesince';
  import {
    removeMember,
    SharedSpaceRole,
    updateMember,
    UserAvatarColor,
    type SharedSpaceMemberResponseDto,
  } from '@immich/sdk';
  import { Field, modalManager, Select, type SelectOption } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const space = $derived(data.space);
  const members = $derived(data.members);
  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isOwner = $derived(currentMember?.role === SharedSpaceRole.Owner);

  const toAvatarUser = (m: SharedSpaceMemberResponseDto) => ({
    id: m.userId,
    name: m.name,
    email: m.email,
    profileImagePath: m.profileImagePath ?? '',
    avatarColor: (m.avatarColor as UserAvatarColor) ?? UserAvatarColor.Primary,
    profileChangedAt: m.profileChangedAt ?? '',
  });

  async function handleAddMember() {
    const result = await modalManager.show(SpaceAddMemberModal, {
      spaceId: space.id,
      existingMemberIds: members.map((m) => m.userId),
    });
    if (result) {
      await invalidateAll();
    }
  }

  async function handleRoleChange(member: SharedSpaceMemberResponseDto, newRole: SharedSpaceRole | 'remove') {
    if (newRole === 'remove') {
      const confirmed = await modalManager.showDialog({
        prompt: $t('spaces_remove_member_confirmation', { values: { name: member.name } }),
        title: $t('spaces_remove_member'),
      });
      if (!confirmed) {
        return;
      }
      try {
        await removeMember({ id: space.id, userId: member.userId });
        await invalidateAll();
      } catch (error) {
        handleError(error, $t('errors.error_removing_member'));
      }
      return;
    }
    try {
      await updateMember({ id: space.id, userId: member.userId, sharedSpaceMemberUpdateDto: { role: newRole } });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('errors.error_updating_member_role'));
    }
  }
</script>

<!-- Local Omarchy layer: the members as a section on the page's gutter, headed like Shared's sections (the name, the
     count in data type, the action at the heading's end, a hairline under it) and listed as rows split by hairlines,
     where upstream centred a narrow column in a rounded box with coloured role pills -->
<section class="ws-space-pane ws-space-column" aria-labelledby="space-members-heading">
  <h2 class="ws-sharing-heading" id="space-members-heading">
    {$t('members')} <span class="ws-inbox-meta">{members.length}</span>
    {#if isOwner}
      <button type="button" class="ws-sharing-heading-action" onclick={handleAddMember} data-testid="members-invite">
        {$t('spaces_add_member')}
      </button>
    {/if}
  </h2>

  <ul data-testid="member-list" class="ws-members">
    {#each members as member (member.userId)}
      <li class="ws-member">
        <UserAvatar user={toAvatarUser(member)} size="md" />
        <div class="ws-member-text">
          <span class="ws-member-name">{member.name}</span>
          <span class="ws-inbox-meta">{member.email}</span>
          {#if (member.contributionCount ?? 0) > 0}
            <span class="ws-member-contribution">
              {#if member.recentAssetId}
                <img
                  alt=""
                  src={getAssetMediaUrl({ id: member.recentAssetId })}
                  class="ws-member-recent"
                  loading="lazy"
                  draggable="false"
                />
              {/if}
              <span class="ws-inbox-meta">
                {$t('space_album_photo_count', { values: { count: member.contributionCount ?? 0 } })}
                {#if member.lastActiveAt}
                  · {formatTimeAgo(member.lastActiveAt)}
                {/if}
              </span>
            </span>
          {/if}
        </div>
        {#if isOwner && member.role !== 'owner'}
          <Field class="w-28 shrink-0">
            <Select
              value={member.role as string as SharedSpaceRole}
              options={[
                { label: $t('role_editor'), value: SharedSpaceRole.Editor },
                { label: $t('role_viewer'), value: SharedSpaceRole.Viewer },
                { label: $t('remove'), value: 'remove' },
              ] as SelectOption<SharedSpaceRole | 'remove'>[]}
              onChange={(value) => void handleRoleChange(member, value)}
            />
          </Field>
        {:else}
          <!-- the role is a word at the row's end, not a pill in the Space's colour -->
          <span class="ws-member-role" data-testid="role-badge-{member.role}">
            {$t(spaceRoleLabelKey(member.role))}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .ws-members {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* a member is a row like a partner on Shared: avatar, name over address, a hairline between rows */
  .ws-member {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.65rem 0.5rem;
    color: var(--immich-ui-dark);
  }
  .ws-member + .ws-member {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-member-text {
    display: grid;
    flex: 1;
    gap: 0.15rem;
    min-width: 0;
  }
  .ws-member-text > :global(*) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-member-name {
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .ws-member-contribution {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.35rem;
  }
  .ws-member-recent {
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    object-fit: cover;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
  }
  .ws-member-role {
    flex: none;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
</style>
