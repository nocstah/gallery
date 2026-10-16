<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Action } from '$lib/components/asset-viewer/actions/action';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import EmptyState from '$lib/components/omarchy/EmptyState.svelte';
  import SharedFeedList from '$lib/components/omarchy/SharedFeed.svelte';
  import Portal from '$lib/elements/Portal.svelte';
  import { assetCacheManager } from '$lib/managers/AssetCacheManager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { SharedFeed } from '$lib/managers/shared-feed.svelte';
  import SpaceCreateModal from '$lib/modals/SpaceCreateModal.svelte';
  import { Route } from '$lib/route';
  import { AlbumFilter, albumViewSettings } from '$lib/stores/preferences.store';
  import { pinnedSpaceIds } from '$lib/stores/space-view.store';
  import type { HeaderButtonActionItem } from '$lib/types';
  import { handlePromiseError } from '$lib/utils';
  import { navigateToAsset } from '$lib/utils/asset-utils';
  import { lazyComponent } from '$lib/utils/lazy-component.svelte';
  import { navigate } from '$lib/utils/navigation';
  import { toFeedPerson, type FeedItem, type FeedPerson } from '$lib/utils/shared-feed';
  import { UserAvatarColor, type AssetResponseDto } from '@immich/sdk';
  import { modalManager } from '@immich/ui';
  import { mdiAccountOutline, mdiBookOpenOutline, mdiImageAlbum } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  // Local Omarchy layer: Shared as a feed (the owner's choice, "Shared as a feed"; DESIGN.md, Shared): newest first,
  // who added what to which Space or shared album, their comments and hearts, the photos new since this browser last
  // looked and the links I made (managers/shared-feed). Albums and Spaces stay in the sidebar; what it does not hold
  // (the shared albums as a list, every Space and making one, the partners' photos) is a quiet button in the bar.
  const me: FeedPerson = authManager.authenticated
    ? toFeedPerson(authManager.user)
    : {
        id: '',
        name: '',
        email: '',
        profileImagePath: '',
        avatarColor: UserAvatarColor.Primary,
        profileChangedAt: '',
      };
  const feed = new SharedFeed(me);

  onMount(() => {
    void feed.load();
  });

  // where sharing starts (the owner's "Family default target"): the Space the sidebar lists first, pinned ones first,
  // then the most recently active
  const firstSpace = $derived(
    [...feed.spaces].sort(
      (a, b) =>
        Number($pinnedSpaceIds.includes(b.id)) - Number($pinnedSpaceIds.includes(a.id)) ||
        (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') ||
        a.createdAt.localeCompare(b.createdAt),
    )[0],
  );

  const createSpace = async () => {
    const space = await modalManager.show(SpaceCreateModal, {});
    if (space) {
      await goto(Route.viewSpace({ id: space.id }));
    }
  };

  const openSharedAlbums = async () => {
    // the Albums page's own Shared filter, which lists every album shared by me or with me
    albumViewSettings.update((settings) => ({ ...settings, filter: AlbumFilter.Shared }));
    await goto(Route.albums());
  };

  const actions = $derived<HeaderButtonActionItem[]>([
    ...(feed.sharedAlbums.length > 0
      ? [{ title: $t('shared_albums'), icon: mdiImageAlbum, onAction: () => openSharedAlbums() }]
      : []),
    { title: $t('spaces'), icon: mdiBookOpenOutline, onAction: () => goto(Route.spaces()) },
    ...feed.partners.map((partner) => ({
      title: $t('partner_list_user_photos', { values: { user: partner.name } }),
      icon: mdiAccountOutline,
      onAction: () => goto(Route.viewPartner(partner)),
    })),
  ]);

  // the viewer steps through the photos of the item a photo was opened from (opened from a link instead: the first
  // item holding it), loading each neighbour as it comes up; a photo from a shared album opens with the album's
  // comments and hearts, as in the album
  let openedKey = $state<string>();
  const photoHref = (assetId: string) => `${Route.sharing()}/photos/${assetId}`;
  const openPhoto = (item: FeedItem) => {
    openedKey = item.key;
  };
  const viewing = $derived(
    assetViewerManager.asset ? feed.itemWith(assetViewerManager.asset.id, openedKey) : undefined,
  );
  const around = $derived(viewing?.photoIds ?? []);
  const viewerAlbum = $derived(
    viewing?.place.kind === 'album' ? feed.sharedAlbums.find(({ id }) => id === viewing.place.id) : undefined,
  );
  let neighbours = $state<{ next?: AssetResponseDto; previous?: AssetResponseDto }>({});
  $effect(() => {
    const id = assetViewerManager.asset?.id;
    const index = id ? around.indexOf(id) : -1;
    const load = (assetId?: string) =>
      assetId ? assetCacheManager.getAsset({ id: assetId }).catch(() => undefined) : Promise.resolve(undefined);
    let live = true;
    neighbours = {};
    void Promise.all([load(index === -1 ? undefined : around[index + 1]), load(around[index - 1])]).then(
      ([next, previous]) => {
        if (live) {
          neighbours = { next, previous };
        }
      },
    );
    return () => {
      live = false;
    };
  });
  const cursor = $derived({
    current: assetViewerManager.asset!,
    nextAsset: neighbours.next,
    previousAsset: neighbours.previous,
  });

  const closeViewer = () => {
    assetViewerManager.showAssetViewer(false);
    handlePromiseError(navigate({ targetRoute: 'current', assetId: null }));
  };

  const preAction = async ({ type }: Action) => {
    if (type === 'trash') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      (await navigateToAsset(cursor.nextAsset)) || (await navigateToAsset(cursor.previousAsset)) || closeViewer();
    }
  };

  // Mounting the viewer through `{#await}` leaves it permanently unreactive on reopen. See lazyComponent().
  const LazyAssetViewer = lazyComponent(() => import('$lib/components/asset-viewer/AssetViewer.svelte'));
