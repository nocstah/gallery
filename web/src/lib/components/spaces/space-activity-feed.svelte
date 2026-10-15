<script lang="ts">
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { formatTimeAgo } from '$lib/utils/timesince';
  import { UserAvatarColor, type SharedSpaceActivityResponseDto } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { mdiChevronDown } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t, type MessageFormatter } from 'svelte-i18n';

  interface Props {
    activities: SharedSpaceActivityResponseDto[];
    onLoadMore: () => void;
    hasMore: boolean;
    /** Local Omarchy layer: the next step the empty feed offers (the page knows what this member may do) */
    emptyActions?: Snippet;
  }

  let { activities, onLoadMore, hasMore, emptyActions }: Props = $props();

  const HIGH_IMPACT_TYPES = new Set(['asset_add', 'asset_remove']);
  const MEDIUM_TYPES = new Set([
    'member_join',
    'member_leave',
    'member_remove',
    'member_role_change',
    'asset_edit',
    'person_face_assign',
    'person_face_detach',
  ]);

  function getDayLabel(isoString: string, $t: MessageFormatter): string {
    const date = new Date(isoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - targetDay.getTime()) / 86_400_000);

    if (diffDays === 0) {
      return $t('spaces_activity_today');
    }
    if (diffDays === 1) {
      return $t('spaces_activity_yesterday');
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getDescription(activity: SharedSpaceActivityResponseDto, $t: MessageFormatter): string {
    const data = activity.data as Record<string, unknown>;
    const name = activity.userName ?? $t('spaces_activity_someone');
    const count = Number(data.count ?? 0);

    switch (activity.type) {
      case 'asset_add': {
        return $t('spaces_activity_added_photos', { values: { name, count } });
      }
      case 'asset_remove': {
        return $t('spaces_activity_removed_photos', { values: { name, count } });
      }
      case 'asset_edit': {
        return $t('spaces_activity_edited_photos', { values: { name, count } });
      }
      case 'member_join': {
        return $t('spaces_activity_joined_as', {
          values: { name, role: String(data.role ?? $t('spaces_role_member')) },
        });
      }
      case 'member_leave': {
        return $t('spaces_activity_left_space', { values: { name } });
      }
      case 'member_remove': {
        return $t('spaces_activity_was_removed', { values: { name } });
      }
      case 'member_role_change': {
        return $t('spaces_activity_changed_role', {
          values: { name, role: String(data.newRole ?? $t('spaces_role_member')) },
        });
      }
      case 'cover_change': {
        return $t('spaces_activity_set_cover', { values: { name } });
      }
      case 'space_rename': {
        return $t('spaces_renamed', { values: { oldName: String(data.oldName), newName: String(data.newName) } });
      }
      case 'space_color_change': {
        return $t('spaces_changed_color');
      }
      case 'album_link': {
        return $t('spaces_activity_linked_album', { values: { name, albumName: String(data.albumName ?? '') } });
      }
      case 'album_unlink': {
        return $t('spaces_activity_unlinked_album', { values: { name, albumName: String(data.albumName ?? '') } });
      }
      case 'person_update': {
        return $t('spaces_activity_updated_person', { values: { name, personName: String(data.personName ?? '') } });
      }
      case 'person_delete': {
        return $t('spaces_activity_deleted_person', { values: { name, personName: String(data.personName ?? '') } });
      }
      case 'person_merge': {
        return $t('spaces_activity_merged_people', {
          values: { name, count: Number(data.count ?? 0), personName: String(data.personName ?? '') },
        });
      }
      case 'person_face_assign': {
        return $t('spaces_activity_assigned_faces', { values: { name, count } });
      }
      case 'person_face_detach': {
        return $t('spaces_activity_unassigned_faces', { values: { name, count } });
      }
      default: {
        return $t('spaces_activity_default', { values: { name } });
      }
    }
  }

  function toAvatarUser(activity: SharedSpaceActivityResponseDto) {
    return {
      id: activity.userId ?? '',
      name: activity.userName ?? '',
      email: activity.userEmail ?? '',
      profileImagePath: activity.userProfileImagePath ?? '',
      avatarColor: (activity.userAvatarColor as UserAvatarColor) ?? UserAvatarColor.Primary,
      profileChangedAt: '',
    };
  }

  interface DayGroup {
    label: string;
    activities: SharedSpaceActivityResponseDto[];
  }

  let groupedByDay: DayGroup[] = $derived.by(() => {
    const groups: DayGroup[] = [];
    let currentLabel = '';
    let currentGroup: SharedSpaceActivityResponseDto[] = [];

    for (const activity of activities) {
      const label = getDayLabel(activity.createdAt, $t);
      if (label === currentLabel) {
        currentGroup.push(activity);
      } else {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, activities: currentGroup });
        }
        currentLabel = label;
        currentGroup = [activity];
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, activities: currentGroup });
    }

    return groups;
  });
</script>

