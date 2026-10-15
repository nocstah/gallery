<script lang="ts">
  import { lazyComponent } from '$lib/utils/lazy-component.svelte';
  import type { Action } from '$lib/components/asset-viewer/actions/action';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import LargeAssetData from './LargeAssetData.svelte';
  import Portal from '$lib/elements/Portal.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { handlePromiseError } from '$lib/utils';
  import { getNextAsset, getPreviousAsset, navigateToAsset } from '$lib/utils/asset-utils';
  import { navigate } from '$lib/utils/navigation';
  import { Route } from '$lib/route';
  import type { AssetResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let assets = $state(data.assets);
  let asset = $derived(data.asset);

  $effect(() => {
    if (asset) {
      assetViewerManager.setAsset(asset);
    }
  });

  const onRandom = async () => {
    if (assets.length === 0) {
      return undefined;
    }
    const index = Math.floor(Math.random() * assets.length);
    const asset = assets[index];
    await onViewAsset(asset);
    return asset;
  };

  const preAction = async (payload: Action) => {
    if (payload.type === 'trash') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      (await navigateToAsset(assetCursor?.nextAsset)) ||
        (await navigateToAsset(assetCursor?.previousAsset)) ||
        assetViewerManager.showAssetViewer(false);
    }
  };

  const onAssetsDelete = (assetIds: string[]) => {
    assets = assets.filter(({ id }) => !assetIds.includes(id));
  };

  const onViewAsset = async (asset: AssetResponseDto) => {
    await navigate({ targetRoute: 'current', assetId: asset.id });
  };

  const assetCursor = $derived({
    current: assetViewerManager.asset!,
    nextAsset: getNextAsset(assets, assetViewerManager.asset),
    previousAsset: getPreviousAsset(assets, assetViewerManager.asset),
  });

  // Mounting the viewer through `{#await}` leaves it permanently unreactive on reopen.
  // See lazyComponent().
  const LazyAssetViewer = lazyComponent(() => import('$lib/components/asset-viewer/AssetViewer.svelte'));
</script>

<OnEvents {onAssetsDelete} />

<UserPageLayout title={data.meta.title} scrollbar={true}>
  <!-- Local Omarchy layer: square photo tiles on the desktop's gap from the page's gutter, biggest first; with none, an
       empty state that says what would be here -->
  {#if assets && assets.length > 0}
    <div class="ws-large-grid">
      {#each assets as asset (asset.id)}
        <LargeAssetData {asset} {onViewAsset} />
      {/each}
    </div>
  {:else}
    <div class="ws-page-column">
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('nothing_here_yet')}</h2>
        <p class="ws-empty-body">{$t('large_files_empty_body')}</p>
        <div class="ws-empty-actions">
          <a class="ws-empty-action" href={Route.photos()}>{$t('photos')}</a>
        </div>
      </div>
    </div>
  {/if}
</UserPageLayout>

{#if assetViewerManager.isViewing}
  {#if LazyAssetViewer.current}
    {@const AssetViewer = LazyAssetViewer.current}
    <Portal target="body">
      <AssetViewer
        cursor={assetCursor}
        showNavigation={assets.length > 1}
        {onRandom}
        {preAction}
        onClose={() => {
          assetViewerManager.showAssetViewer(false);
          handlePromiseError(navigate({ targetRoute: 'current', assetId: null }));
        }}
      />
    </Portal>
  {/if}
{/if}

<style>
  .ws-large-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--ws-gap);
    padding-bottom: 4rem;
  }
  @media (max-width: 639px) {
    .ws-large-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