</script>

<OnEvents onAssetsDelete={(assetIds) => feed.forget(assetIds)} />

<UserPageLayout title={data.meta.title} {actions}>
  <div class="ws-shared">
    {#if feed.loading}
      <p class="ws-shared-status ws-shared-waiting">{$t('loading')}</p>
    {:else}
      {#if feed.failures > 0}
        <p class="ws-shared-status" role="status">
          {$t('shared_feed_partial')}
          <button type="button" class="ws-inbox-link" onclick={() => void feed.load()}>{$t('retry')}</button>
        </p>
      {/if}
      {#if feed.items.length > 0}
        <SharedFeedList
          items={feed.items}
          meId={me.id}
          canShowMore={feed.canShowMore}
          onShowMore={() => void feed.showMore()}
          {photoHref}
          onOpenPhoto={openPhoto}
        />
      {:else if feed.failures === 0}
        <!-- nothing to show: with nothing shared at all, the step that starts sharing (an album into the family's
             Space, where sharing goes by default); with things shared, only that nothing has happened yet -->
        {#if !feed.nothingShared}
          <EmptyState title={$t('shared_feed_quiet_title')} body={$t('shared_feed_quiet_body')} />
        {:else if firstSpace}
          <EmptyState
            title={$t('shared_empty_title')}
            body={$t('shared_feed_empty_body', { values: { space: firstSpace.name } })}
            action={{
              label: $t('shared_feed_empty_action', { values: { space: firstSpace.name } }),
              href: Route.viewSpaceAlbums({ id: firstSpace.id }),
            }}
          />
        {:else}
          <EmptyState
            title={$t('shared_empty_title')}
            body={$t('shared_feed_empty_body_no_space')}
            action={{ label: $t('spaces_create'), onclick: createSpace }}
          />
        {/if}
      {/if}
    {/if}
  </div>
</UserPageLayout>

{#if assetViewerManager.isViewing}
  {#if LazyAssetViewer.current}
    {@const AssetViewer = LazyAssetViewer.current}
    <Portal target="body">
      <AssetViewer
        {cursor}
        showNavigation={around.length > 1}
        isShared={!!viewerAlbum}
        album={viewerAlbum}
        {preAction}
        onClose={closeViewer}
      />
    </Portal>
  {/if}
{/if}

<style>
  /* one gutter: the feed starts where the bar's title and the photo grids start */
  .ws-shared {
    color: var(--immich-ui-dark);
  }
  .ws-shared-status {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem 0.75rem;
    max-width: 60rem;
    padding: calc(var(--ws-gap) * 0.6) 0 0.75rem;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-ui);
  }
  /* the first look is usually there at once: say it is coming only when it is not */
  .ws-shared-waiting {
    animation: ws-shared-appear 1ms 400ms both;
  }
  @keyframes ws-shared-appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
