<script lang="ts">
  import SpaceActivityFeed from '$lib/components/spaces/space-activity-feed.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { spaceUiManager } from '$lib/managers/space-ui-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { appendUniqueById } from '$lib/utils/people-utils';
  import { getSpaceActivities, SharedSpaceRole } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  const ACTIVITY_PAGE_SIZE = 20;

  let { data }: { data: PageData } = $props();
  const space = $derived(data.space);

  // Local Omarchy layer: what an empty feed offers, by what this member may do: an editor adds photos (the Space's
  // Photos opens in its add mode, as the bar's Add photos does), and the owner can bring someone in
  const role = $derived.by(() => {
    const userId = authManager.authenticated ? authManager.user.id : undefined;
    return data.members?.find((member) => member.userId === userId)?.role;
  });
  const isOwner = $derived(role === SharedSpaceRole.Owner);
  const isEditor = $derived(isOwner || role === SharedSpaceRole.Editor);

  let activities = $state(data.activities);
  let hasMoreActivities = $state(data.hasMoreActivities);
  let activityOffset = $state(data.activities.length);

  async function loadMoreActivities() {
    try {
      const result = await getSpaceActivities({ id: space.id, limit: ACTIVITY_PAGE_SIZE, offset: activityOffset });
      // Merged by id: this feed grows at the head, so anything written in the space while it is
      // open pushes the OFFSET boundary down and re-sends a row this page already holds -- and the
      // items are rendered in a keyed block, which a repeated id kills outright. The offset still
      // advances by what the SERVER returned, duplicates included; counting the merged rows instead
      // would skip a row on the next page for every duplicate dropped.
      activities = appendUniqueById(activities, result);
      activityOffset += result.length;
      hasMoreActivities = result.length === ACTIVITY_PAGE_SIZE;
    } catch (error) {
      handleError(error, $t('errors.error_loading_activities'));
    }
  }
</script>

<!-- Local Omarchy layer: on the page's gutter, headed like Shared's sections, where upstream centred a narrow column -->
<section
  class="ws-space-pane ws-space-column"
  aria-labelledby={activities.length > 0 ? 'space-activity-heading' : undefined}
>
  {#if activities.length > 0}
    <h2 class="ws-sharing-heading" id="space-activity-heading">{$t('spaces_recent_activity')}</h2>
  {/if}
  <div data-testid="space-activity">
    <SpaceActivityFeed {activities} onLoadMore={loadMoreActivities} hasMore={hasMoreActivities}>
      {#snippet emptyActions()}
        {#if isEditor}
          <a class="ws-empty-action" href="/spaces/{space.id}/photos" onclick={() => spaceUiManager.requestAddPhotos()}>
            {$t('add_photos')}
          </a>
        {/if}
        {#if isOwner}
          <a class="ws-empty-link" href="/spaces/{space.id}/members">{$t('invite_people')}</a>
        {/if}
      {/snippet}
    </SpaceActivityFeed>
  </div>
</section>
