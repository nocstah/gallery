<script lang="ts">
  import { goto } from '$app/navigation';
  import Albums from '$lib/components/album-page/AlbumsList.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import SpaceCreateModal from '$lib/modals/SpaceCreateModal.svelte';
  import { Route } from '$lib/route';
  import { getSharedLinksActions } from '$lib/services/shared-link.service';
  import {
    AlbumFilter,
    AlbumGroupBy,
    AlbumSortBy,
    AlbumViewMode,
    SortOrder,
    type AlbumViewSettings,
  } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { modalManager } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const settings: AlbumViewSettings = {
    view: AlbumViewMode.Cover,
    filter: AlbumFilter.Shared,
    groupBy: AlbumGroupBy.None,
    groupOrder: SortOrder.Desc,
    sortBy: AlbumSortBy.MostRecentPhoto,
    sortOrder: SortOrder.Desc,
    collapsedGroups: {},
  };

  const { ViewAll: ViewSharedLinks } = $derived(getSharedLinksActions($t));

  const createSpace = async () => {
    const space = await modalManager.show(SpaceCreateModal, {});
    if (space) {
      await goto(Route.viewSpace({ id: space.id }));
    }
  };

  const nothingShared = $derived(
    data.sharedAlbums.length === 0 && data.spaces.length === 0 && data.partners.length === 0,
  );
</script>

<UserPageLayout title={data.meta.title} actions={[ViewSharedLinks]}>
  <!-- Local Omarchy layer (plan A): Shared, everything shared in one place, as the Mac keeps Shared Albums beside My
       Albums. Sections headed like the AI inbox's groups (name, count in data type): the shared albums, the Spaces
       (libraries shared with family), the partners; with nothing shared yet, one empty state with the next steps -->
  <div class="ws-sharing">
    {#if nothingShared}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('shared_empty_title')}</h2>
        <p class="ws-empty-body">{$t('shared_empty_body')}</p>
        <div class="ws-empty-actions">
          <a class="ws-empty-action" href={Route.albums()}>{$t('albums')}</a>
          <button type="button" class="ws-empty-link" onclick={createSpace}>{$t('spaces_create')}</button>
        </div>
      </div>
    {:else}
      <section class="ws-sharing-section" aria-labelledby="shared-albums">
        <h2 class="ws-sharing-heading" id="shared-albums">
          {$t('shared_albums')} <span class="ws-inbox-meta">{data.sharedAlbums.length}</span>
        </h2>
        {#if data.sharedAlbums.length > 0}
          <Albums sharedAlbums={data.sharedAlbums} userSettings={settings} showOwner />
        {:else}
          <p class="ws-sharing-none">{$t('shared_albums_empty')}</p>
        {/if}
      </section>

      <section class="ws-sharing-section" aria-labelledby="shared-spaces">
        <h2 class="ws-sharing-heading" id="shared-spaces">
          {$t('spaces')} <span class="ws-inbox-meta">{data.spaces.length}</span>
          <button type="button" class="ws-sharing-heading-action" onclick={createSpace}>{$t('spaces_create')}</button>
        </h2>
        {#if data.spaces.length > 0}
          <ul class="ws-sharing-partners">
            {#each data.spaces as space (space.id)}
              <li>
                <a
                  href={Route.viewSpace({ id: space.id })}
                  class="ws-sharing-partner"
                  data-testid="shared-space-{space.id}"
                >
                  <span
                    class="ws-sharing-space-cover"
                    style:background-image={space.thumbnailAssetId
                      ? `url('${getAssetMediaUrl({ id: space.thumbnailAssetId })}')`
                      : undefined}
                  ></span>
                  <span class="ws-sharing-partner-text">
                    <span class="ws-sharing-partner-name">{space.name}</span>
                    <span class="ws-inbox-meta">
                      {$t('group_member_count', { values: { count: space.memberCount ?? 1 } })} · {$t(
                        'space_album_count',
                        { values: { count: space.albumCount ?? 0 } },
                      )}
                    </span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="ws-sharing-none">{$t('spaces_empty')}</p>
        {/if}
      </section>

      {#if data.partners.length > 0}
        <section class="ws-sharing-section" aria-labelledby="shared-partners">
          <h2 class="ws-sharing-heading" id="shared-partners">
            {$t('partners')} <span class="ws-inbox-meta">{data.partners.length}</span>
          </h2>
          <ul class="ws-sharing-partners">
            {#each data.partners as partner (partner.id)}
              <li>
                <a href={Route.viewPartner(partner)} class="ws-sharing-partner">
                  <UserAvatar user={partner} size="lg" />
                  <span class="ws-sharing-partner-text">
                    <span class="ws-sharing-partner-name">{partner.name}</span>
                    <span class="ws-inbox-meta">{partner.email}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}
  </div>
</UserPageLayout>
