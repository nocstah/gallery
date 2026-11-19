<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import SharedLinkRow from '#lib/components/omarchy/SharedLinkRow.svelte';
  import { type SharedLinkTab } from '#lib/constants.ts';
  import GroupTab from '#lib/elements/GroupTab.svelte';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getAllSharedLinksQuery } from '#lib/queries/shared-link.query.ts';
  import { Route } from '#lib/route.ts';
  import { SharedLinkType } from '@immich/sdk';
  import { type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { page, type ReadonlyURLSearchParams } from '$app/state';
  import type { LayoutData } from './$types';

  type Props = {
    children?: Snippet;
    data: LayoutData;
  };

  const { children, data }: Props = $props();

  const query = createPreloadedQuery(getAllSharedLinksQuery);
  const sharedLinks = $derived(query.data);

  // Local Omarchy layer: the links that are not an album's are photos (a memory's among them), not "Individual shares"
  const filterMap: Record<SharedLinkTab, string> = {
    all: $t('all'),
    album: $t('albums'),
    individual: $t('photos'),
  };

  let filters = Object.keys(filterMap);
  let labels = Object.values(filterMap);

  const getActiveTab = (url: { searchParams: ReadonlyURLSearchParams | URLSearchParams }) => {
    const filter = url.searchParams.get('filter');
    return filter && filters.includes(filter) ? filter : 'all';
  };

  let selectedTab = $derived(getActiveTab(page.url));

  let filteredSharedLinks = $derived(
    sharedLinks.filter(
      ({ type }) =>
        selectedTab === 'all' ||
        (type === SharedLinkType.Album && selectedTab === 'album') ||
        (type === SharedLinkType.Individual && selectedTab === 'individual'),
    ),
  );
</script>

<UserPageLayout title={data.meta.title}>
  {#snippet buttons()}
    <div class="hidden h-10 xl:block">
      <GroupTab
        label={$t('show_shared_links')}
        {filters}
        {labels}
        selected={selectedTab}
        onSelect={(value) => goto(Route.sharedLinks({ filter: value as SharedLinkTab }))}
      />
    </div>
  {/snippet}

  <!-- Local Omarchy layer: one column on the page's gutter, a calm row per link (components/omarchy/SharedLinkRow); no
       links yet is an empty state with where links come from -->
  <div class="ws-page-column">
    {#if sharedLinks.length === 0}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('you_dont_have_any_shared_links')}</h2>
        <p class="ws-empty-body">{$t('shared_links_empty_body')}</p>
        <div class="ws-empty-actions">
          <a class="ws-empty-link" href={Route.albums()}>{$t('albums')}</a>
        </div>
      </div>
    {:else}
      <ul class="ws-link-list">
        {#each filteredSharedLinks as sharedLink (sharedLink.id)}
          <SharedLinkRow {sharedLink} />
        {/each}
      </ul>
    {/if}

    {@render children?.()}
  </div>
</UserPageLayout>
