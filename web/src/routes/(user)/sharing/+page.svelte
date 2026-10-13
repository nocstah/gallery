<script lang="ts">
  import Albums from '$lib/components/album-page/AlbumsList.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { Route } from '$lib/route';
  import { getAlbumsActions } from '$lib/services/album.service';
  import { getSharedLinksActions } from '$lib/services/shared-link.service';
  import {
    AlbumFilter,
    AlbumGroupBy,
    AlbumSortBy,
    AlbumViewMode,
    SortOrder,
    type AlbumViewSettings,
  } from '$lib/stores/preferences.store';
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

  const { Create: CreateAlbum } = $derived(getAlbumsActions($t));
  const { ViewAll: ViewSharedLinks } = $derived(getSharedLinksActions($t));
</script>

<UserPageLayout title={data.meta.title} actions={[CreateAlbum, ViewSharedLinks]}>
  <!-- Local Omarchy layer: sections headed like the AI inbox's groups (name, count in data type), partners as rows,
       and no shared albums as an empty state with the next step instead of upstream's illustration -->
  <div class="ws-sharing">
    {#if data.partners.length > 0}
      <section class="ws-sharing-section">
        <h2 class="ws-sharing-heading">
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

    {#if data.sharedAlbums.length > 0}
      <section class="ws-sharing-section">
        <h2 class="ws-sharing-heading">
          {$t('albums')} <span class="ws-inbox-meta">{data.sharedAlbums.length}</span>
        </h2>
        <!-- Shared Album List -->
        <Albums sharedAlbums={data.sharedAlbums} userSettings={settings} showOwner />
      </section>
    {:else}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('sharing_empty_title')}</h2>
        <p class="ws-empty-body">{$t('no_shared_albums_message')}</p>
        <div class="ws-empty-actions">
          <button
            type="button"
            class="ws-empty-action"
            onclick={(event: MouseEvent) => CreateAlbum.onAction({ event, action: CreateAlbum })}
          >
            {CreateAlbum.title}
          </button>
          <a class="ws-empty-link" href={Route.sharedLinks()}>{$t('shared_links')}</a>
        </div>
      </div>
    {/if}
  </div>
</UserPageLayout>
