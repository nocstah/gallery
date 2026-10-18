<script lang="ts">
  import { lazyComponent } from '$lib/utils/lazy-component.svelte';
  import { shortcuts } from '$lib/actions/shortcut';
  import DuplicateAsset from './DuplicateAsset.svelte';
  import Portal from '$lib/elements/Portal.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { handlePromiseError } from '$lib/utils';
  import { getAssetRatio, getNextAsset, getPreviousAsset } from '$lib/utils/asset-utils';
  import {
    computeDifferingMetadataFields,
    countDifferingMetadataItems,
    type DifferingMetadataFields,
  } from '$lib/utils/duplicate-utils';
  import { navigate } from '$lib/utils/navigation';
  import { getAssetInfo, type AssetResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiCheck, mdiChevronDown, mdiChevronUp, mdiImageMultipleOutline, mdiTrashCanOutline } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    assets: AssetResponseDto[];
    suggestedKeepAssetIds: string[];
    showMore: boolean;
    onResolve: (duplicateAssetIds: string[], trashIds: string[]) => void;
    onStack: (assets: AssetResponseDto[]) => void;
  }

  let { assets, suggestedKeepAssetIds, onResolve, onStack, showMore = $bindable() }: Props = $props();
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let selectedAssetIds = $state(new SvelteSet<string>());
  let trashCount = $derived(assets.length - selectedAssetIds.size);

  const InitialVisibleCount = 5;

  const differingMetadataFields: DifferingMetadataFields = $derived(computeDifferingMetadataFields(assets));
  const differingCount = $derived(countDifferingMetadataItems(differingMetadataFields));
  const hasMore = $derived(differingCount > InitialVisibleCount);
  // Local Omarchy layer: every tile of a group takes one shape, portrait or landscape after its first photo, so the
  // rows of details under them line up across the columns; portrait columns are narrower, so a tile stays in view
  const portrait = $derived(((assets[0] && getAssetRatio(assets[0])) ?? 1) < 1);

  onMount(() => {
    if (suggestedKeepAssetIds.length > 0) {
      for (const id of suggestedKeepAssetIds) {
        selectedAssetIds.add(id);
      }
      return;
    }

    if (assets.length > 0) {
      selectedAssetIds.add(assets[0].id);
    }
  });

  onDestroy(() => {
    assetViewerManager.showAssetViewer(false);
  });

  const onRandom = async () => {
    if (assets.length === 0) {
      return;
    }
    const index = Math.floor(Math.random() * assets.length);
    const asset = assets[index];
    await onViewAsset(asset);
    return { id: asset.id };
  };

  const onSelectAsset = (asset: AssetResponseDto) => {
    if (selectedAssetIds.has(asset.id)) {
      selectedAssetIds.delete(asset.id);
    } else {
      selectedAssetIds.add(asset.id);
    }
  };

  const onSelectNone = () => {
    selectedAssetIds.clear();
  };

  const onSelectAll = () => {
    selectedAssetIds = new SvelteSet(assets.map((asset) => asset.id));
  };

  const onViewAsset = async ({ id }: AssetResponseDto) => {
    const asset = await getAssetInfo({ ...authManager.params, id });
    assetViewerManager.setAsset(asset);
    await navigate({ targetRoute: 'current', assetId: asset.id });
  };

  const handleResolve = () => {
    const trashIds = assets.map((asset) => asset.id).filter((id) => !selectedAssetIds.has(id));
    const duplicateAssetIds = assets.map((asset) => asset.id);
    onResolve(duplicateAssetIds, trashIds);
  };

  const handleStack = () => {
    onStack(assets);
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

<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'a' }, onShortcut: onSelectAll },
    {
      shortcut: { key: 's' },
      onShortcut: () => onViewAsset(assets[0]),
    },
    { shortcut: { key: 'd' }, onShortcut: onSelectNone },
    { shortcut: { key: 'c', shift: true }, onShortcut: handleResolve },
    { shortcut: { key: 's', shift: true }, onShortcut: handleStack },
  ]}
/>

<!-- Local Omarchy layer: the group sits on the page's gutter, not in a centred card. A row of what to do comes first
     (mark every photo to keep or to the Trash; then Stack, and the action: ink to keep them all, the danger colour once
     it trashes), a hairline under it; then the photos side by side, each a tile over its rows of details -->