<!-- Local Omarchy layer: the feed in the Tiled Workspace's grammar. An empty feed is the Empty State (a sentence of why,
     the next step the page passes in); a day is a muted label over a hairline; every event is a row split from the next
     by a hairline, its time in data type at the row's end: photos added or removed with the avatar and the first photos
     as small square tiles, member and face events with the avatar, the rest as a quiet line. No cards on a second tone,
     no borders or dots in the Space's colour. -->
{#if activities.length === 0}
  <div class="ws-empty ws-activity-empty" data-testid="activity-empty-state">
    <h2 class="ws-empty-title">{$t('spaces_activity_none')}</h2>
    <p class="ws-empty-body">{$t('spaces_activity_none_description')}</p>
    {#if emptyActions}
      <div class="ws-empty-actions">{@render emptyActions()}</div>
    {/if}
  </div>
{:else}
  <div class="ws-activity">
    {#each groupedByDay as group, groupIndex (group.label)}
      <h3 class="ws-activity-day" data-testid="day-header-{groupIndex}">{group.label}</h3>

      <ul class="ws-activity-rows">
        {#each group.activities as activity (activity.id)}
          {#if HIGH_IMPACT_TYPES.has(activity.type)}
            <li class="ws-activity-row" data-tier="high" data-testid="activity-item-{activity.id}">
              <UserAvatar user={toAvatarUser(activity)} size="sm" />
              <div class="ws-activity-text">
                <p>{getDescription(activity, $t)}</p>
                {#if activity.type === 'asset_add'}
                  {@const assetIds = ((activity.data as Record<string, unknown>).assetIds as string[]) ?? []}
                  {#if assetIds.length > 0}
                    <div class="ws-activity-photos">
                      {#each assetIds.slice(0, 4) as assetId (assetId)}
                        <img
                          alt=""
                          src={getAssetMediaUrl({ id: assetId })}
                          class="ws-activity-photo"
                          loading="lazy"
                          draggable="false"
                        />
                      {/each}
                      {#if assetIds.length > 4}
                        <span class="ws-activity-more">+{assetIds.length - 4}</span>
                      {/if}
                    </div>
                  {/if}
                {/if}
              </div>
              <span class="ws-activity-time">{formatTimeAgo(activity.createdAt)}</span>
            </li>
          {:else if MEDIUM_TYPES.has(activity.type)}
            <li class="ws-activity-row" data-tier="medium" data-testid="activity-item-{activity.id}">
              <UserAvatar user={toAvatarUser(activity)} size="sm" />
              <div class="ws-activity-text">
                <p>{getDescription(activity, $t)}</p>
              </div>
              <span class="ws-activity-time">{formatTimeAgo(activity.createdAt)}</span>
            </li>
          {:else}
            <li class="ws-activity-row ws-activity-quiet" data-tier="low" data-testid="activity-item-{activity.id}">
              <div class="ws-activity-text">
                <p>{getDescription(activity, $t)}</p>
              </div>
              <span class="ws-activity-time">{formatTimeAgo(activity.createdAt)}</span>
            </li>
          {/if}
        {/each}
      </ul>
    {/each}

    {#if hasMore}
      <div class="ws-activity-more-row" data-testid="load-more-button">
        <Button size="small" variant="ghost" color="secondary" leadingIcon={mdiChevronDown} onclick={onLoadMore}>
          {$t('spaces_load_more')}
        </Button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* on the page's gutter, under the heading, not centred in the page */
  .ws-activity-empty {
    margin-inline: 0;
    padding-inline: 0;
  }
  /* a day: a muted label in the meta role over a hairline; it stays at the top while its rows scroll by, reaching up over
     the content panel's 0.5rem gutter so no row shows through above it */
  .ws-activity-day {
    position: sticky;
    top: -0.5rem;
    z-index: 1;
    margin: 0;
    padding: 1.25rem 0.5rem 0.4rem;
    border-bottom: 1px solid var(--ws-hairline);
    background: var(--immich-ui-light);
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    font-weight: 600;
  }
  .ws-activity-day:first-child {
    padding-top: 0.5rem;
  }
  .ws-activity-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ws-activity-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.6rem 0.5rem;
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
  }
  .ws-activity-row + .ws-activity-row {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-activity-row :global(figure) {
    flex: none;
  }
  .ws-activity-text {
    flex: 1;
    min-width: 0;
    padding-top: 0.2rem;
  }
  /* what no one needs to act on (an album linked, a Space renamed) reads quieter */
  .ws-activity-quiet {
    color: var(--immich-ui-muted);
  }
  .ws-activity-quiet .ws-activity-text {
    padding-top: 0;
  }
  .ws-activity-quiet .ws-activity-text p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-activity-time {
    flex: none;
    padding-top: 0.25rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-activity-quiet .ws-activity-time {
    padding-top: 0.1rem;
  }
  .ws-activity-photos {
    display: flex;
    gap: calc(var(--ws-gap) * 0.5);
    margin-top: 0.5rem;
  }
  .ws-activity-photo,
  .ws-activity-more {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--ws-radius);
  }
  .ws-activity-photo {
    object-fit: cover;
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
  }
  .ws-activity-more {
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    color: var(--immich-ui-muted);
  }
  .ws-activity-more-row {
    padding: 0.75rem 0 0;
  }
</style>