<section class="ws-dup">
  <div class="ws-dup-tools">
    <button type="button" class="ws-btn-quiet" onclick={onSelectAll}>
      <Icon icon={mdiCheck} size="16" />
      {$t('select_keep_all')}
    </button>
    <button type="button" class="ws-btn-quiet" onclick={onSelectNone}>
      <Icon icon={mdiTrashCanOutline} size="16" />
      {$t('select_trash_all')}
    </button>

    <span class="ws-dup-decide">
      <button type="button" class="ws-dup-outline" onclick={handleStack} disabled={selectedAssetIds.size !== 1}>
        <Icon icon={mdiImageMultipleOutline} size="16" />
        {$t('stack')}
      </button>
      {#if trashCount === 0}
        <button type="button" class="ws-btn" onclick={handleResolve}>
          <Icon icon={mdiCheck} size="16" />
          {$t('keep_all')}
        </button>
      {:else}
        <button type="button" class="ws-btn ws-dup-trash" onclick={handleResolve}>
          <Icon icon={mdiTrashCanOutline} size="16" />
          {trashCount === assets.length ? $t('trash_all') : $t('trash_count', { values: { count: trashCount } })}
        </button>
      {/if}
    </span>
  </div>

  <div
    class="ws-dup-columns"
    style:--ws-dup-ratio={portrait ? '3 / 4' : '4 / 3'}
    style:--ws-dup-column={portrait ? '24rem' : '32rem'}
  >
    {#each assets as asset (asset.id)}
      <DuplicateAsset
        {asset}
        {onSelectAsset}
        isSelected={selectedAssetIds.has(asset.id)}
        {onViewAsset}
        {differingMetadataFields}
        {showMore}
        initialVisibleCount={InitialVisibleCount}
      />
    {/each}
  </div>

  {#if hasMore}
    <button type="button" class="ws-btn-quiet ws-dup-more" onclick={() => (showMore = !showMore)}>
      <Icon icon={showMore ? mdiChevronUp : mdiChevronDown} size="16" />
      {showMore ? $t('show_less') : $t('show_more_fields', { values: { count: differingCount - InitialVisibleCount } })}
    </button>
  {/if}
</section>

{#if assetViewerManager.isViewing}
  {#if LazyAssetViewer.current}
    {@const AssetViewer = LazyAssetViewer.current}
    <Portal target="body">
      <AssetViewer
        cursor={assetCursor}
        showNavigation={assets.length > 1}
        {onRandom}
        onClose={() => {
          assetViewerManager.showAssetViewer(false);
          handlePromiseError(navigate({ targetRoute: 'current', assetId: null }));
        }}
      />
    </Portal>
  {/if}
{/if}

<style>
  /* as wide as its photos (at most the page), so the action at the row's end sits over the last photo's edge */
  .ws-dup {
    width: fit-content;
    max-width: 100%;
  }
  .ws-dup-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 2px;
    padding-bottom: calc(var(--ws-gap) * 0.8);
    margin-bottom: calc(var(--ws-gap) * 1.2);
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-dup-tools button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  /* a quiet button's icon starts on the gutter, over the first photo's edge */
  .ws-dup-tools > button:first-child {
    margin-inline-start: -0.6rem;
  }
  .ws-dup-decide {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-inline-start: auto;
  }
  .ws-dup-outline {
    padding: 0.5rem 0.95rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    white-space: nowrap;
  }
  .ws-dup-outline:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-dup-outline:disabled {
    opacity: 0.45;
    pointer-events: none;
  }
  .ws-dup-outline:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  /* the destructive action takes the danger role (omarchy-world.css), as Bank slips' Move to Trash does, under the
     surface's text; hovered it goes toward the ink */
  .ws-dup-trash {
    background: var(--ws-danger);
    color: var(--immich-ui-light);
  }
  .ws-dup-trash:hover {
    background: color-mix(in oklab, var(--ws-danger) 85%, var(--immich-ui-dark));
  }
  /* the photos side by side, each column up to 32rem (24rem for portrait photos), scrolling sideways when they do not
     fit */
  .ws-dup-columns {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, var(--ws-dup-column, 32rem));
    gap: var(--ws-gap);
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .ws-dup-more {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    margin-inline-start: -0.6rem;
  }
</style>
